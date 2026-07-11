namespace Solucao.Backend.Models.Dtos.Dashboard;

public record DashboardSummaryDto(
    decimal SalesToday,
    int SalesCountToday,
    decimal AverageTicketToday,
    decimal SalesYesterday,
    decimal SalesChangePercent,       // (today - yesterday) / yesterday * 100
    int LowStockCount,
    int CustomerCount,
    int ActiveDeliveries,
    IReadOnlyList<DailySalesPointDto> SalesLast7Days,
    IReadOnlyList<CategorySalesDto> SalesByCategory,
    IReadOnlyList<LowStockProductDto> LowStockProducts);

public record DailySalesPointDto(DateOnly Date, decimal Total, int Count);
public record CategorySalesDto(string Category, decimal Total);
public record LowStockProductDto(Guid Id, string Name, decimal StockQuantity, decimal MinStock, string? Emoji);
