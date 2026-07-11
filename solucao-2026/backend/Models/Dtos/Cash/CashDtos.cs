using System.ComponentModel.DataAnnotations;

namespace Solucao.Backend.Models.Dtos.Cash;

public record CashSessionDto(
    Guid Id,
    Guid UserId,
    string UserName,
    string? PosTerminalId,
    DateTime OpenedAt,
    decimal OpeningAmount,
    DateTime? ClosedAt,
    decimal? ClosingAmount,
    decimal? ExpectedAmount,
    decimal? Difference,
    string? Notes);

public record OpenCashRequest(
    [Range(0, 9999999.99)] decimal OpeningAmount,
    string? PosTerminalId);

public record CloseCashRequest(
    [Range(0, 9999999.99)] decimal ClosingAmount,
    string? Notes);

public record CashMovementDto(
    Guid Id,
    string Type,
    decimal Amount,
    string? Reason,
    DateTime CreatedAt);

public record CashMovementRequest(
    [Required] string Type,              // supply | withdraw
    [Range(0.01, 9999999.99)] decimal Amount,
    string? Reason);

public record CashSessionSummaryDto(
    Guid SessionId,
    DateTime OpenedAt,
    DateTime? ClosedAt,
    decimal OpeningAmount,
    decimal CashSales,                   // soma de vendas em dinheiro
    decimal TotalSales,                  // soma de TODAS as vendas
    int SalesCount,
    decimal Supplies,                    // entradas de caixa
    decimal Withdraws,                   // sangrias
    decimal ExpectedCash,                // opening + cashSales + supplies - withdraws
    IReadOnlyDictionary<string, decimal> SalesByMethod);
