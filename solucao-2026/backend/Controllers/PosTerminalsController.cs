using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Solucao.Backend.Data;
using Solucao.Backend.Models.Entities;
using Solucao.Backend.Services;

namespace Solucao.Backend.Controllers;

[ApiController]
[Authorize]
[Route("api/pos-terminals")]
public class PosTerminalsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ITenantContext _tenant;
    private readonly ILogger<PosTerminalsController> _log;

    public PosTerminalsController(AppDbContext db, ITenantContext tenant, ILogger<PosTerminalsController> log)
    {
        _db = db;
        _tenant = tenant;
        _log = log;
    }

    public record RegisterTerminalRequest(string TerminalKey, string? Name);
    public record RegisterTerminalResponse(Guid Id, string TerminalKey, int UsedTerminals, int MaxTerminals);

    /// <summary>
    /// Chamado pelo PDV a cada login. Idempotente por (tenant, terminalKey):
    /// terminal conhecido só atualiza o last_seen; máquina nova conta contra o
    /// limite de PDVs do cliente (max_pos_terminals, definido pelo superadmin).
    /// </summary>
    [HttpPost("register")]
    public async Task<ActionResult<RegisterTerminalResponse>> Register(
        [FromBody] RegisterTerminalRequest req, CancellationToken ct)
    {
        if (_tenant.TenantId is not { } tenantId) return Unauthorized();
        if (string.IsNullOrWhiteSpace(req.TerminalKey) || req.TerminalKey.Length > 64)
            return BadRequest(new { error = "terminalKey inválida." });

        var max = await _db.Tenants.AsNoTracking()
            .Where(t => t.Id == tenantId)
            .Select(t => t.MaxPosTerminals)
            .FirstAsync(ct);

        var existing = await _db.PosTerminals
            .FirstOrDefaultAsync(t => t.TerminalKey == req.TerminalKey, ct);

        if (existing is not null)
        {
            existing.LastSeenAt = DateTime.UtcNow;
            if (!string.IsNullOrWhiteSpace(req.Name)) existing.Name = req.Name;
            await _db.SaveChangesAsync(ct);
            var count = await _db.PosTerminals.CountAsync(ct);
            return Ok(new RegisterTerminalResponse(existing.Id, existing.TerminalKey, count, max));
        }

        var used = await _db.PosTerminals.CountAsync(ct);
        if (used >= max)
        {
            _log.LogWarning("Tenant {TenantId} atingiu o limite de {Max} PDV(s)", tenantId, max);
            return StatusCode(403, new
            {
                error = $"Limite de {max} PDV(s) atingido para esta loja. " +
                        "Fale com o suporte para liberar mais terminais."
            });
        }

        var terminal = new PosTerminal
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            TerminalKey = req.TerminalKey,
            Name = req.Name,
            LastSeenAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
        };
        _db.PosTerminals.Add(terminal);
        await _db.SaveChangesAsync(ct);

        return Ok(new RegisterTerminalResponse(terminal.Id, terminal.TerminalKey, used + 1, max));
    }
}
