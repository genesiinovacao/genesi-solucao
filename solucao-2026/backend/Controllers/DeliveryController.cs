using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Solucao.Backend.Data;
using Solucao.Backend.Models.Dtos.Delivery;
using Solucao.Backend.Models.Entities;
using Solucao.Backend.Services;

namespace Solucao.Backend.Controllers;

[ApiController]
[Authorize]
[Route("api/delivery")]
public class DeliveryController : ControllerBase
{
    private static readonly HashSet<string> AllowedStatus = new()
    { "pending", "preparing", "out_for_delivery", "delivered", "cancelled" };

    private readonly AppDbContext _db;
    private readonly ITenantContext _tenant;

    public DeliveryController(AppDbContext db, ITenantContext tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    private static DeliveryOrderDto ToDto(DeliveryOrder d) => new(
        d.Id, d.OrderNumber, d.CustomerName, d.CustomerPhone, d.DeliveryAddress,
        d.ItemsSummary, d.TotalAmount, d.DeliveryFee, d.PaymentMethod, d.Status,
        d.DriverName, d.RequestedAt, d.DeliveredAt, d.Notes);

    /// <summary>Kanban board: groups orders by status.</summary>
    [HttpGet("board")]
    public async Task<ActionResult<DeliveryBoardDto>> Board(CancellationToken ct)
    {
        // Only show "delivered" from the last 24h so the column doesn't bloat
        var since = DateTime.UtcNow.AddDays(-1);

        var orders = await _db.DeliveryOrders.AsNoTracking()
            .Where(d => d.Status != "delivered" || d.DeliveredAt >= since)
            .OrderBy(d => d.RequestedAt)
            .ToListAsync(ct);

        return Ok(new DeliveryBoardDto(
            orders.Where(o => o.Status == "pending").Select(ToDto).ToList(),
            orders.Where(o => o.Status == "preparing").Select(ToDto).ToList(),
            orders.Where(o => o.Status == "out_for_delivery").Select(ToDto).ToList(),
            orders.Where(o => o.Status == "delivered").Select(ToDto).ToList()));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<DeliveryOrderDto>> Get(Guid id, CancellationToken ct)
    {
        var d = await _db.DeliveryOrders.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (d is null) return NotFound();
        return Ok(ToDto(d));
    }

    [HttpPost]
    public async Task<ActionResult<DeliveryOrderDto>> Create([FromBody] CreateDeliveryRequest req, CancellationToken ct)
    {
        if (_tenant.TenantId is not { } tenantId) return Unauthorized();

        // Compute a friendly order number per tenant (#DEL001, #DEL002, ...)
        var todayCount = await _db.DeliveryOrders.AsNoTracking()
            .CountAsync(d => d.RequestedAt >= DateTime.UtcNow.Date, ct);
        var orderNumber = $"#DEL{(todayCount + 1):D3}";

        var d = new DeliveryOrder
        {
            TenantId = tenantId,
            CustomerId = req.CustomerId,
            OrderNumber = orderNumber,
            CustomerName = req.CustomerName,
            CustomerPhone = req.CustomerPhone,
            DeliveryAddress = req.DeliveryAddress,
            ItemsSummary = req.ItemsSummary,
            TotalAmount = req.TotalAmount,
            DeliveryFee = req.DeliveryFee,
            PaymentMethod = req.PaymentMethod,
            Notes = req.Notes,
            Status = "pending",
            RequestedAt = DateTime.UtcNow,
        };

        _db.DeliveryOrders.Add(d);
        await _db.SaveChangesAsync(ct);
        return CreatedAtAction(nameof(Get), new { id = d.Id }, ToDto(d));
    }

    /// <summary>Move the order across the kanban columns.</summary>
    [HttpPost("{id:guid}/status")]
    public async Task<ActionResult<DeliveryOrderDto>> ChangeStatus(Guid id, [FromBody] UpdateDeliveryStatusRequest req, CancellationToken ct)
    {
        if (!AllowedStatus.Contains(req.Status))
            return BadRequest(new { error = $"Status inválido. Permitidos: {string.Join(", ", AllowedStatus)}" });

        var d = await _db.DeliveryOrders.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (d is null) return NotFound();

        d.Status = req.Status;
        if (req.DriverName is not null) d.DriverName = req.DriverName;
        if (req.Status == "delivered") d.DeliveredAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);
        return Ok(ToDto(d));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var d = await _db.DeliveryOrders.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (d is null) return NotFound();
        _db.DeliveryOrders.Remove(d);
        await _db.SaveChangesAsync(ct);
        return NoContent();
    }
}
