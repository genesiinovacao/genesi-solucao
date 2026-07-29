namespace Solucao.Backend.Models.Entities;

public class Tenant
{
    public Guid Id { get; set; }
    public string Name { get; set; } = null!;
    public string Cnpj { get; set; } = null!;
    public string PlanType { get; set; } = "standard";
    public bool IsActive { get; set; } = true;
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public string? Address { get; set; }
    public decimal DailySalesTarget { get; set; }
    /// <summary>Desconto acima deste percentual exige supervisor no PDV.</summary>
    public decimal MaxDiscountPercent { get; set; } = 10m;
    public string TaxRegime { get; set; } = "simples_nacional";
    public string? LogoEmoji { get; set; }
    public string? LogoBase64 { get; set; }
    public string Segment { get; set; } = "supermercado";
    /// <summary>Rede a que esta loja pertence (nulo = loja única).</summary>
    public Guid? GroupId { get; set; }
    public int MaxPosTerminals { get; set; } = 1;
    public DateOnly? SubscriptionExpiresAt { get; set; }
    /// <summary>Período atual é cortesia (não gerou receita) — marcado pelo superadmin.</summary>
    public bool SubscriptionIsBonus { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
