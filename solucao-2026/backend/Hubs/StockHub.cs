using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Solucao.Backend.Services;

namespace Solucao.Backend.Hubs;

/// <summary>
/// Hub de alertas de estoque em tempo real. Cada conexão entra no grupo do
/// próprio tenant (claim tenant_id do JWT), então um broadcast para
/// "tenant-{id}" nunca vaza para outro tenant.
/// </summary>
[Authorize]
public sealed class StockHub : Hub
{
    public static string TenantGroup(Guid tenantId) => $"tenant-{tenantId}";

    public override async Task OnConnectedAsync()
    {
        var tenantClaim = Context.User?.FindFirst(JwtService.TenantIdClaim)?.Value;
        if (Guid.TryParse(tenantClaim, out var tenantId))
            await Groups.AddToGroupAsync(Context.ConnectionId, TenantGroup(tenantId));

        await base.OnConnectedAsync();
    }
}
