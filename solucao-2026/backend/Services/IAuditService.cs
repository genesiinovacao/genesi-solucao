using System.Net;
using System.Text.Json;
using Solucao.Backend.Data;
using Solucao.Backend.Models.Entities;

namespace Solucao.Backend.Services;

/// <summary>
/// Registro das operações sobre dados pessoais (LGPD art. 37) e de ações
/// sensíveis de plataforma. Grava em audit_log — tabela que já existia no
/// schema mas nunca era preenchida.
/// </summary>
public interface IAuditService
{
    /// <summary>
    /// Enfileira um registro de auditoria no mesmo SaveChanges do chamador.
    /// Nunca lança: auditoria com defeito não pode derrubar a operação.
    /// </summary>
    void Log(string action, string entityType, Guid? entityId = null, object? metadata = null);
}

public sealed class AuditService : IAuditService
{
    private readonly AppDbContext _db;
    private readonly ITenantContext _tenant;
    private readonly IHttpContextAccessor _http;
    private readonly ILogger<AuditService> _log;

    public AuditService(AppDbContext db, ITenantContext tenant, IHttpContextAccessor http, ILogger<AuditService> log)
    {
        _db = db;
        _tenant = tenant;
        _http = http;
        _log = log;
    }

    public void Log(string action, string entityType, Guid? entityId = null, object? metadata = null)
    {
        try
        {
            _db.AuditLogs.Add(new AuditLog
            {
                Id = Guid.NewGuid(),
                TenantId = _tenant.TenantId,
                UserId = _tenant.UserId,
                Action = action,
                EntityType = entityType,
                EntityId = entityId,
                Metadata = metadata is null ? null : JsonSerializer.Serialize(metadata),
                IpAddress = RemoteIp(),
                CreatedAt = DateTime.UtcNow,
            });
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Falha ao registrar auditoria {Action} em {EntityType}", action, entityType);
        }
    }

    /// <summary>
    /// IP de origem. Atrás do proxy do Render/Netlify o socket é do proxy,
    /// então o X-Forwarded-For (primeiro endereço) é o do cliente real.
    /// </summary>
    private IPAddress? RemoteIp()
    {
        var ctx = _http.HttpContext;
        if (ctx is null) return null;

        var forwarded = ctx.Request.Headers["X-Forwarded-For"].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(forwarded))
        {
            var first = forwarded.Split(',')[0].Trim();
            if (IPAddress.TryParse(first, out var parsed)) return parsed;
        }
        return ctx.Connection.RemoteIpAddress;
    }
}
