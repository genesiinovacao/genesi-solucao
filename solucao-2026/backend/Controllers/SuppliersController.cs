using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Solucao.Backend.Data;
using Solucao.Backend.Models.Dtos.Suppliers;
using Solucao.Backend.Models.Entities;
using Solucao.Backend.Services;

namespace Solucao.Backend.Controllers;

[ApiController]
[Authorize]
[Route("api/suppliers")]
public class SuppliersController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ITenantContext _tenant;

    public SuppliersController(AppDbContext db, ITenantContext tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    private static SupplierDto ToDto(Supplier s) => new(
        s.Id, s.Name, s.Cnpj, s.ContactName, s.Phone, s.Email, s.Address,
        s.Category, s.Status, s.Notes, s.CreatedAt, s.UpdatedAt);

    [HttpGet]
    public async Task<ActionResult<SupplierListResponse>> List(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? search = null,
        [FromQuery] string? status = null,
        [FromQuery] string? category = null,
        CancellationToken ct = default)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 200);

        var q = _db.Suppliers.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim();
            q = q.Where(x => EF.Functions.ILike(x.Name, $"%{s}%")
                          || (x.Cnpj != null && EF.Functions.ILike(x.Cnpj, $"%{s}%"))
                          || (x.ContactName != null && EF.Functions.ILike(x.ContactName, $"%{s}%")));
        }
        if (!string.IsNullOrWhiteSpace(status))   q = q.Where(x => x.Status == status);
        if (!string.IsNullOrWhiteSpace(category)) q = q.Where(x => x.Category == category);

        var total = await q.CountAsync(ct);
        var items = await q.OrderBy(x => x.Name)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .ToListAsync(ct);

        return Ok(new SupplierListResponse(
            items.Select(ToDto).ToList(),
            page, pageSize, total,
            (int)Math.Ceiling(total / (double)pageSize)));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<SupplierDto>> Get(Guid id, CancellationToken ct)
    {
        var s = await _db.Suppliers.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (s is null) return NotFound();
        return Ok(ToDto(s));
    }

    [Authorize(Roles = "admin,manager")]
    [HttpPost]
    public async Task<ActionResult<SupplierDto>> Create([FromBody] CreateSupplierRequest req, CancellationToken ct)
    {
        if (_tenant.TenantId is not { } tenantId) return Unauthorized();

        var s = new Supplier
        {
            TenantId = tenantId,
            Name = req.Name,
            Cnpj = req.Cnpj,
            ContactName = req.ContactName,
            Phone = req.Phone,
            Email = req.Email,
            Address = req.Address,
            Category = req.Category,
            Notes = req.Notes,
            Status = "active",
        };

        _db.Suppliers.Add(s);
        await _db.SaveChangesAsync(ct);
        return CreatedAtAction(nameof(Get), new { id = s.Id }, ToDto(s));
    }

    [Authorize(Roles = "admin,manager")]
    [HttpPut("{id:guid}")]
    public async Task<ActionResult<SupplierDto>> Update(Guid id, [FromBody] UpdateSupplierRequest req, CancellationToken ct)
    {
        var s = await _db.Suppliers.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (s is null) return NotFound();

        s.Name = req.Name;
        s.Cnpj = req.Cnpj;
        s.ContactName = req.ContactName;
        s.Phone = req.Phone;
        s.Email = req.Email;
        s.Address = req.Address;
        s.Category = req.Category;
        s.Status = req.Status;
        s.Notes = req.Notes;

        await _db.SaveChangesAsync(ct);
        return Ok(ToDto(s));
    }

    [Authorize(Roles = "admin,manager")]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var s = await _db.Suppliers.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (s is null) return NotFound();

        s.Status = "inactive";
        await _db.SaveChangesAsync(ct);
        return NoContent();
    }
}
