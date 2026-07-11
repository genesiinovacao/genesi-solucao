namespace Solucao.Backend.Models.Entities;

public class StockMovement
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid ProductId { get; set; }
    public Guid? UserId { get; set; }
    public string MovementType { get; set; } = null!;
    public decimal Quantity { get; set; }
    public decimal BalanceAfter { get; set; }
    public decimal? UnitCost { get; set; }
    public string? ReferenceType { get; set; }
    public Guid? ReferenceId { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }
}
