using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Solucao.Backend.Data;
using Solucao.Backend.Models.Dtos.Settings;
using Solucao.Backend.Services;

namespace Solucao.Backend.Controllers;

[ApiController]
[Authorize]
[Route("api/settings")]
public class SettingsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ITenantContext _tenant;
    private readonly IConfiguration _config;

    public SettingsController(AppDbContext db, ITenantContext tenant, IConfiguration config)
    {
        _db = db;
        _tenant = tenant;
        _config = config;
    }

    // Espelha a régua do SubscriptionGateMiddleware: vencida além da carência
    private bool IsBlocked(DateOnly? expiresAt) =>
        expiresAt is { } exp &&
        DateOnly.FromDateTime(DateTime.Now) >= exp.AddDays(_config.GetValue("Billing:GraceDays", 3) + 1);

    // The "tenants" table has no RLS (it's the control plane), so we
    // filter explicitly by the authenticated tenant_id every time.

    [HttpGet]
    public async Task<ActionResult<TenantSettingsDto>> Get(CancellationToken ct)
    {
        if (_tenant.TenantId is not { } tenantId) return Unauthorized();

        var t = await _db.Tenants.AsNoTracking().FirstOrDefaultAsync(x => x.Id == tenantId, ct);
        if (t is null) return NotFound();

        var globalLogo = await _db.PlatformSettings.AsNoTracking()
            .Where(s => s.Id == 1).Select(s => s.LogoBase64).FirstOrDefaultAsync(ct);

        return Ok(new TenantSettingsDto(
            t.Id, t.Name, t.Cnpj, t.PlanType, t.Phone, t.Email, t.Address,
            t.DailySalesTarget, t.TaxRegime, t.LogoEmoji, t.LogoBase64, t.Segment, globalLogo,
            t.SubscriptionExpiresAt, IsBlocked(t.SubscriptionExpiresAt)));
    }

    [HttpPut]
    public async Task<ActionResult<TenantSettingsDto>> Update([FromBody] UpdateTenantSettingsRequest req, CancellationToken ct)
    {
        if (_tenant.TenantId is not { } tenantId) return Unauthorized();
        if (_tenant.Role != "admin") return Forbid();

        var t = await _db.Tenants.FirstOrDefaultAsync(x => x.Id == tenantId, ct);
        if (t is null) return NotFound();

        t.Name = req.Name;
        t.Phone = req.Phone;
        t.Email = req.Email;
        t.Address = req.Address;
        t.DailySalesTarget = req.DailySalesTarget;
        t.TaxRegime = req.TaxRegime;
        t.LogoEmoji = req.LogoEmoji;

        await _db.SaveChangesAsync(ct);

        var globalLogo = await _db.PlatformSettings.AsNoTracking()
            .Where(s => s.Id == 1).Select(s => s.LogoBase64).FirstOrDefaultAsync(ct);

        return Ok(new TenantSettingsDto(
            t.Id, t.Name, t.Cnpj, t.PlanType, t.Phone, t.Email, t.Address,
            t.DailySalesTarget, t.TaxRegime, t.LogoEmoji, t.LogoBase64, t.Segment, globalLogo,
            t.SubscriptionExpiresAt, IsBlocked(t.SubscriptionExpiresAt)));
    }
}
