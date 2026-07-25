namespace Solucao.Backend.Models.Entities;

public class Customer
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public string Name { get; set; } = null!;
    public string? TaxId { get; set; }
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string? Address { get; set; }
    public int LoyaltyPoints { get; set; }
    public decimal TotalSpent { get; set; }
    public decimal CreditBalance { get; set; }
    public string Status { get; set; } = "active";
    public DateOnly? BirthDate { get; set; }
    public string? Notes { get; set; }
    /// <summary>Quando o titular pediu a eliminação dos dados (LGPD art. 18, VI).</summary>
    public DateTime? AnonymizedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
