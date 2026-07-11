using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Solucao.Backend.Data;
using Solucao.Backend.Models.Dtos.Customers;
using Solucao.Backend.Models.Entities;
using Solucao.Backend.Services;

namespace Solucao.Backend.Controllers;

[ApiController]
[Authorize]
[Route("api/customers")]
public class CustomersController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ITenantContext _tenant;

    public CustomersController(AppDbContext db, ITenantContext tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    private static string Tier(int points) =>
        points >= 1000 ? "gold" : points >= 500 ? "silver" : "bronze";

    private static CustomerDto ToDto(Customer c) => new(
        c.Id, c.Name, c.TaxId, c.Email, c.Phone, c.Address,
        c.LoyaltyPoints, c.TotalSpent, c.Status, Tier(c.LoyaltyPoints),
        c.BirthDate, c.CreatedAt, c.UpdatedAt);

    [HttpGet]
    public async Task<ActionResult<CustomerListResponse>> List(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? search = null,
        [FromQuery] string? status = null,
        [FromQuery] string? tier = null,
        CancellationToken ct = default)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 200);

        var q = _db.Customers.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim();
            q = q.Where(c => EF.Functions.ILike(c.Name, $"%{s}%")
                          || (c.TaxId != null && EF.Functions.ILike(c.TaxId, $"%{s}%"))
                          || (c.Email != null && EF.Functions.ILike(c.Email, $"%{s}%"))
                          || (c.Phone != null && EF.Functions.ILike(c.Phone, $"%{s}%")));
        }

        if (!string.IsNullOrWhiteSpace(status))
            q = q.Where(c => c.Status == status);

        if (tier == "gold")        q = q.Where(c => c.LoyaltyPoints >= 1000);
        else if (tier == "silver") q = q.Where(c => c.LoyaltyPoints >= 500 && c.LoyaltyPoints < 1000);
        else if (tier == "bronze") q = q.Where(c => c.LoyaltyPoints < 500);
        else if (tier == "vip")    q = q.Where(c => c.LoyaltyPoints >= 500);

        var total = await q.CountAsync(ct);

        var items = await q
            .OrderByDescending(c => c.LoyaltyPoints)
            .ThenBy(c => c.Name)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        return Ok(new CustomerListResponse(
            items.Select(ToDto).ToList(),
            page, pageSize, total,
            (int)Math.Ceiling(total / (double)pageSize)));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<CustomerDto>> Get(Guid id, CancellationToken ct)
    {
        var c = await _db.Customers.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c is null) return NotFound();
        return Ok(ToDto(c));
    }

    [HttpPost]
    public async Task<ActionResult<CustomerDto>> Create([FromBody] CreateCustomerRequest req, CancellationToken ct)
    {
        if (_tenant.TenantId is not { } tenantId) return Unauthorized();

        var c = new Customer
        {
            TenantId = tenantId,
            Name = req.Name,
            TaxId = req.TaxId,
            Email = req.Email,
            Phone = req.Phone,
            Address = req.Address,
            LoyaltyPoints = req.LoyaltyPoints,
            BirthDate = req.BirthDate,
            Notes = req.Notes,
            Status = "active",
        };

        _db.Customers.Add(c);
        await _db.SaveChangesAsync(ct);
        return CreatedAtAction(nameof(Get), new { id = c.Id }, ToDto(c));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<CustomerDto>> Update(Guid id, [FromBody] UpdateCustomerRequest req, CancellationToken ct)
    {
        var c = await _db.Customers.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c is null) return NotFound();

        c.Name = req.Name;
        c.TaxId = req.TaxId;
        c.Email = req.Email;
        c.Phone = req.Phone;
        c.Address = req.Address;
        c.LoyaltyPoints = req.LoyaltyPoints;
        c.Status = req.Status;
        c.BirthDate = req.BirthDate;
        c.Notes = req.Notes;

        await _db.SaveChangesAsync(ct);
        return Ok(ToDto(c));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var c = await _db.Customers.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c is null) return NotFound();

        // Soft delete to preserve sales history
        c.Status = "inactive";
        await _db.SaveChangesAsync(ct);
        return NoContent();
    }
}
