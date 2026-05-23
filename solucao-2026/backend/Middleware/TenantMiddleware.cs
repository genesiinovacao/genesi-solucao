using System.Security.Claims;

namespace Solucao.Backend.Middleware;

public class TenantMiddleware
{
    private readonly RequestDelegate _next;

    public TenantMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        // Resolve Tenant ID from Header or JWT Claim
        string? tenantId = context.Request.Headers["X-Tenant-ID"];

        if (string.IsNullOrEmpty(tenantId))
        {
            // Fallback: Try to get from User Claims if authenticated
            tenantId = context.User.FindFirst("tenant_id")?.Value;
        }

        if (!string.IsNullOrEmpty(tenantId))
        {
            // Store Tenant ID in HttpContext.Items for access in DB Context / Services
            context.Items["TenantId"] = tenantId;

            // Optional: Inject into PostgreSQL session variable for RLS
            // This would be done in the DbContext or a dedicated DB service
        }
        else if (context.Request.Path.StartsWithSegments("/api/public") == false)
        {
            // If not a public route and no tenant found, block request
            // context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            // await context.Response.WriteAsync("Tenant ID missing.");
            // return;
        }

        await _next(context);
    }
}
