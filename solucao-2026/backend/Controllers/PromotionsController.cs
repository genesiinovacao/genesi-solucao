using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Solucao.Backend.Data;
using Solucao.Backend.Models.Dtos.Promotions;
using Solucao.Backend.Models.Entities;
using Solucao.Backend.Services;

namespace Solucao.Backend.Controllers;

[ApiController]
[Authorize]
[Route("api/promotions")]
public class PromotionsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ITenantContext _tenant;

    public PromotionsController(AppDbContext db, ITenantContext tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    private static PromotionDto ToDto(Promotion p) => new(
        p.Id, p.Name, p.DiscountPercent, p.TargetType, p.TargetValue,
        p.StartsAt, p.EndsAt, p.IsActive, p.SalesCount, p.TotalSavings,
        p.CreatedAt, p.UpdatedAt);

    [HttpGet]
    public async Task<ActionResult<PromotionListResponse>> List(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? state = null,   // active | expired | all
        CancellationToken ct = default)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 200);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var q = _db.Promotions.AsNoTracking().AsQueryable();

        if (state == "active")
            q = q.Where(p => p.IsActive && p.StartsAt <= today && p.EndsAt >= today);
        else if (state == "expired")
            q = q.Where(p => !p.IsActive || p.EndsAt < today);

        var total = await q.CountAsync(ct);
        var items = await q.OrderByDescending(p => p.StartsAt)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .ToListAsync(ct);

        return Ok(new PromotionListResponse(
            items.Select(ToDto).ToList(),
            page, pageSize, total,
            (int)Math.Ceiling(total / (double)pageSize)));
    }

    /// <summary>
    /// Alvo tem de casar com o tipo, senão a promoção existe e nunca pega
    /// nada: produto precisa existir, categoria precisa estar em uso e o
    /// nível de fidelidade tem valores fixos.
    /// </summary>
    private async Task<string?> ValidateTargetAsync(string targetType, string? targetValue, CancellationToken ct)
    {
        switch (targetType)
        {
            case "total":
                return null;   // não usa alvo

            case "product":
                if (!Guid.TryParse(targetValue, out var productId))
                    return "Selecione um produto válido.";
                if (!await _db.Products.AnyAsync(p => p.Id == productId, ct))
                    return "Produto não encontrado nesta loja.";
                return null;

            case "category":
                if (string.IsNullOrWhiteSpace(targetValue))
                    return "Selecione a categoria.";
                var exists = await _db.Products
                    .AnyAsync(p => p.Category != null && p.Category.ToLower() == targetValue.Trim().ToLower(), ct);
                return exists ? null : $"Nenhum produto na categoria \"{targetValue}\" — a promoção não pegaria nada.";

            case "loyalty":
                return targetValue is "bronze" or "silver" or "gold"
                    ? null
                    : "Nível de fidelidade deve ser bronze, silver ou gold.";

            default:
                return "Tipo de alvo inválido.";
        }
    }

    [Authorize(Roles = "admin,manager")]
    [HttpPost]
    public async Task<ActionResult<PromotionDto>> Create([FromBody] CreatePromotionRequest req, CancellationToken ct)
    {
        if (_tenant.TenantId is not { } tenantId) return Unauthorized();
        if (req.EndsAt < req.StartsAt) return BadRequest(new { error = "Data fim deve ser após o início." });
        if (await ValidateTargetAsync(req.TargetType, req.TargetValue, ct) is { } targetError)
            return BadRequest(new { error = targetError });

        var p = new Promotion
        {
            TenantId = tenantId,
            Name = req.Name,
            DiscountPercent = req.DiscountPercent,
            TargetType = req.TargetType,
            TargetValue = req.TargetValue,
            StartsAt = req.StartsAt,
            EndsAt = req.EndsAt,
            IsActive = true,
        };
        _db.Promotions.Add(p);
        await _db.SaveChangesAsync(ct);
        return Ok(ToDto(p));
    }

    [Authorize(Roles = "admin,manager")]
    [HttpPut("{id:guid}")]
    public async Task<ActionResult<PromotionDto>> Update(Guid id, [FromBody] UpdatePromotionRequest req, CancellationToken ct)
    {
        var p = await _db.Promotions.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (p is null) return NotFound();
        if (req.EndsAt < req.StartsAt) return BadRequest(new { error = "Data fim deve ser após o início." });
        if (await ValidateTargetAsync(req.TargetType, req.TargetValue, ct) is { } targetError)
            return BadRequest(new { error = targetError });

        p.Name = req.Name;
        p.DiscountPercent = req.DiscountPercent;
        p.TargetType = req.TargetType;
        p.TargetValue = req.TargetValue;
        p.StartsAt = req.StartsAt;
        p.EndsAt = req.EndsAt;
        p.IsActive = req.IsActive;

        await _db.SaveChangesAsync(ct);
        return Ok(ToDto(p));
    }

    [Authorize(Roles = "admin,manager")]
    [HttpPost("{id:guid}/toggle")]
    public async Task<ActionResult<PromotionDto>> Toggle(Guid id, CancellationToken ct)
    {
        var p = await _db.Promotions.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (p is null) return NotFound();
        p.IsActive = !p.IsActive;
        await _db.SaveChangesAsync(ct);
        return Ok(ToDto(p));
    }

    [Authorize(Roles = "admin,manager")]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var p = await _db.Promotions.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (p is null) return NotFound();
        _db.Promotions.Remove(p);
        await _db.SaveChangesAsync(ct);
        return NoContent();
    }
}
