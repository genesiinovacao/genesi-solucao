using Solucao.Backend.Services;

namespace Solucao.Backend.Tests.Support;

/// <summary>
/// Captura as chamadas de auditoria em memória — o AuditService real precisa
/// de HttpContext e do audit_log com RLS, que o provider InMemory não tem.
/// </summary>
public sealed class FakeAudit : IAuditService
{
    public List<(string Action, string EntityType, Guid? EntityId)> Entries { get; } = new();

    public void Log(string action, string entityType, Guid? entityId = null, object? metadata = null) =>
        Entries.Add((action, entityType, entityId));

    public bool Logged(string action) => Entries.Any(e => e.Action == action);
}
