namespace Solucao.Backend.Models.Entities;

public class FinancialTransaction
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public string Type { get; set; } = null!;
    public string Description { get; set; } = null!;
    public decimal Amount { get; set; }
    public DateOnly TransactionDate { get; set; }
    public DateOnly? DueDate { get; set; }
    public DateTime? PaidAt { get; set; }
    public string? Category { get; set; }
    public string Status { get; set; } = "pending";
    public Guid? SupplierId { get; set; }
    public Guid? SaleId { get; set; }
    public string? PaymentMethod { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
