using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Solucao.Backend.Data;
using Solucao.Backend.Models.Dtos.Sales;

namespace Solucao.Backend.Controllers;

[ApiController]
[Authorize]
[Route("api/sales")]
public class SalesController : ControllerBase
{
    private readonly AppDbContext _db;

    public SalesController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<ActionResult<SaleListResponse>> List(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to = null,
        [FromQuery] Guid? customerId = null,
        [FromQuery] string? status = null,
        CancellationToken ct = default)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 200);

        var q = _db.Sales.AsNoTracking().AsQueryable();
        if (from is not null) q = q.Where(s => s.SaleDate >= from);
        if (to is not null)   q = q.Where(s => s.SaleDate < to);
        if (customerId is not null) q = q.Where(s => s.CustomerId == customerId);
        if (!string.IsNullOrWhiteSpace(status)) q = q.Where(s => s.Status == status);

        var total = await q.CountAsync(ct);

        var pageData = await q
            .OrderByDescending(s => s.SaleDate)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(s => new
            {
                s.Id,
                s.SaleDate,
                s.CustomerId,
                s.TotalAmount,
                s.PaymentMethod,
                s.Status,
                ItemCount = s.Items.Count
            })
            .ToListAsync(ct);

        // Resolve customer names in a single query
        var customerIds = pageData.Where(p => p.CustomerId != null).Select(p => p.CustomerId!.Value).Distinct().ToList();
        var customerNames = customerIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await _db.Customers.AsNoTracking()
                .Where(c => customerIds.Contains(c.Id))
                .ToDictionaryAsync(c => c.Id, c => c.Name, ct);

        var items = pageData.Select(p => new SaleListItemDto(
            p.Id, p.SaleDate,
            p.CustomerId is null ? null : customerNames.GetValueOrDefault(p.CustomerId.Value),
            p.ItemCount,
            p.TotalAmount,
            p.PaymentMethod,
            p.Status)).ToList();

        return Ok(new SaleListResponse(
            items, page, pageSize, total,
            (int)Math.Ceiling(total / (double)pageSize)));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<SaleDetailDto>> Get(Guid id, CancellationToken ct)
    {
        var s = await _db.Sales.AsNoTracking()
            .Include(x => x.Items)
            .Include(x => x.Payments)
            .FirstOrDefaultAsync(x => x.Id == id, ct);

        if (s is null) return NotFound();

        string? customerName = null;
        if (s.CustomerId is { } cid)
        {
            customerName = await _db.Customers.AsNoTracking()
                .Where(c => c.Id == cid)
                .Select(c => c.Name)
                .FirstOrDefaultAsync(ct);
        }

        return Ok(new SaleDetailDto(
            s.Id, s.SaleDate, s.CustomerId, customerName,
            s.Subtotal, s.DiscountAmount, s.TotalAmount,
            s.PaymentMethod, s.AmountReceived, s.ChangeAmount, s.Status,
            s.Items.Select(i => new SaleItemDto(
                i.Id, i.ProductId, i.ProductName, i.Quantity,
                i.UnitPrice, i.DiscountAmount, i.TotalPrice)).ToList(),
            s.Payments.Select(p => new SalePaymentDto(p.Id, p.Method, p.Amount)).ToList(),
            s.SurchargeAmount));
    }
}
