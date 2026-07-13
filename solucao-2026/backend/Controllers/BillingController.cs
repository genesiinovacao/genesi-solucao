using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Solucao.Backend.Data;
using Solucao.Backend.Models.Entities;
using Solucao.Backend.Services;
using Solucao.Backend.Services.Billing;

namespace Solucao.Backend.Controllers;

/// <summary>
/// Renovação de assinatura via PIX, feita pelo próprio cliente (admin da
/// loja). Fluxo: escolhe plano+período → cobra no provider → QR na tela →
/// o front consulta o status; quando o provider confirma, a validade é
/// estendida uma única vez (idempotente pelo status da cobrança).
/// </summary>
[ApiController]
[Authorize]
[Route("api/billing")]
public class BillingController : ControllerBase
{
    private static readonly string[] Plans = { "basic", "standard", "premium", "enterprise" };

    private static readonly Dictionary<string, decimal> DefaultPrices = new()
    {
        ["basic"] = 99.90m,
        ["standard"] = 149.90m,
        ["premium"] = 249.90m,
        ["enterprise"] = 399.90m,
    };

    private readonly AppDbContext _db;
    private readonly ITenantContext _tenant;
    private readonly IPixProvider _pix;
    private readonly IConfiguration _config;
    private readonly IMemoryCache _cache;
    private readonly ILogger<BillingController> _log;

    public BillingController(
        AppDbContext db, ITenantContext tenant, IPixProvider pix,
        IConfiguration config, IMemoryCache cache, ILogger<BillingController> log)
    {
        _db = db;
        _tenant = tenant;
        _pix = pix;
        _config = config;
        _cache = cache;
        _log = log;
    }

    private decimal MonthlyPrice(string plan) =>
        _config.GetValue($"Billing:Plans:{plan}", DefaultPrices[plan]);

    public record PlanDto(string PlanType, decimal MonthlyPrice);
    public record CreateChargeRequest(string PlanType, int Months);
    public record ChargeDto(
        Guid Id, string PlanType, int Months, decimal Amount, string QrCodeText,
        string Status, string Provider, DateOnly? NewExpiresAt);

    private static ChargeDto ToDto(BillingCharge c) =>
        new(c.Id, c.PlanType, c.Months, c.Amount, c.QrCodeText, c.Status, c.Provider, c.AppliedNewExpiry);

    /// <summary>Tabela de preços por plano (mensal).</summary>
    [HttpGet("plans")]
    public ActionResult<List<PlanDto>> GetPlans() =>
        Ok(Plans.Select(p => new PlanDto(p, MonthlyPrice(p))).ToList());

    /// <summary>Cria a cobrança PIX e devolve o copia-e-cola para o QR.</summary>
    [HttpPost("charges")]
    public async Task<ActionResult<ChargeDto>> CreateCharge([FromBody] CreateChargeRequest req, CancellationToken ct)
    {
        if (_tenant.TenantId is not { } tenantId) return Unauthorized();
        if (_tenant.Role != "admin") return Forbid();
        if (!Plans.Contains(req.PlanType))
            return BadRequest(new { error = $"Plano inválido. Opções: {string.Join(", ", Plans)}" });
        if (req.Months is < 1 or > 12)
            return BadRequest(new { error = "Período inválido: de 1 a 12 meses." });

        var tenant = await _db.Tenants.AsNoTracking().FirstAsync(t => t.Id == tenantId, ct);
        var amount = decimal.Round(MonthlyPrice(req.PlanType) * req.Months, 2);
        var chargeId = Guid.NewGuid();

        var pix = await _pix.CreateChargeAsync(
            amount,
            $"SOLUCAO 2026 - Assinatura {req.PlanType} {req.Months} mes(es) - {tenant.Name}",
            chargeId.ToString(),
            tenant.Email ?? "",
            ct);

        var charge = new BillingCharge
        {
            Id = chargeId,
            TenantId = tenantId,
            PlanType = req.PlanType,
            Months = req.Months,
            Amount = amount,
            Provider = _pix.Name,
            ProviderChargeId = pix.ProviderChargeId,
            QrCodeText = pix.QrCodeText,
            Status = "pending",
            CreatedAt = DateTime.UtcNow,
        };
        _db.BillingCharges.Add(charge);
        await _db.SaveChangesAsync(ct);

        _log.LogInformation("Cobrança PIX {ChargeId} criada: {Plan} x{Months} = R$ {Amount} (tenant {TenantId}, provider {Provider})",
            chargeId, req.PlanType, req.Months, amount, tenantId, _pix.Name);

        return Ok(ToDto(charge));
    }

    /// <summary>
    /// Consulta o status. Na primeira confirmação de pagamento, aplica a
    /// renovação: estende a validade a partir do maior entre hoje e a
    /// validade atual, e troca o plano do cliente.
    /// </summary>
    [HttpGet("charges/{id:guid}")]
    public async Task<ActionResult<ChargeDto>> GetCharge(Guid id, CancellationToken ct)
    {
        var charge = await _db.BillingCharges.FirstOrDefaultAsync(c => c.Id == id, ct);
        if (charge is null) return NotFound();

        if (charge.Status == "pending")
        {
            bool paid;
            try
            {
                paid = await _pix.IsPaidAsync(charge.ProviderChargeId, ct);
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "Falha ao consultar provider para cobrança {ChargeId}", charge.Id);
                return Ok(ToDto(charge)); // segue pendente; o front tenta de novo
            }

            if (paid)
            {
                var tenant = await _db.Tenants.FirstAsync(t => t.Id == charge.TenantId, ct);
                var today = DateOnly.FromDateTime(DateTime.Now);
                var baseDate = tenant.SubscriptionExpiresAt is { } cur && cur > today ? cur : today;
                var newExpiry = baseDate.AddMonths(charge.Months);

                tenant.SubscriptionExpiresAt = newExpiry;
                tenant.PlanType = charge.PlanType;

                charge.Status = "paid";
                charge.PaidAt = DateTime.UtcNow;
                charge.AppliedNewExpiry = newExpiry;
                await _db.SaveChangesAsync(ct);

                // Desbloqueio imediato: derruba o cache do SubscriptionGate
                _cache.Remove($"sub-exp:{charge.TenantId}");

                _log.LogInformation(
                    "PIX pago: cobrança {ChargeId}, tenant {TenantName} renovado até {NewExpiry} (plano {Plan})",
                    charge.Id, tenant.Name, newExpiry, charge.PlanType);
            }
        }

        return Ok(ToDto(charge));
    }
}
