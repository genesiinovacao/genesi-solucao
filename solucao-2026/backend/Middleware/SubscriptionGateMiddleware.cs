using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Solucao.Backend.Data;
using Solucao.Backend.Services;

namespace Solucao.Backend.Middleware;

/// <summary>
/// Régua de cobrança: assinatura vencida há mais dias que a carência
/// (Billing:GraceDays, padrão 3) bloqueia a API com 402 Payment Required.
///
/// Ficam liberados mesmo bloqueado: login/refresh (para chegar à tela),
/// leitura de settings (a tela de bloqueio precisa dos dados), e o módulo
/// de billing (é por ele que o cliente paga e se desbloqueia). Superadmin
/// nunca é bloqueado. Sem data de expiração = sem controle = nunca bloqueia.
/// </summary>
public sealed class SubscriptionGateMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<SubscriptionGateMiddleware> _log;

    public SubscriptionGateMiddleware(RequestDelegate next, ILogger<SubscriptionGateMiddleware> log)
    {
        _next = next;
        _log = log;
    }

    public async Task InvokeAsync(
        HttpContext ctx, ITenantContext tenant, AppDbContext db, IMemoryCache cache, IConfiguration config)
    {
        if (!ShouldCheck(ctx, tenant))
        {
            await _next(ctx);
            return;
        }

        var tenantId = tenant.TenantId!.Value;

        // 60s de cache por tenant: evita uma consulta ao banco em toda request
        var expiresAt = await cache.GetOrCreateAsync($"sub-exp:{tenantId}", async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(60);
            return await db.Tenants.AsNoTracking()
                .Where(t => t.Id == tenantId)
                .Select(t => t.SubscriptionExpiresAt)
                .FirstOrDefaultAsync();
        });

        if (expiresAt is { } exp)
        {
            var graceDays = config.GetValue("Billing:GraceDays", 3);
            var blockedFrom = exp.AddDays(graceDays + 1);
            if (DateOnly.FromDateTime(DateTime.Now) >= blockedFrom)
            {
                _log.LogInformation("Tenant {TenantId} bloqueado por assinatura vencida em {Exp}", tenantId, exp);
                ctx.Response.StatusCode = StatusCodes.Status402PaymentRequired;
                await ctx.Response.WriteAsJsonAsync(new
                {
                    error = $"Assinatura vencida em {exp:dd/MM/yyyy}. Renove pelo dashboard (botão Renovar assinatura) para reativar o sistema.",
                    subscriptionExpired = true,
                });
                return;
            }
        }

        await _next(ctx);
    }

    private static bool ShouldCheck(HttpContext ctx, ITenantContext tenant)
    {
        if (tenant.TenantId is null) return false;              // não autenticado
        if (tenant.Role == "superadmin") return false;          // gestor da plataforma

        var path = ctx.Request.Path;
        if (!path.StartsWithSegments("/api")) return false;     // hubs, health, swagger
        if (path.StartsWithSegments("/api/auth")) return false;
        if (path.StartsWithSegments("/api/billing")) return false;
        if (path.StartsWithSegments("/api/settings") && HttpMethods.IsGet(ctx.Request.Method)) return false;

        return true;
    }
}
