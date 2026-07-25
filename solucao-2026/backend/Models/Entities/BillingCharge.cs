namespace Solucao.Backend.Models.Entities;

public class BillingCharge
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    /// <summary>subscription = cobrança paga; bonus = cortesia concedida pelo admin.</summary>
    public string ChargeType { get; set; } = "subscription";
    public string PlanType { get; set; } = null!;
    public int Months { get; set; }
    public decimal Amount { get; set; }
    public string Provider { get; set; } = null!;
    /// <summary>Nulo em bonificação — não existe cobrança no provider.</summary>
    public string? ProviderChargeId { get; set; }
    public string? QrCodeText { get; set; }
    public string Status { get; set; } = "pending"; // pending | paid | expired | error
    /// <summary>Início do período concedido (para o financeiro conferir a cobertura).</summary>
    public DateOnly? PeriodStart { get; set; }
    public int ProRataDays { get; set; }
    public decimal ProRataAmount { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? PaidAt { get; set; }
    public DateOnly? AppliedNewExpiry { get; set; }
}
