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

    // Espelha a régua do SubscriptionGateMiddleware: vencida além da carência.
    // Sessão de suporte (impersonação) nunca é bloqueada, senão o superadmin
    // ficaria preso na tela de bloqueio do cliente.
    private bool IsBlocked(DateOnly? expiresAt) =>
        User.FindFirst(JwtService.ImpersonationClaim)?.Value != "1" &&
        expiresAt is { } exp &&
        Services.Billing.SubscriptionCycle.Today() >= exp.AddDays(_config.GetValue("Billing:GraceDays", 3) + 1);

    /// <summary>
    /// Teclas que o PDV aceita como atalho. Restrito de propósito: teclas de
    /// função e alguns controles não colidem com o que o operador digita nem
    /// com o leitor de código de barras, que "digita" letras e números.
    /// </summary>
    private static readonly HashSet<string> AllowedShortcutKeys = new()
    {
        "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
        "Insert", "Delete", "Home", "End", "PageUp", "PageDown", "*", "+", "-", "/",
    };

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
            t.DailySalesTarget, t.MaxDiscountPercent, t.TaxRegime, t.LogoEmoji, t.LogoBase64, t.Segment, globalLogo,
            t.SubscriptionExpiresAt, IsBlocked(t.SubscriptionExpiresAt), t.SubscriptionIsBonus,
            ParseShortcuts(t.PdvShortcuts), t.AllowSaleWithoutStock,
            t.StateRegistration, t.ApproximateTaxPercent));
    }

    /// <summary>
    /// JSON malformado na coluna não pode derrubar as configurações inteiras:
    /// cai no padrão do sistema, que é exatamente o que o nulo significa.
    /// </summary>
    private static IReadOnlyDictionary<string, string>? ParseShortcuts(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            return System.Text.Json.JsonSerializer
                .Deserialize<Dictionary<string, string>>(json);
        }
        catch (System.Text.Json.JsonException)
        {
            return null;
        }
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
        // ~200 KB de imagem => ~270 KB em base64
        if (req.LogoBase64 is { Length: > 300_000 })
            return BadRequest(new { error = "Logo muito grande — use uma imagem de até ~200 KB." });

        t.DailySalesTarget = req.DailySalesTarget;
        t.MaxDiscountPercent = req.MaxDiscountPercent;
        t.TaxRegime = req.TaxRegime;
        t.LogoEmoji = req.LogoEmoji;
        t.LogoBase64 = req.LogoBase64;

        // Nulo mantém o que está salvo (a tela de dados cadastrais não mexe
        // em atalho); dicionário vazio é o pedido explícito de voltar ao padrão.
        if (req.PdvShortcuts is { } keys)
        {
            var invalid = keys.Where(k => !AllowedShortcutKeys.Contains(k.Value)).ToList();
            if (invalid.Count > 0)
                return BadRequest(new
                {
                    error = $"Tecla não suportada: {string.Join(", ", invalid.Select(i => i.Value))}.",
                });

            // Duas ações na mesma tecla deixariam uma delas inalcançável
            var duplicated = keys.GroupBy(k => k.Value).FirstOrDefault(g => g.Count() > 1);
            if (duplicated is not null)
                return BadRequest(new
                {
                    error = $"A tecla {duplicated.Key} está em mais de uma ação.",
                });

            t.PdvShortcuts = keys.Count == 0
                ? null
                : System.Text.Json.JsonSerializer.Serialize(keys);
        }

        if (req.AllowSaleWithoutStock is { } allow) t.AllowSaleWithoutStock = allow;
        if (req.StateRegistration is not null)
            t.StateRegistration = string.IsNullOrWhiteSpace(req.StateRegistration)
                ? null : req.StateRegistration.Trim();
        if (req.ApproximateTaxPercent is { } tax) t.ApproximateTaxPercent = tax;

        await _db.SaveChangesAsync(ct);

        var globalLogo = await _db.PlatformSettings.AsNoTracking()
            .Where(s => s.Id == 1).Select(s => s.LogoBase64).FirstOrDefaultAsync(ct);

        return Ok(new TenantSettingsDto(
            t.Id, t.Name, t.Cnpj, t.PlanType, t.Phone, t.Email, t.Address,
            t.DailySalesTarget, t.MaxDiscountPercent, t.TaxRegime, t.LogoEmoji, t.LogoBase64, t.Segment, globalLogo,
            t.SubscriptionExpiresAt, IsBlocked(t.SubscriptionExpiresAt), t.SubscriptionIsBonus,
            ParseShortcuts(t.PdvShortcuts), t.AllowSaleWithoutStock,
            t.StateRegistration, t.ApproximateTaxPercent));
    }
}
