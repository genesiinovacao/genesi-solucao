namespace Solucao.Backend.Models.Entities;

public class BillingCharge
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public string PlanType { get; set; } = null!;
    public int Months { get; set; }
    public decimal Amount { get; set; }
    public string Provider { get; set; } = null!;
    public string ProviderChargeId { get; set; } = null!;
    public string QrCodeText { get; set; } = null!;
    public string Status { get; set; } = "pending"; // pending | paid | expired | error
    public DateTime CreatedAt { get; set; }
    public DateTime? PaidAt { get; set; }
    public DateOnly? AppliedNewExpiry { get; set; }
}
