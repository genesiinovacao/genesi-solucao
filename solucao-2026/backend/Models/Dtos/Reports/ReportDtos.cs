namespace Solucao.Backend.Models.Dtos.Reports;

public record SalesOverviewDto(
    int PeriodDays,
    DateOnly From,
    DateOnly To,
    decimal TotalRevenue,
    int TotalSalesCount,
    decimal AverageTicket,
    DateOnly? BestDay,
    decimal BestDayRevenue,
    IReadOnlyList<DailyRevenueDto> DailySeries,
    IReadOnlyList<TopProductDto> TopProducts,
    IReadOnlyList<TopCustomerDto> TopCustomers,
    IReadOnlyList<CategoryPerformanceDto> ByCategory);

public record DailyRevenueDto(DateOnly Date, decimal Total, int SalesCount, decimal ChangePercent);
public record TopProductDto(string Name, decimal Quantity, decimal Revenue);
public record TopCustomerDto(Guid? Id, string Name, decimal TotalSpent, int Purchases);
public record CategoryPerformanceDto(string Category, decimal Revenue, decimal Percent);
