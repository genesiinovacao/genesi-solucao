namespace Solucao.Backend.Models.Entities;

public class CashSession
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid UserId { get; set; }
    public string? PosTerminalId { get; set; }
    public DateTime OpenedAt { get; set; }
    public decimal OpeningAmount { get; set; }
    public DateTime? ClosedAt { get; set; }
    public decimal? ClosingAmount { get; set; }
    public decimal? ExpectedAmount { get; set; }
    public decimal? Difference { get; set; }
    public string? Notes { get; set; }
}
