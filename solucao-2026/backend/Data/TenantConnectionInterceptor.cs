using System.Data.Common;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Solucao.Backend.Services;

namespace Solucao.Backend.Data;

/// <summary>
/// Injects "SET app.current_tenant_id = '<uuid>'" right after each connection
/// is opened, so the PostgreSQL RLS policies filter every row automatically.
///
/// Pairs with "RESET app.current_tenant_id" on close to guarantee no context
/// leaks across pooled connections.
///
/// Registered as Scoped because it reads the per-request <see cref="ITenantContext"/>.
/// </summary>
public sealed class TenantConnectionInterceptor : DbConnectionInterceptor
{
    private readonly ITenantContext _tenant;
    private readonly ILogger<TenantConnectionInterceptor> _log;

    public TenantConnectionInterceptor(ITenantContext tenant, ILogger<TenantConnectionInterceptor> log)
    {
        _tenant = tenant;
        _log = log;
    }

    public override async Task ConnectionOpenedAsync(
        DbConnection connection,
        ConnectionEndEventData eventData,
        CancellationToken cancellationToken = default)
    {
        if (_tenant.TenantId is { } tenantId)
        {
            await using var cmd = connection.CreateCommand();
            cmd.CommandText = "SELECT set_config('app.current_tenant_id', @tid, false)";
            var p = cmd.CreateParameter();
            p.ParameterName = "@tid";
            p.Value = tenantId.ToString();
            cmd.Parameters.Add(p);
            await cmd.ExecuteNonQueryAsync(cancellationToken);
            _log.LogDebug("RLS context set: tenant={TenantId}", tenantId);
        }

        await base.ConnectionOpenedAsync(connection, eventData, cancellationToken);
    }

    public override async ValueTask<InterceptionResult> ConnectionClosingAsync(
        DbConnection connection,
        ConnectionEventData eventData,
        InterceptionResult result)
    {
        // Always clear before returning the connection to the pool.
        // Ignoring errors if the connection is already broken.
        try
        {
            if (connection.State == System.Data.ConnectionState.Open)
            {
                await using var cmd = connection.CreateCommand();
                cmd.CommandText = "SELECT set_config('app.current_tenant_id', '', false)";
                await cmd.ExecuteNonQueryAsync();
            }
        }
        catch (Exception ex)
        {
            _log.LogDebug(ex, "Could not reset tenant on close (connection probably already broken)");
        }

        return await base.ConnectionClosingAsync(connection, eventData, result);
    }
}
