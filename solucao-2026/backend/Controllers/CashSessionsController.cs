using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Solucao.Backend.Data;
using Solucao.Backend.Models.Dtos.Cash;
using Solucao.Backend.Models.Entities;
using Solucao.Backend.Services;

namespace Solucao.Backend.Controllers;

[ApiController]
[Authorize]
[Route("api/cash-sessions")]
public class CashSessionsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ITenantContext _tenant;
    private readonly IOperatorAuthService _operators;
    private readonly IAuditService _audit;

    public CashSessionsController(
        AppDbContext db, ITenantContext tenant, IOperatorAuthService operators, IAuditService audit)
    {
        _db = db;
        _tenant = tenant;
        _operators = operators;
        _audit = audit;
    }

    private static CashSessionDto ToDto(CashSession s, string userName) => new(
        s.Id, s.UserId, userName, s.PosTerminalId, s.OpenedAt, s.OpeningAmount,
        s.ClosedAt, s.ClosingAmount, s.ExpectedAmount, s.Difference, s.Notes);

    /// <summary>The current user's open session, or null.</summary>
    [HttpGet("current")]
    public async Task<ActionResult<CashSessionDto?>> Current(CancellationToken ct)
    {
        if (_tenant.UserId is not { } userId) return Unauthorized();
        var s = await _db.CashSessions.AsNoTracking()
            .Where(x => x.UserId == userId && x.ClosedAt == null)
            .OrderByDescending(x => x.OpenedAt)
            .FirstOrDefaultAsync(ct);

        if (s is null) return Ok((CashSessionDto?)null);

        var userName = await _db.Users.AsNoTracking()
            .Where(u => u.Id == s.UserId).Select(u => u.Name).FirstOrDefaultAsync(ct) ?? "";
        return Ok(ToDto(s, userName));
    }

    [HttpPost("open")]
    public async Task<ActionResult<CashSessionDto>> Open([FromBody] OpenCashRequest req, CancellationToken ct)
    {
        if (_tenant.TenantId is not { } tenantId) return Unauthorized();
        if (_tenant.UserId is not { } userId) return Unauthorized();

        var alreadyOpen = await _db.CashSessions.AsNoTracking()
            .AnyAsync(x => x.UserId == userId && x.ClosedAt == null, ct);
        if (alreadyOpen) return Conflict(new { error = "Já existe um caixa aberto para este usuário." });

        var s = new CashSession
        {
            TenantId = tenantId,
            UserId = userId,
            PosTerminalId = req.PosTerminalId,
            OpeningAmount = req.OpeningAmount,
            OpenedAt = DateTime.UtcNow,
        };
        _db.CashSessions.Add(s);
        await _db.SaveChangesAsync(ct);

        var userName = await _db.Users.AsNoTracking()
            .Where(u => u.Id == userId).Select(u => u.Name).FirstOrDefaultAsync(ct) ?? "";
        return Ok(ToDto(s, userName));
    }

    /// <summary>Z report — closes the session and computes the difference.</summary>
    [HttpPost("{id:guid}/close")]
    public async Task<ActionResult<object>> Close(Guid id, [FromBody] CloseCashRequest req, CancellationToken ct)
    {
        if (_tenant.UserId is not { } userId) return Unauthorized();

        var s = await _db.CashSessions.FirstOrDefaultAsync(x => x.Id == id && x.UserId == userId, ct);
        if (s is null) return NotFound();
        if (s.ClosedAt is not null) return BadRequest(new { error = "Caixa já está fechado." });

        var summary = await ComputeSummary(s, ct);

        s.ClosedAt = DateTime.UtcNow;
        s.ClosingAmount = req.ClosingAmount;
        s.ExpectedAmount = summary.ExpectedCash;
        s.Difference = req.ClosingAmount - summary.ExpectedCash;
        s.Notes = req.Notes;

        await _db.SaveChangesAsync(ct);

        return Ok(new
        {
            session = new
            {
                s.Id, s.OpenedAt, s.ClosedAt, s.OpeningAmount, s.ClosingAmount,
                s.ExpectedAmount, s.Difference, s.Notes,
            },
            summary,
        });
    }

    [HttpGet("{id:guid}/summary")]
    public async Task<ActionResult<CashSessionSummaryDto>> Summary(Guid id, CancellationToken ct)
    {
        var s = await _db.CashSessions.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (s is null) return NotFound();
        return Ok(await ComputeSummary(s, ct));
    }

    [HttpPost("{id:guid}/movements")]
    public async Task<ActionResult<CashMovementDto>> AddMovement(Guid id, [FromBody] CashMovementRequest req, CancellationToken ct)
    {
        if (_tenant.TenantId is not { } tenantId) return Unauthorized();
        if (req.Type != "supply" && req.Type != "withdraw")
            return BadRequest(new { error = "Tipo deve ser 'supply' ou 'withdraw'." });

        // Sangria tira dinheiro do caixa: exige aval de quem responde pela loja.
        // Suprimento (entrada de troco) o operador faz sozinho.
        Models.Entities.User? supervisor = null;
        if (req.Type == "withdraw" && _tenant.Role == "cashier")
        {
            supervisor = await _operators.FindSupervisorAsync(req.SupervisorCode, req.SupervisorPin, ct);
            if (supervisor is null)
                return StatusCode(403, new
                {
                    error = "Sangria exige autorização de um gerente ou administrador (código e PIN).",
                    requiresSupervisor = true,
                });
        }

        var s = await _db.CashSessions.FirstOrDefaultAsync(x => x.Id == id && x.ClosedAt == null, ct);
        if (s is null) return NotFound(new { error = "Caixa fechado ou inexistente." });

        var reason = supervisor is null
            ? req.Reason
            : $"{req.Reason} (autorizado por {supervisor.Name})";

        var m = new CashMovement
        {
            TenantId = tenantId,
            SessionId = s.Id,
            Type = req.Type,
            Amount = req.Amount,
            Reason = reason,
            CreatedAt = DateTime.UtcNow,
        };
        _db.CashMovements.Add(m);

        if (req.Type == "withdraw")
            _audit.Log("cash.withdraw", "cash_session", s.Id,
                new { amount = req.Amount, authorizedBy = supervisor?.Name });

        await _db.SaveChangesAsync(ct);

        return Ok(new CashMovementDto(m.Id, m.Type, m.Amount, m.Reason, m.CreatedAt));
    }

    private async Task<CashSessionSummaryDto> ComputeSummary(CashSession s, CancellationToken ct)
    {
        var until = s.ClosedAt ?? DateTime.UtcNow;

        var sales = await _db.Sales.AsNoTracking()
            .Where(x => x.CashSessionId == s.Id && x.Status == "completed")
            .Select(x => new { x.Id, x.TotalAmount, x.PaymentMethod })
            .ToListAsync(ct);

        var totalSales = sales.Sum(x => x.TotalAmount);
        var salesCount = sales.Count;
        var byMethod = sales.GroupBy(x => x.PaymentMethod)
                            .ToDictionary(g => g.Key, g => g.Sum(x => x.TotalAmount));

        // For mixed (split) payments, sum the actual cash slice
        var saleIds = sales.Select(x => x.Id).ToList();
        var cashFromMixed = 0m;
        if (saleIds.Count > 0)
        {
            cashFromMixed = await _db.SalePayments.AsNoTracking()
                .Where(p => saleIds.Contains(p.SaleId) && p.Method == "cash")
                .SumAsync(p => (decimal?)p.Amount, ct) ?? 0m;
        }

        // For non-split sales, the payment_method itself indicates cash
        var cashFromMethod = sales.Where(x => x.PaymentMethod == "cash").Sum(x => x.TotalAmount);

        // Prefer cashFromMixed where present, fall back to method total
        var cashSales = cashFromMixed > 0 ? cashFromMixed : cashFromMethod;

        var movements = await _db.CashMovements.AsNoTracking()
            .Where(m => m.SessionId == s.Id)
            .ToListAsync(ct);
        var supplies  = movements.Where(m => m.Type == "supply").Sum(m => m.Amount);
        var withdraws = movements.Where(m => m.Type == "withdraw").Sum(m => m.Amount);

        var expected = s.OpeningAmount + cashSales + supplies - withdraws;

        return new CashSessionSummaryDto(
            s.Id, s.OpenedAt, s.ClosedAt,
            s.OpeningAmount, cashSales, totalSales, salesCount,
            supplies, withdraws, expected, byMethod);
    }
}
