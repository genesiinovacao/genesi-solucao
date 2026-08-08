using System.ComponentModel.DataAnnotations;

namespace Solucao.Backend.Models.Dtos.Quotes;

public record QuoteLineRequest(
    Guid? ProductId,
    [Required, StringLength(255)] string ProductName,
    [Range(0.0001, 999999)] decimal Quantity,
    [Range(0, 9999999)] decimal UnitPrice,
    decimal DiscountAmount,
    decimal TotalPrice);

public record CreateQuoteRequest(
    List<QuoteLineRequest> Items,
    Guid? CustomerId,
    string? CustomerName,
    string? CustomerPhone,
    decimal Subtotal,
    decimal DiscountAmount,
    decimal SurchargeAmount,
    decimal TotalAmount,
    string? Notes,
    /// <summary>Dias de validade. Zero cai no padrão da loja (7).</summary>
    int ValidDays = 0);

public record QuoteItemDto(
    Guid Id,
    Guid? ProductId,
    string ProductName,
    decimal Quantity,
    decimal UnitPrice,
    decimal DiscountAmount,
    decimal TotalPrice);

public record QuoteDto(
    Guid Id,
    long Number,
    DateTime CreatedAt,
    DateOnly ValidUntil,
    bool IsExpired,
    Guid? CustomerId,
    string? CustomerName,
    string? CustomerPhone,
    string? SellerName,
    decimal Subtotal,
    decimal DiscountAmount,
    decimal SurchargeAmount,
    decimal TotalAmount,
    string Status,
    Guid? ConvertedSaleId,
    string? Notes,
    IReadOnlyList<QuoteItemDto> Items);

public record QuoteListItemDto(
    Guid Id,
    long Number,
    DateTime CreatedAt,
    DateOnly ValidUntil,
    bool IsExpired,
    string? CustomerName,
    string? SellerName,
    int ItemCount,
    decimal TotalAmount,
    string Status);

public record QuoteListResponse(
    IReadOnlyList<QuoteListItemDto> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages);
