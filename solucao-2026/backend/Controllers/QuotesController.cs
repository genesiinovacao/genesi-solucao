using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Solucao.Backend.Data;
using Solucao.Backend.Models.Dtos.Quotes;
using Solucao.Backend.Models.Entities;
using Solucao.Backend.Services;
using Solucao.Backend.Services.Billing;

namespace Solucao.Backend.Controllers;

/// <summary>
/// Orçamentos do balcão. Não movimentam estoque nem caixa — só viram número
/// quando o cliente volta e o PDV converte em venda (ver SyncController).
/// </summary>
[ApiController]
[Authorize]
[Route("api/quotes")]
public class QuotesController : ControllerBase
{
    private const int DefaultValidDays = 7;

    private readonly AppDbContext _db;
    private readonly ITenantContext _tenant;

    public QuotesController(AppDbContext db, ITenantContext tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    [HttpGet]
    public async Task<ActionResult<QuoteListResponse>> List(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? status = null,
        [FromQuery] string? search = null,
        CancellationToken ct = default)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 200);

        var q = _db.Quotes.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(status))
            q = q.Where(x => x.Status == status);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim();
            // O cliente chega com o papel na mão: o número é a busca principal
            if (long.TryParse(s, out var number))
                q = q.Where(x => x.Number == number);
            else
                q = q.Where(x => x.CustomerName != null && EF.Functions.ILike(x.CustomerName, $"%{s}%"));
        }

        var total = await q.CountAsync(ct);

        var pageData = await q
            .OrderByDescending(x => x.Number)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(x => new
            {
                x.Id, x.Number, x.CreatedAt, x.ValidUntil, x.CustomerName,
                x.UserId, x.TotalAmount, x.Status,
                ItemCount = x.Items.Count,
            })
            .ToListAsync(ct);

        var sellerNames = await SellerNamesAsync(pageData.Select(p => p.UserId), ct);
        var today = SubscriptionCycle.Today();

        var items = pageData.Select(p => new QuoteListItemDto(
            p.Id, p.Number, p.CreatedAt, p.ValidUntil,
            p.Status == "open" && p.ValidUntil < today,
            p.CustomerName,
            p.UserId is null ? null : sellerNames.GetValueOrDefault(p.UserId.Value),
            p.ItemCount, p.TotalAmount, p.Status)).ToList();

        return Ok(new QuoteListResponse(
            items, page, pageSize, total,
            (int)Math.Ceiling(total / (double)pageSize)));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<QuoteDto>> Get(Guid id, CancellationToken ct)
    {
        var quote = await _db.Quotes.AsNoTracking()
            .Include(x => x.Items)
            .FirstOrDefaultAsync(x => x.Id == id, ct);
        if (quote is null) return NotFound();

        return Ok(await ToDtoAsync(quote, ct));
    }

    [HttpPost]
    public async Task<ActionResult<QuoteDto>> Create([FromBody] CreateQuoteRequest req, CancellationToken ct)
    {
        if (_tenant.TenantId is not { } tenantId) return Unauthorized();
        if (req.Items is null || req.Items.Count == 0)
            return BadRequest(new { error = "Orçamento sem itens." });

        var validDays = req.ValidDays > 0 ? Math.Min(req.ValidDays, 365) : DefaultValidDays;

        // Transação para o sequencial não colidir entre dois caixas orçando
        // ao mesmo tempo — o índice único (tenant_id, number) é a garantia.
        await using var tx = await _db.Database.BeginTransactionAsync(ct);

        var lastNumber = await _db.Quotes
            .OrderByDescending(x => x.Number)
            .Select(x => (long?)x.Number)
            .FirstOrDefaultAsync(ct) ?? 0;

        var quote = new Quote
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Number = lastNumber + 1,
            UserId = _tenant.UserId,
            CustomerId = req.CustomerId,
            CustomerName = string.IsNullOrWhiteSpace(req.CustomerName) ? null : req.CustomerName.Trim(),
            CustomerPhone = string.IsNullOrWhiteSpace(req.CustomerPhone) ? null : req.CustomerPhone.Trim(),
            Subtotal = req.Subtotal,
            DiscountAmount = req.DiscountAmount,
            SurchargeAmount = req.SurchargeAmount,
            TotalAmount = req.TotalAmount,
            ValidUntil = SubscriptionCycle.Today().AddDays(validDays),
            Status = "open",
            Notes = req.Notes,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            Items = req.Items.Select(i => new QuoteItem
            {
                TenantId = tenantId,
                ProductId = i.ProductId,
                ProductName = i.ProductName,
                Quantity = i.Quantity,
                UnitPrice = i.UnitPrice,
                DiscountAmount = i.DiscountAmount,
                TotalPrice = i.TotalPrice,
            }).ToList(),
        };

        _db.Quotes.Add(quote);
        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return Ok(await ToDtoAsync(quote, ct));
    }

    /// <summary>
    /// Cancela um orçamento aberto. Não apaga: o histórico de quanto foi
    /// orçado e não virou venda é o que mostra onde a loja perde negócio.
    /// </summary>
    [HttpPost("{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid id, CancellationToken ct)
    {
        var quote = await _db.Quotes.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (quote is null) return NotFound();
        if (quote.Status == "converted")
            return BadRequest(new { error = "Orçamento já virou venda." });

        quote.Status = "cancelled";
        quote.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return NoContent();
    }

    private async Task<Dictionary<Guid, string>> SellerNamesAsync(IEnumerable<Guid?> ids, CancellationToken ct)
    {
        var list = ids.Where(x => x != null).Select(x => x!.Value).Distinct().ToList();
        if (list.Count == 0) return new Dictionary<Guid, string>();
        return await _db.Users.AsNoTracking()
            .Where(u => list.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.Name, ct);
    }

    private async Task<QuoteDto> ToDtoAsync(Quote q, CancellationToken ct)
    {
        string? sellerName = null;
        if (q.UserId is { } uid)
        {
            sellerName = await _db.Users.AsNoTracking()
                .Where(u => u.Id == uid).Select(u => u.Name).FirstOrDefaultAsync(ct);
        }

        return new QuoteDto(
            q.Id, q.Number, q.CreatedAt, q.ValidUntil,
            q.Status == "open" && q.ValidUntil < SubscriptionCycle.Today(),
            q.CustomerId, q.CustomerName, q.CustomerPhone, sellerName,
            q.Subtotal, q.DiscountAmount, q.SurchargeAmount, q.TotalAmount,
            q.Status, q.ConvertedSaleId, q.Notes,
            q.Items.Select(i => new QuoteItemDto(
                i.Id, i.ProductId, i.ProductName, i.Quantity,
                i.UnitPrice, i.DiscountAmount, i.TotalPrice)).ToList());
    }
}
