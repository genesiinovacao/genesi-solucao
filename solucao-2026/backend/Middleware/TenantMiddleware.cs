using System.Security.Claims;
using Solucao.Backend.Services;

namespace Solucao.Backend.Middleware;

/// <summary>
/// Reads the authenticated JWT, extracts tenant_id / user_id / role,
/// and stores them in the scoped <see cref="ITenantContext"/> so the
/// <see cref="Data.TenantConnectionInterceptor"/> can inject the correct
/// app.current_tenant_id into Postgres for the RLS policies.
///
/// Runs AFTER UseAuthentication so HttpContext.User is already populated.
/// </summary>
public sealed class TenantMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<TenantMiddleware> _log;

    public TenantMiddleware(RequestDelegate next, ILogger<TenantMiddleware> log)
    {
        _next = next;
        _log = log;
    }

    public async Task InvokeAsync(HttpContext context, ITenantContext tenant)
    {
        if (context.User.Identity?.IsAuthenticated == true)
        {
            var tenantClaim = context.User.FindFirstValue(JwtService.TenantIdClaim);
            var subClaim = context.User.FindFirstValue(ClaimTypes.NameIdentifier)
                          ?? context.User.FindFirstValue("sub");
            var roleClaim = context.User.FindFirstValue(ClaimTypes.Role) ?? "manager";

            if (Guid.TryParse(tenantClaim, out var tenantId) &&
                Guid.TryParse(subClaim, out var userId))
            {
                tenant.SetContext(tenantId, userId, roleClaim);
                _log.LogDebug("Tenant context resolved: tenant={TenantId} user={UserId}", tenantId, userId);
            }
            else
            {
                _log.LogWarning("Authenticated request without valid tenant_id/sub claim. Path={Path}", context.Request.Path);
            }
        }

        await _next(context);
    }
}
