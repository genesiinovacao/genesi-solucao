namespace Solucao.Backend.Models.Dtos.Sales;

public record SaleListItemDto(
    Guid Id,
    DateTime SaleDate,
    string? CustomerName,
    int ItemCount,
    decimal TotalAmount,
    string PaymentMethod,
    string Status);

public record SaleDetailDto(
    Guid Id,
    DateTime SaleDate,
    Guid? CustomerId,
    string? CustomerName,
    decimal Subtotal,
    decimal DiscountAmount,
    decimal TotalAmount,
    string PaymentMethod,
    decimal? AmountReceived,
    decimal? ChangeAmount,
    string Status,
    IReadOnlyList<SaleItemDto> Items,
    IReadOnlyList<SalePaymentDto> Payments);

public record SaleItemDto(
    Guid Id,
    Guid? ProductId,
    string ProductName,
    decimal Quantity,
    decimal UnitPrice,
    decimal DiscountAmount,
    decimal TotalPrice);

public record SalePaymentDto(
    Guid Id,
    string Method,
    decimal Amount);

public record SaleListResponse(
    IReadOnlyList<SaleListItemDto> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages);
