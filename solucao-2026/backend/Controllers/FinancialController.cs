using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Solucao.Backend.Data;
using Solucao.Backend.Models.Dtos.Financial;
using Solucao.Backend.Models.Entities;
using Solucao.Backend.Services;

namespace Solucao.Backend.Controllers;

[ApiController]
[Authorize]
[Route("api/financial")]
public class FinancialController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ITenantContext _tenant;

    public FinancialController(AppDbContext db, ITenantContext tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    private static FinancialTransactionDto ToDto(FinancialTransaction t) => new(
        t.Id, t.Type, t.Description, t.Amount, t.TransactionDate, t.DueDate,
        t.PaidAt, t.Category, t.Status, t.SupplierId, t.SaleId, t.PaymentMethod, t.Notes);

    [HttpGet]
    public async Task<ActionResult<FinancialListResponse>> List(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? type = null,        // income | expense
        [FromQuery] string? status = null,
        [FromQuery] DateOnly? from = null,
        [FromQuery] DateOnly? to = null,
        CancellationToken ct = default)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 200);

        var q = _db.FinancialTransactions.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(type))   q = q.Where(t => t.Type == type);
        if (!string.IsNullOrWhiteSpace(status)) q = q.Where(t => t.Status == status);
        if (from is not null) q = q.Where(t => t.TransactionDate >= from);
        if (to is not null)   q = q.Where(t => t.TransactionDate <= to);

        var total = await q.CountAsync(ct);
        var items = await q.OrderByDescending(t => t.TransactionDate)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .ToListAsync(ct);

        return Ok(new FinancialListResponse(
            items.Select(ToDto).ToList(),
            page, pageSize, total,
            (int)Math.Ceiling(total / (double)pageSize)));
    }

    [Authorize(Roles = "admin,manager")]
    [HttpPost]
    public async Task<ActionResult<FinancialTransactionDto>> Create([FromBody] CreateFinancialTransactionRequest req, CancellationToken ct)
    {
        if (_tenant.TenantId is not { } tenantId) return Unauthorized();
        if (req.Type != "income" && req.Type != "expense")
            return BadRequest(new { error = "Tipo deve ser 'income' ou 'expense'." });

        var t = new FinancialTransaction
        {
            TenantId = tenantId,
            Type = req.Type,
            Description = req.Description,
            Amount = req.Amount,
            TransactionDate = req.TransactionDate,
            DueDate = req.DueDate,
            Category = req.Category,
            Status = req.Status,
            SupplierId = req.SupplierId,
            PaymentMethod = req.PaymentMethod,
            Notes = req.Notes,
            PaidAt = req.Status == "paid" ? DateTime.UtcNow : null,
        };

        _db.FinancialTransactions.Add(t);
        await _db.SaveChangesAsync(ct);
        return Ok(ToDto(t));
    }

    [Authorize(Roles = "admin,manager")]
    [HttpPut("{id:guid}")]
    public async Task<ActionResult<FinancialTransactionDto>> Update(Guid id, [FromBody] UpdateFinancialTransactionRequest req, CancellationToken ct)
    {
        var t = await _db.FinancialTransactions.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (t is null) return NotFound();

        var wasPaid = t.Status == "paid";
        t.Type = req.Type;
        t.Description = req.Description;
        t.Amount = req.Amount;
        t.TransactionDate = req.TransactionDate;
        t.DueDate = req.DueDate;
        t.Category = req.Category;
        t.Status = req.Status;
        t.SupplierId = req.SupplierId;
        t.PaymentMethod = req.PaymentMethod;
        t.Notes = req.Notes;
        if (!wasPaid && req.Status == "paid") t.PaidAt = DateTime.UtcNow;
        if (wasPaid && req.Status != "paid")  t.PaidAt = null;

        await _db.SaveChangesAsync(ct);
        return Ok(ToDto(t));
    }

    [Authorize(Roles = "admin,manager")]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var t = await _db.FinancialTransactions.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (t is null) return NotFound();
        _db.FinancialTransactions.Remove(t);
        await _db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpGet("summary")]
    public async Task<ActionResult<FinancialSummaryDto>> Summary(
        [FromQuery] DateOnly? from = null,
        [FromQuery] DateOnly? to = null,
        CancellationToken ct = default)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var startWindow = from ?? today.AddDays(-29);
        var endWindow = to ?? today;

        var allTx = await _db.FinancialTransactions.AsNoTracking()
            .Where(t => t.TransactionDate >= startWindow && t.TransactionDate <= endWindow)
            .Select(t => new { t.Type, t.Status, t.Amount, t.Category, t.TransactionDate })
            .ToListAsync(ct);

        var totalIncome  = allTx.Where(x => x.Type == "income"  && x.Status == "paid").Sum(x => x.Amount);
        var totalExpense = allTx.Where(x => x.Type == "expense" && x.Status == "paid").Sum(x => x.Amount);
        var pending      = allTx.Where(x => x.Status == "pending").Sum(x => x.Amount);
        var net          = totalIncome - totalExpense;

        // Margem média & valor em estoque
        var products = await _db.Products.AsNoTracking()
            .Where(p => p.IsActive)
            .Select(p => new { p.CostPrice, p.SalePrice, p.StockQuantity })
            .ToListAsync(ct);

        var margins = products
            .Where(p => p.CostPrice > 0)
            .Select(p => (p.SalePrice - p.CostPrice) / p.CostPrice * 100m)
            .ToList();
        var avgMargin = margins.Count > 0 ? Math.Round(margins.Average(), 2) : 0m;

        var stockSale = products.Sum(p => p.StockQuantity * p.SalePrice);
        var stockCost = products.Sum(p => p.StockQuantity * p.CostPrice);
        var roi = stockCost > 0 ? Math.Round(net / stockCost * 100m, 2) : 0m;

        // Cashflow 7 dias
        var sevenStart = today.AddDays(-6);
        var dailyDict = allTx
            .Where(x => x.TransactionDate >= sevenStart && x.Status == "paid")
            .GroupBy(x => x.TransactionDate)
            .ToDictionary(
                g => g.Key,
                g => new
                {
                    Income  = g.Where(x => x.Type == "income").Sum(x => x.Amount),
                    Expense = g.Where(x => x.Type == "expense").Sum(x => x.Amount),
                });

        var cashflow7 = new List<DailyFinancialPointDto>();
        for (int d = 0; d < 7; d++)
        {
            var date = sevenStart.AddDays(d);
            if (dailyDict.TryGetValue(date, out var v))
                cashflow7.Add(new DailyFinancialPointDto(date, v.Income, v.Expense));
            else
                cashflow7.Add(new DailyFinancialPointDto(date, 0m, 0m));
        }

        var byCat = allTx
            .Where(x => x.Type == "expense" && x.Status == "paid")
            .GroupBy(x => x.Category ?? "Outros")
            .Select(g => new CategoryExpenseDto(g.Key, g.Sum(x => x.Amount)))
            .OrderByDescending(c => c.Total)
            .Take(8)
            .ToList();

        return Ok(new FinancialSummaryDto(
            totalIncome, totalExpense, pending, net,
            avgMargin, stockSale, stockCost, roi,
            cashflow7, byCat));
    }
}
