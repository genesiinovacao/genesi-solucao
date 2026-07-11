namespace Solucao.Backend.Models.Entities;

public class CashMovement
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid SessionId { get; set; }
    public string Type { get; set; } = null!;
    public decimal Amount { get; set; }
    public string? Reason { get; set; }
    public DateTime CreatedAt { get; set; }
}
