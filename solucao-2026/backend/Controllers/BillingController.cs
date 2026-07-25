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
/// loja). Todo cliente vence no mesmo dia do mês (Billing:BillingDay); quem
/// entra fora dessa data paga só a fração de dias até o próximo vencimento.
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

    private int BillingDay => Math.Clamp(_config.GetValue("Billing:BillingDay", 25), 1, 28);

    public record PlanDto(string PlanType, decimal MonthlyPrice);
    public record CreateChargeRequest(string PlanType, int Months);
    public record QuoteDto(
        string PlanType, decimal MonthlyPrice, int BillingDay,
        DateOnly PeriodStart, DateOnly NewExpiresAt,
        int ProRataDays, decimal ProRataAmount,
        int FullMonths, decimal FullAmount, decimal Total);
    public record ChargeDto(
        Guid Id, string PlanType, int Months, decimal Amount, string? QrCodeText,
        string Status, string Provider, DateOnly? NewExpiresAt,
        int ProRataDays, decimal ProRataAmount);

    private static ChargeDto ToDto(BillingCharge c) =>
        new(c.Id, c.PlanType, c.Months, c.Amount, c.QrCodeText, c.Status, c.Provider,
            c.AppliedNewExpiry, c.ProRataDays, c.ProRataAmount);

    /// <summary>Tabela de preços por plano (mensal).</summary>
    [HttpGet("plans")]
    public ActionResult<List<PlanDto>> GetPlans() =>
        Ok(Plans.Select(p => new PlanDto(p, MonthlyPrice(p))).ToList());

    /// <summary>
    /// Simula a cobrança sem criar nada: o front mostra a decomposição
    /// (dias proporcionais + meses cheios) antes de gerar o QR.
    /// </summary>
    [HttpGet("quote")]
    public async Task<ActionResult<QuoteDto>> GetQuote(
        [FromQuery] string planType, [FromQuery] int months, CancellationToken ct)
    {
        if (_tenant.TenantId is not { } tenantId) return Unauthorized();
        if (!Plans.Contains(planType))
            return BadRequest(new { error = $"Plano inválido. Opções: {string.Join(", ", Plans)}" });
        if (months is < 1 or > 12)
            return BadRequest(new { error = "Período inválido: de 1 a 12 meses." });

        var expiry = await _db.Tenants.AsNoTracking()
            .Where(t => t.Id == tenantId).Select(t => t.SubscriptionExpiresAt).FirstAsync(ct);

        var price = MonthlyPrice(planType);
        var q = SubscriptionCycle.BuildQuote(
            SubscriptionCycle.Today(), expiry, price, months, BillingDay);

        return Ok(new QuoteDto(
            planType, price, BillingDay, q.PeriodStart, q.NewExpiresAt,
            q.ProRataDays, q.ProRataAmount, q.FullMonths, q.FullAmount, q.Total));
    }

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
        var quote = SubscriptionCycle.BuildQuote(
            SubscriptionCycle.Today(), tenant.SubscriptionExpiresAt,
            MonthlyPrice(req.PlanType), req.Months, BillingDay);

        var chargeId = Guid.NewGuid();
        var pix = await _pix.CreateChargeAsync(
            quote.Total,
            $"SOLUCAO 2026 - Assinatura {req.PlanType} ate {quote.NewExpiresAt:dd/MM/yyyy} - {tenant.Name}",
            chargeId.ToString(),
            tenant.Email ?? "",
            ct);

        var charge = new BillingCharge
        {
            Id = chargeId,
            TenantId = tenantId,
            ChargeType = "subscription",
            PlanType = req.PlanType,
            Months = req.Months,
            Amount = quote.Total,
            Provider = _pix.Name,
            ProviderChargeId = pix.ProviderChargeId,
            QrCodeText = pix.QrCodeText,
            Status = "pending",
            PeriodStart = quote.PeriodStart,
            ProRataDays = quote.ProRataDays,
            ProRataAmount = quote.ProRataAmount,
            CreatedAt = DateTime.UtcNow,
        };
        _db.BillingCharges.Add(charge);
        await _db.SaveChangesAsync(ct);

        _log.LogInformation(
            "Cobrança PIX {ChargeId}: {Plan} {Months}m + {Days}d pro-rata = R$ {Amount} até {Expiry} (tenant {TenantId})",
            chargeId, req.PlanType, req.Months, quote.ProRataDays, quote.Total, quote.NewExpiresAt, tenantId);

        return Ok(ToDto(charge));
    }

    /// <summary>
    /// Consulta o status. Na primeira confirmação de pagamento aplica a
    /// renovação: estende até o vencimento calculado, troca o plano e encerra
    /// qualquer marcação de cortesia (agora é assinatura paga).
    /// </summary>
    [HttpGet("charges/{id:guid}")]
    public async Task<ActionResult<ChargeDto>> GetCharge(Guid id, CancellationToken ct)
    {
        var charge = await _db.BillingCharges.FirstOrDefaultAsync(c => c.Id == id, ct);
        if (charge is null) return NotFound();

        if (charge.Status == "pending" && charge.ProviderChargeId is { } providerId)
        {
            bool paid;
            try
            {
                paid = await _pix.IsPaidAsync(providerId, ct);
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "Falha ao consultar provider para cobrança {ChargeId}", charge.Id);
                return Ok(ToDto(charge)); // segue pendente; o front tenta de novo
            }

            if (paid)
            {
                var tenant = await _db.Tenants.FirstAsync(t => t.Id == charge.TenantId, ct);
                // Recalcula no momento do pagamento: se o PIX demorou a cair, o
                // período começa de onde a assinatura realmente está agora.
                var quote = SubscriptionCycle.BuildQuote(
                    SubscriptionCycle.Today(), tenant.SubscriptionExpiresAt,
                    MonthlyPrice(charge.PlanType), charge.Months, BillingDay);

                tenant.SubscriptionExpiresAt = quote.NewExpiresAt;
                tenant.PlanType = charge.PlanType;
                tenant.SubscriptionIsBonus = false;

                charge.Status = "paid";
                charge.PaidAt = DateTime.UtcNow;
                charge.AppliedNewExpiry = quote.NewExpiresAt;
                await _db.SaveChangesAsync(ct);

                _cache.Remove($"sub-exp:{charge.TenantId}"); // desbloqueio imediato

                _log.LogInformation(
                    "PIX pago: cobrança {ChargeId}, tenant {TenantName} renovado até {NewExpiry} (plano {Plan})",
                    charge.Id, tenant.Name, quote.NewExpiresAt, charge.PlanType);
            }
        }

        return Ok(ToDto(charge));
    }
}
