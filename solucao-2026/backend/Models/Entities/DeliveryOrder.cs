namespace Solucao.Backend.Models.Entities;

public class DeliveryOrder
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid? CustomerId { get; set; }
    public Guid? SaleId { get; set; }
    public string OrderNumber { get; set; } = null!;
    public string CustomerName { get; set; } = null!;
    public string? CustomerPhone { get; set; }
    public string DeliveryAddress { get; set; } = null!;
    public string? ItemsSummary { get; set; }
    public decimal TotalAmount { get; set; }
    public decimal DeliveryFee { get; set; }
    public string? PaymentMethod { get; set; }
    public string Status { get; set; } = "pending";
    public string? DriverName { get; set; }
    public DateTime RequestedAt { get; set; }
    public DateTime? DeliveredAt { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
