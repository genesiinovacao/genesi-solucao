namespace Solucao.Backend.Models.Entities;

public class Promotion
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public string Name { get; set; } = null!;
    public decimal DiscountPercent { get; set; }
    public string TargetType { get; set; } = null!;
    public string? TargetValue { get; set; }
    public DateOnly StartsAt { get; set; }
    public DateOnly EndsAt { get; set; }
    public bool IsActive { get; set; } = true;
    public int SalesCount { get; set; }
    public decimal TotalSavings { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
