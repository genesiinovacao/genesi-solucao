using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Solucao.Backend.Data;
using Solucao.Backend.Models.Dtos.Reports;

namespace Solucao.Backend.Controllers;

[ApiController]
[Authorize]
[Route("api/reports")]
public class ReportsController : ControllerBase
{
    private readonly AppDbContext _db;
    public ReportsController(AppDbContext db) => _db = db;

    [HttpGet("sales-overview")]
    public async Task<ActionResult<SalesOverviewDto>> SalesOverview(
        [FromQuery] int period = 7,
        CancellationToken ct = default)
    {
        if (period <= 0) period = 7;
        if (period > 365) period = 365;

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var from  = today.AddDays(-(period - 1));
        var fromDt = DateTime.SpecifyKind(from.ToDateTime(TimeOnly.MinValue), DateTimeKind.Utc);
        var toDt   = DateTime.SpecifyKind(today.AddDays(1).ToDateTime(TimeOnly.MinValue), DateTimeKind.Utc);

        // ---- Sales in the period --------------------------------------------
        var sales = await _db.Sales.AsNoTracking()
            .Where(s => s.Status == "completed" && s.SaleDate >= fromDt && s.SaleDate < toDt)
            .Select(s => new { s.Id, s.SaleDate, s.TotalAmount, s.CustomerId })
            .ToListAsync(ct);

        var totalRevenue = sales.Sum(s => s.TotalAmount);
        var totalCount = sales.Count;
        var avgTicket = totalCount > 0 ? totalRevenue / totalCount : 0m;

        // ---- Daily series (zero-filled) -------------------------------------
        var byDay = sales.GroupBy(s => DateOnly.FromDateTime(s.SaleDate))
                         .ToDictionary(g => g.Key, g => (Total: g.Sum(x => x.TotalAmount), Count: g.Count()));

        var dailySeries = new List<DailyRevenueDto>(period);
        decimal? prev = null;
        for (int d = 0; d < period; d++)
        {
            var date = from.AddDays(d);
            var total = byDay.TryGetValue(date, out var v) ? v.Total : 0m;
            var count = byDay.TryGetValue(date, out var v2) ? v2.Count : 0;
            var change = (prev is { } pv && pv > 0)
                ? Math.Round((total - pv) / pv * 100m, 2)
                : 0m;
            dailySeries.Add(new DailyRevenueDto(date, total, count, change));
            prev = total;
        }

        // Best day
        DateOnly? bestDay = null;
        decimal bestRev = 0m;
        foreach (var p in dailySeries)
            if (p.Total > bestRev) { bestRev = p.Total; bestDay = p.Date; }

        // ---- Top products (5) -----------------------------------------------
        var saleIds = sales.Select(s => s.Id).ToList();
        var saleItems = saleIds.Count == 0
            ? new List<dynamic>()
            : (await _db.SaleItems.AsNoTracking()
                    .Where(si => saleIds.Contains(si.SaleId))
                    .Select(si => new { si.ProductName, si.ProductId, si.Quantity, si.TotalPrice })
                    .ToListAsync(ct))
                .Cast<dynamic>()
                .ToList();

        var topProducts = saleItems
            .GroupBy(x => (string)x.ProductName)
            .Select(g => new TopProductDto(
                g.Key,
                g.Sum(x => (decimal)x.Quantity),
                g.Sum(x => (decimal)x.TotalPrice)))
            .OrderByDescending(p => p.Revenue)
            .Take(5)
            .ToList();

        // ---- Top customers (5) ----------------------------------------------
        var customerSales = sales
            .Where(s => s.CustomerId != null)
            .GroupBy(s => s.CustomerId!.Value)
            .Select(g => new { CustomerId = g.Key, Total = g.Sum(x => x.TotalAmount), Count = g.Count() })
            .OrderByDescending(c => c.Total)
            .Take(5)
            .ToList();

        var customerIds = customerSales.Select(c => c.CustomerId).ToList();
        var customerNames = customerIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await _db.Customers.AsNoTracking()
                .Where(c => customerIds.Contains(c.Id))
                .ToDictionaryAsync(c => c.Id, c => c.Name, ct);

        var topCustomers = customerSales
            .Select(c => new TopCustomerDto(
                c.CustomerId,
                customerNames.GetValueOrDefault(c.CustomerId, "—"),
                c.Total, c.Count))
            .ToList();

        // ---- By category ----------------------------------------------------
        var productIds = saleItems
            .Where(x => x.ProductId != null)
            .Select(x => (Guid)x.ProductId!)
            .Distinct().ToList();

        var productCategories = productIds.Count == 0
            ? new Dictionary<Guid, string?>()
            : await _db.Products.AsNoTracking()
                .Where(p => productIds.Contains(p.Id))
                .ToDictionaryAsync(p => p.Id, p => p.Category, ct);

        static string ResolveCategory(Guid? productId, Dictionary<Guid, string?> map)
        {
            if (productId is null) return "Sem categoria";
            return map.TryGetValue(productId.Value, out var c) ? (c ?? "Sem categoria") : "Sem categoria";
        }

        var byCategoryGroups = saleItems
            .Select(x => new
            {
                Category = ResolveCategory((Guid?)x.ProductId, productCategories),
                Revenue = (decimal)x.TotalPrice,
            })
            .GroupBy(x => x.Category)
            .Select(g => new { Category = g.Key, Revenue = g.Sum(x => x.Revenue) })
            .OrderByDescending(c => c.Revenue)
            .ToList();

        var totalItemRevenue = byCategoryGroups.Sum(c => c.Revenue);
        var byCategory = byCategoryGroups
            .Select(c => new CategoryPerformanceDto(
                c.Category,
                c.Revenue,
                totalItemRevenue > 0 ? Math.Round(c.Revenue / totalItemRevenue * 100m, 2) : 0m))
            .ToList();

        return Ok(new SalesOverviewDto(
            period, from, today,
            totalRevenue, totalCount, avgTicket,
            bestDay, bestRev,
            dailySeries, topProducts, topCustomers, byCategory));
    }
}
