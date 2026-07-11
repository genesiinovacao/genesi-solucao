namespace Solucao.Backend.Services;

public interface ITenantContext
{
    Guid? TenantId { get; }
    Guid? UserId { get; }
    string? Role { get; }
    bool IsAuthenticated { get; }
    void SetContext(Guid tenantId, Guid userId, string role);
}

public sealed class TenantContext : ITenantContext
{
    public Guid? TenantId { get; private set; }
    public Guid? UserId { get; private set; }
    public string? Role { get; private set; }
    public bool IsAuthenticated => TenantId.HasValue && UserId.HasValue;

    public void SetContext(Guid tenantId, Guid userId, string role)
    {
        TenantId = tenantId;
        UserId = userId;
        Role = role;
    }
}
