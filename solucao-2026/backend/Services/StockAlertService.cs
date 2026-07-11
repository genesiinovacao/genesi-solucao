using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Solucao.Backend.Data;
using Solucao.Backend.Hubs;

namespace Solucao.Backend.Services;

public record LowStockAlert(
    Guid ProductId,
    string Name,
    decimal StockQuantity,
    decimal MinStock,
    decimal AvgDailySales,
    decimal? DaysRemaining);

public interface IStockAlertService
{
    /// <summary>
    /// Verifica os produtos informados e envia alerta SignalR ("LowStock")
    /// para o grupo do tenant com os que estão críticos: estoque abaixo do
    /// mínimo OU projeção de ruptura em até 3 dias (média de vendas de 30 dias).
    /// </summary>
    Task CheckAndNotifyAsync(Guid tenantId, IReadOnlyCollection<Guid> productIds, CancellationToken ct);
}

public sealed class StockAlertService : IStockAlertService
{
    private const int AvgWindowDays = 30;
    private const decimal CriticalDaysRemaining = 3m;

    private readonly AppDbContext _db;
    private readonly IHubContext<StockHub> _hub;
    private readonly ILogger<StockAlertService> _log;

    public StockAlertService(AppDbContext db, IHubContext<StockHub> hub, ILogger<StockAlertService> log)
    {
        _db = db;
        _hub = hub;
        _log = log;
    }

    public async Task CheckAndNotifyAsync(Guid tenantId, IReadOnlyCollection<Guid> productIds, CancellationToken ct)
    {
        if (productIds.Count == 0) return;

        var products = await _db.Products.AsNoTracking()
            .Where(p => productIds.Contains(p.Id) && p.IsActive)
            .Select(p => new { p.Id, p.Name, p.StockQuantity, p.MinStock })
            .ToListAsync(ct);
        if (products.Count == 0) return;

        var since = DateTime.UtcNow.AddDays(-AvgWindowDays);
        var soldByProduct = await _db.SaleItems.AsNoTracking()
            .Join(_db.Sales.AsNoTracking().Where(s => s.Status == "completed" && s.SaleDate >= since),
                  si => si.SaleId, s => s.Id, (si, s) => si)
            .Where(si => si.ProductId != null && productIds.Contains(si.ProductId!.Value))
            .GroupBy(si => si.ProductId!.Value)
            .Select(g => new { ProductId = g.Key, Quantity = g.Sum(x => x.Quantity) })
            .ToDictionaryAsync(x => x.ProductId, x => x.Quantity, ct);

        var alerts = new List<LowStockAlert>();
        foreach (var p in products)
        {
            var avgDaily = Math.Round(soldByProduct.GetValueOrDefault(p.Id) / AvgWindowDays, 3);
            decimal? daysRemaining = avgDaily > 0
                ? Math.Round(Math.Max(p.StockQuantity, 0) / avgDaily, 1)
                : null;

            var belowMin = p.StockQuantity <= p.MinStock;
            var runningOut = daysRemaining is { } d && d <= CriticalDaysRemaining;
            if (belowMin || runningOut)
                alerts.Add(new LowStockAlert(p.Id, p.Name, p.StockQuantity, p.MinStock, avgDaily, daysRemaining));
        }

        if (alerts.Count == 0) return;

        await _hub.Clients.Group(StockHub.TenantGroup(tenantId))
            .SendAsync("LowStock", alerts, ct);

        _log.LogInformation("LowStock: {Count} alerta(s) enviados para tenant {TenantId}", alerts.Count, tenantId);
    }
}
