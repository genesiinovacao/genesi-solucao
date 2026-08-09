using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Solucao.Backend.Data;
using Solucao.Backend.Models.Dtos.Dashboard;

namespace Solucao.Backend.Controllers;

[ApiController]
[Authorize]
[Route("api/dashboard")]
public class DashboardController : ControllerBase
{
    private readonly AppDbContext _db;
    public DashboardController(AppDbContext db) => _db = db;

    [HttpGet("summary")]
    public async Task<ActionResult<DashboardSummaryDto>> Summary(CancellationToken ct)
    {
        var today = DateTime.UtcNow.Date;
        var yesterday = today.AddDays(-1);
        var sevenDaysAgo = today.AddDays(-6); // include today

        // Today
        var todaySales = await _db.Sales.AsNoTracking()
            .Where(s => s.Status == "completed" && s.SaleDate >= today && s.SaleDate < today.AddDays(1))
            .Select(s => new { s.TotalAmount })
            .ToListAsync(ct);

        var salesToday = todaySales.Sum(s => s.TotalAmount);
        var salesCountToday = todaySales.Count;
        var averageTicket = salesCountToday > 0 ? salesToday / salesCountToday : 0m;

        // Yesterday
        var salesYesterday = await _db.Sales.AsNoTracking()
            .Where(s => s.Status == "completed" && s.SaleDate >= yesterday && s.SaleDate < today)
            .SumAsync(s => (decimal?)s.TotalAmount, ct) ?? 0m;

        var changePercent = salesYesterday > 0
            ? Math.Round((salesToday - salesYesterday) / salesYesterday * 100m, 2)
            : 0m;

        // Last 7 days series (one row per day, zero-filled)
        var last7Raw = await _db.Sales.AsNoTracking()
            .Where(s => s.Status == "completed" && s.SaleDate >= sevenDaysAgo && s.SaleDate < today.AddDays(1))
            .GroupBy(s => s.SaleDate.Date)
            .Select(g => new { Date = g.Key, Total = g.Sum(x => x.TotalAmount), Count = g.Count() })
            .ToListAsync(ct);

        var byDate = last7Raw.ToDictionary(r => DateOnly.FromDateTime(r.Date), r => (r.Total, r.Count));
        var sales7Days = new List<DailySalesPointDto>();
        for (var d = 0; d < 7; d++)
        {
            var date = DateOnly.FromDateTime(sevenDaysAgo.AddDays(d));
            if (byDate.TryGetValue(date, out var v))
                sales7Days.Add(new DailySalesPointDto(date, v.Total, v.Count));
            else
                sales7Days.Add(new DailySalesPointDto(date, 0m, 0));
        }

        // Sales by category (last 30 days, completed) — done in 2 queries + memory join
        // because EF Core 9 doesn't translate LEFT JOIN + null propagation cleanly here.
        var thirtyDaysAgo = today.AddDays(-29);
        var saleIdsLast30 = await _db.Sales.AsNoTracking()
            .Where(s => s.Status == "completed" && s.SaleDate >= thirtyDaysAgo)
            .Select(s => s.Id)
            .ToListAsync(ct);

        var saleItemsLast30 = saleIdsLast30.Count == 0
            ? new List<(Guid? ProductId, decimal TotalPrice)>()
            : (await _db.SaleItems.AsNoTracking()
                    .Where(si => saleIdsLast30.Contains(si.SaleId))
                    .Select(si => new { si.ProductId, si.TotalPrice })
                    .ToListAsync(ct))
                .Select(x => (ProductId: (Guid?)x.ProductId, TotalPrice: x.TotalPrice))
                .ToList();

        var productIds = saleItemsLast30.Where(x => x.ProductId != null).Select(x => x.ProductId!.Value).Distinct().ToList();
        var productCategories = productIds.Count == 0
            ? new Dictionary<Guid, string?>()
            : await _db.Products.AsNoTracking()
                .Where(p => productIds.Contains(p.Id))
                .ToDictionaryAsync(p => p.Id, p => p.Category, ct);

        var byCategory = saleItemsLast30
            .GroupBy(x => x.ProductId.HasValue
                ? (productCategories.GetValueOrDefault(x.ProductId.Value) ?? "Sem categoria")
                : "Outros")
            .Select(g => new CategorySalesDto(g.Key, g.Sum(x => x.TotalPrice)))
            .OrderByDescending(c => c.Total)
            .Take(8)
            .ToList();

        // Low stock products
        var lowStock = await _db.Products.AsNoTracking()
            .Where(p => p.IsActive && p.StockQuantity <= p.MinStock)
            .OrderBy(p => p.StockQuantity)
            .Take(10)
            .Select(p => new LowStockProductDto(p.Id, p.Name, p.StockQuantity, p.MinStock, p.Emoji))
            .ToListAsync(ct);

        var lowStockCount = await _db.Products.AsNoTracking()
            .CountAsync(p => p.IsActive && p.StockQuantity <= p.MinStock, ct);

        // Saldo negativo: vendido sem estoque, esperando entrada de nota
        var negativeStock = await _db.Products.AsNoTracking()
            .Where(p => p.IsActive && p.StockQuantity < 0)
            .OrderBy(p => p.StockQuantity)
            .Take(10)
            .Select(p => new LowStockProductDto(p.Id, p.Name, p.StockQuantity, p.MinStock, p.Emoji))
            .ToListAsync(ct);

        var negativeStockCount = await _db.Products.AsNoTracking()
            .CountAsync(p => p.IsActive && p.StockQuantity < 0, ct);

        var customerCount = await _db.Customers.AsNoTracking()
            .CountAsync(c => c.Status == "active", ct);

        var activeDeliveries = await _db.DeliveryOrders.AsNoTracking()
            .CountAsync(d => d.Status == "pending" || d.Status == "preparing" || d.Status == "out_for_delivery", ct);

        return Ok(new DashboardSummaryDto(
            salesToday, salesCountToday, averageTicket,
            salesYesterday, changePercent,
            lowStockCount, customerCount, activeDeliveries,
            sales7Days, byCategory, lowStock,
            negativeStockCount, negativeStock));
    }
}
