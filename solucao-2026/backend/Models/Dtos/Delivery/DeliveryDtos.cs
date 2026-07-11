using System.ComponentModel.DataAnnotations;

namespace Solucao.Backend.Models.Dtos.Delivery;

public record DeliveryOrderDto(
    Guid Id,
    string OrderNumber,
    string CustomerName,
    string? CustomerPhone,
    string DeliveryAddress,
    string? ItemsSummary,
    decimal TotalAmount,
    decimal DeliveryFee,
    string? PaymentMethod,
    string Status,
    string? DriverName,
    DateTime RequestedAt,
    DateTime? DeliveredAt,
    string? Notes);

public record CreateDeliveryRequest(
    [Required, StringLength(255)] string CustomerName,
    string? CustomerPhone,
    [Required] string DeliveryAddress,
    string? ItemsSummary,
    [Range(0, 9999999.99)] decimal TotalAmount,
    [Range(0, 999.99)] decimal DeliveryFee,
    string? PaymentMethod,
    Guid? CustomerId,
    string? Notes);

public record UpdateDeliveryStatusRequest([Required] string Status, string? DriverName);

public record DeliveryBoardDto(
    IReadOnlyList<DeliveryOrderDto> Pending,
    IReadOnlyList<DeliveryOrderDto> Preparing,
    IReadOnlyList<DeliveryOrderDto> OutForDelivery,
    IReadOnlyList<DeliveryOrderDto> Delivered);
