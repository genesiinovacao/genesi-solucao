namespace Solucao.Backend.Models.Entities;

public class PosTerminal
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public string TerminalKey { get; set; } = null!;
    public string? Name { get; set; }
    public DateTime LastSeenAt { get; set; }
    public DateTime CreatedAt { get; set; }
}
