namespace Solucao.Backend.Models.Entities;

public class Sale
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid? UserId { get; set; }
    public Guid? CustomerId { get; set; }
    public DateTime SaleDate { get; set; }
    public decimal Subtotal { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal TotalAmount { get; set; }
    public string PaymentMethod { get; set; } = "cash";
    public decimal? AmountReceived { get; set; }
    public decimal? ChangeAmount { get; set; }
    public string Status { get; set; } = "completed";
    public Guid? OfflineSyncId { get; set; }
    public Guid? CashSessionId { get; set; }
    public string? PosTerminalId { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }

    public List<SaleItem> Items { get; set; } = new();
    public List<SalePayment> Payments { get; set; } = new();
}
