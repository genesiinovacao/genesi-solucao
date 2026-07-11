using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Solucao.Backend.Data;
using Solucao.Backend.Models.Dtos.Products;
using Solucao.Backend.Models.Entities;
using Solucao.Backend.Services;

namespace Solucao.Backend.Controllers;

[ApiController]
[Authorize]
[Route("api/products")]
public class ProductsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ITenantContext _tenant;

    public ProductsController(AppDbContext db, ITenantContext tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    [HttpGet]
    public async Task<ActionResult<ProductListResponse>> List(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? search = null,
        [FromQuery] string? category = null,
        [FromQuery] bool? lowStockOnly = null,
        CancellationToken ct = default)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 200);

        var q = _db.Products.AsNoTracking().Where(p => p.IsActive);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim();
            q = q.Where(p => EF.Functions.ILike(p.Name, $"%{s}%")
                          || (p.Barcode != null && p.Barcode == s)
                          || (p.Sku != null && p.Sku == s));
        }

        if (!string.IsNullOrWhiteSpace(category))
            q = q.Where(p => p.Category == category);

        if (lowStockOnly == true)
            q = q.Where(p => p.StockQuantity <= p.MinStock);

        var total = await q.CountAsync(ct);

        var items = await q
            .OrderBy(p => p.Name)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(p => new ProductDto(
                p.Id, p.Sku, p.Barcode, p.Name, p.Description, p.Category, p.Unit, p.Emoji,
                p.CostPrice, p.SalePrice, p.StockQuantity, p.MinStock, p.IsActive, p.SupplierId, p.UpdatedAt))
            .ToListAsync(ct);

        var totalPages = (int)Math.Ceiling(total / (double)pageSize);
        return Ok(new ProductListResponse(items, page, pageSize, total, totalPages));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ProductDto>> Get(Guid id, CancellationToken ct)
    {
        var p = await _db.Products.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (p is null) return NotFound();

        return Ok(new ProductDto(
            p.Id, p.Sku, p.Barcode, p.Name, p.Description, p.Category, p.Unit, p.Emoji,
            p.CostPrice, p.SalePrice, p.StockQuantity, p.MinStock, p.IsActive, p.SupplierId, p.UpdatedAt));
    }

    [HttpPost]
    public async Task<ActionResult<ProductDto>> Create([FromBody] CreateProductRequest req, CancellationToken ct)
    {
        if (_tenant.TenantId is not { } tenantId) return Unauthorized();

        var p = new Product
        {
            TenantId = tenantId,
            Sku = req.Sku,
            Barcode = req.Barcode,
            Name = req.Name,
            Description = req.Description,
            Category = req.Category,
            Unit = string.IsNullOrWhiteSpace(req.Unit) ? "un" : req.Unit,
            Emoji = req.Emoji,
            CostPrice = req.CostPrice,
            SalePrice = req.SalePrice,
            StockQuantity = req.StockQuantity,
            MinStock = req.MinStock,
            SupplierId = req.SupplierId
        };

        _db.Products.Add(p);
        await _db.SaveChangesAsync(ct);

        return CreatedAtAction(nameof(Get), new { id = p.Id }, new ProductDto(
            p.Id, p.Sku, p.Barcode, p.Name, p.Description, p.Category, p.Unit, p.Emoji,
            p.CostPrice, p.SalePrice, p.StockQuantity, p.MinStock, p.IsActive, p.SupplierId, p.UpdatedAt));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ProductDto>> Update(Guid id, [FromBody] UpdateProductRequest req, CancellationToken ct)
    {
        var p = await _db.Products.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (p is null) return NotFound();

        p.Sku = req.Sku;
        p.Barcode = req.Barcode;
        p.Name = req.Name;
        p.Description = req.Description;
        p.Category = req.Category;
        p.Unit = string.IsNullOrWhiteSpace(req.Unit) ? "un" : req.Unit;
        p.Emoji = req.Emoji;
        p.CostPrice = req.CostPrice;
        p.SalePrice = req.SalePrice;
        p.MinStock = req.MinStock;
        p.SupplierId = req.SupplierId;
        p.IsActive = req.IsActive;

        await _db.SaveChangesAsync(ct);

        return Ok(new ProductDto(
            p.Id, p.Sku, p.Barcode, p.Name, p.Description, p.Category, p.Unit, p.Emoji,
            p.CostPrice, p.SalePrice, p.StockQuantity, p.MinStock, p.IsActive, p.SupplierId, p.UpdatedAt));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        // Soft delete to preserve sale history
        var p = await _db.Products.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (p is null) return NotFound();

        p.IsActive = false;
        await _db.SaveChangesAsync(ct);
        return NoContent();
    }
}
