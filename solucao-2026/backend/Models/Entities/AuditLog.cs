using System.Net;

namespace Solucao.Backend.Models.Entities;

public class AuditLog
{
    public Guid Id { get; set; }
    public Guid? TenantId { get; set; }
    public Guid? UserId { get; set; }
    public string Action { get; set; } = null!;
    public string EntityType { get; set; } = null!;
    public Guid? EntityId { get; set; }
    public string? Metadata { get; set; } // JSON string
    public IPAddress? IpAddress { get; set; }
    public DateTime CreatedAt { get; set; }
}
