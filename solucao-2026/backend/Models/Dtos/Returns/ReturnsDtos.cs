namespace Solucao.Backend.Models.Dtos.Returns;

public record SaleReturnLineRequest(Guid SaleItemId, decimal Quantity);

public record CreateSaleReturnRequest(
    List<SaleReturnLineRequest> Items,
    string RefundMethod,   // 'cash' | 'pix' | 'credit' | 'customer_credit'
    string? Reason,
    // Devolução feita pelo caixa exige aval: código e PIN do gerente
    string? SupervisorCode = null,
    string? SupervisorPin = null);

public record SaleReturnItemDto(
    Guid Id,
    Guid SaleItemId,
    Guid? ProductId,
    string ProductName,
    decimal QuantityReturned,
    decimal UnitPrice,
    decimal RefundAmount);

public record SaleReturnDto(
    Guid Id,
    Guid SaleId,
    Guid? CustomerId,
    string? CustomerName,
    decimal TotalRefund,
    string RefundMethod,
    string? Reason,
    bool IsPartial,
    DateTime CreatedAt,
    string SaleStatusAfter,         // updated sale.status
    decimal? CustomerCreditAfter,   // se refundMethod = customer_credit
    List<SaleReturnItemDto> Items);
