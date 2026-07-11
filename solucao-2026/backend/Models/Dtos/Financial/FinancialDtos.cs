using System.ComponentModel.DataAnnotations;

namespace Solucao.Backend.Models.Dtos.Financial;

public record FinancialTransactionDto(
    Guid Id,
    string Type,            // income | expense
    string Description,
    decimal Amount,
    DateOnly TransactionDate,
    DateOnly? DueDate,
    DateTime? PaidAt,
    string? Category,
    string Status,          // pending | paid | cancelled | overdue
    Guid? SupplierId,
    Guid? SaleId,
    string? PaymentMethod,
    string? Notes);

public record CreateFinancialTransactionRequest(
    [Required] string Type,
    [Required, StringLength(255)] string Description,
    [Range(0, 9999999.99)] decimal Amount,
    DateOnly TransactionDate,
    DateOnly? DueDate,
    string? Category,
    string Status,
    Guid? SupplierId,
    string? PaymentMethod,
    string? Notes);

public record UpdateFinancialTransactionRequest(
    [Required] string Type,
    [Required, StringLength(255)] string Description,
    [Range(0, 9999999.99)] decimal Amount,
    DateOnly TransactionDate,
    DateOnly? DueDate,
    string? Category,
    string Status,
    Guid? SupplierId,
    string? PaymentMethod,
    string? Notes);

public record FinancialListResponse(
    IReadOnlyList<FinancialTransactionDto> Items,
    int Page, int PageSize, int TotalCount, int TotalPages);

public record FinancialSummaryDto(
    decimal TotalIncome,
    decimal TotalExpense,
    decimal Pending,
    decimal NetResult,
    decimal AverageMargin,          // % across active products
    decimal StockSaleValue,         // SUM(stock_quantity * sale_price)
    decimal StockCostValue,         // SUM(stock_quantity * cost_price)
    decimal Roi,                    // (netResult / stockCostValue) * 100
    IReadOnlyList<DailyFinancialPointDto> CashflowLast7Days,
    IReadOnlyList<CategoryExpenseDto> ExpensesByCategory);

public record DailyFinancialPointDto(DateOnly Date, decimal Income, decimal Expense);
public record CategoryExpenseDto(string Category, decimal Total);
