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
        /// <summary>Só saldo negativo — a fila de regularização da entrada de nota.</summary>
        [FromQuery] bool? negativeStockOnly = null,
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

        if (negativeStockOnly == true)
            q = q.Where(p => p.StockQuantity < 0);

        var total = await q.CountAsync(ct);

        var items = await q
            .OrderBy(p => p.Name)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(p => new ProductDto(
                p.Id, p.Sku, p.Barcode, p.Name, p.Description, p.Category, p.Unit, p.Emoji,
                p.CostPrice, p.SalePrice, p.StockQuantity, p.MinStock, p.ExpiryDate, p.IsActive, p.SupplierId, p.UpdatedAt))
            .ToListAsync(ct);

        var totalPages = (int)Math.Ceiling(total / (double)pageSize);
        return Ok(new ProductListResponse(items, page, pageSize, total, totalPages));
    }

    /// <summary>
    /// Categorias em uso na loja. Alimenta a seleção de alvo da promoção —
    /// digitar a categoria à mão fazia a promoção não pegar nada.
    /// </summary>
    [HttpGet("categories")]
    public async Task<ActionResult<List<string>>> Categories(CancellationToken ct)
    {
        var categories = await _db.Products.AsNoTracking()
            .Where(p => p.IsActive && p.Category != null && p.Category != "")
            .Select(p => p.Category!)
            .Distinct()
            .OrderBy(c => c)
            .ToListAsync(ct);

        return Ok(categories);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ProductDto>> Get(Guid id, CancellationToken ct)
    {
        var p = await _db.Products.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (p is null) return NotFound();

        return Ok(new ProductDto(
            p.Id, p.Sku, p.Barcode, p.Name, p.Description, p.Category, p.Unit, p.Emoji,
            p.CostPrice, p.SalePrice, p.StockQuantity, p.MinStock, p.ExpiryDate, p.IsActive, p.SupplierId, p.UpdatedAt));
    }

    [Authorize(Roles = "admin,manager")]
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
            ExpiryDate = req.ExpiryDate,
            SupplierId = req.SupplierId
        };

        _db.Products.Add(p);
        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (IsUniqueViolation(ex))
        {
            return Conflict(new { error = DuplicateMessage(req.Sku, req.Barcode) });
        }

        return CreatedAtAction(nameof(Get), new { id = p.Id }, new ProductDto(
            p.Id, p.Sku, p.Barcode, p.Name, p.Description, p.Category, p.Unit, p.Emoji,
            p.CostPrice, p.SalePrice, p.StockQuantity, p.MinStock, p.ExpiryDate, p.IsActive, p.SupplierId, p.UpdatedAt));
    }

    [Authorize(Roles = "admin,manager")]
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
        p.ExpiryDate = req.ExpiryDate;
        p.SupplierId = req.SupplierId;
        p.IsActive = req.IsActive;

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (IsUniqueViolation(ex))
        {
            return Conflict(new { error = DuplicateMessage(req.Sku, req.Barcode) });
        }

        return Ok(new ProductDto(
            p.Id, p.Sku, p.Barcode, p.Name, p.Description, p.Category, p.Unit, p.Emoji,
            p.CostPrice, p.SalePrice, p.StockQuantity, p.MinStock, p.ExpiryDate, p.IsActive, p.SupplierId, p.UpdatedAt));
    }

    // SKU e código de barras são únicos por loja. Sem isto o operador receberia
    // um erro cru do banco — e com o SKU sugerido a colisão fica mais provável.
    private static bool IsUniqueViolation(DbUpdateException ex) =>
        ex.InnerException is Npgsql.PostgresException { SqlState: "23505" };

    private static string DuplicateMessage(string? sku, string? barcode)
    {
        var campos = new List<string>();
        if (!string.IsNullOrWhiteSpace(sku)) campos.Add($"SKU \"{sku}\"");
        if (!string.IsNullOrWhiteSpace(barcode)) campos.Add($"código de barras \"{barcode}\"");
        var alvo = campos.Count > 0 ? string.Join(" ou ", campos) : "SKU ou código de barras";
        return $"Já existe um produto com esse {alvo}. Altere para um valor diferente.";
    }

    public record AdjustStockRequest(decimal NewQuantity, string? Reason);

    /// <summary>
    /// Correção manual de estoque (inventário, cadastro errado, quebra).
    /// Não edita o número por fora: grava um movimento "adjustment" com o
    /// delta e o motivo, preservando a auditoria do estoque.
    /// </summary>
    [Authorize(Roles = "admin,manager")]
    [HttpPost("{id:guid}/adjust-stock")]
    public async Task<ActionResult<ProductDto>> AdjustStock(
        Guid id, [FromBody] AdjustStockRequest req, CancellationToken ct)
    {
        if (req.NewQuantity < 0)
            return BadRequest(new { error = "A quantidade em estoque não pode ser negativa." });

        var p = await _db.Products.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (p is null) return NotFound();

        var delta = req.NewQuantity - p.StockQuantity;
        if (delta != 0)
        {
            p.StockQuantity = req.NewQuantity;
            _db.StockMovements.Add(new StockMovement
            {
                TenantId = p.TenantId,
                ProductId = p.Id,
                UserId = _tenant.UserId,
                MovementType = "adjustment",
                Quantity = delta,
                BalanceAfter = req.NewQuantity,
                UnitCost = p.CostPrice,
                ReferenceType = "manual",
                Notes = string.IsNullOrWhiteSpace(req.Reason) ? "Ajuste manual" : req.Reason.Trim(),
                CreatedAt = DateTime.UtcNow,
            });
            await _db.SaveChangesAsync(ct);
        }

        return Ok(new ProductDto(
            p.Id, p.Sku, p.Barcode, p.Name, p.Description, p.Category, p.Unit, p.Emoji,
            p.CostPrice, p.SalePrice, p.StockQuantity, p.MinStock, p.ExpiryDate, p.IsActive, p.SupplierId, p.UpdatedAt));
    }

    [Authorize(Roles = "admin,manager")]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var p = await _db.Products.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (p is null) return NotFound();

        // Produto sem nenhuma venda/movimentação (cadastro errado, duplicado)
        // pode sumir de verdade; com histórico é apenas desativado, senão as
        // vendas antigas perderiam os itens (FK em cascata).
        var hasHistory = await _db.SaleItems.AnyAsync(i => i.ProductId == id, ct)
                      || await _db.StockMovements.AnyAsync(m => m.ProductId == id, ct);

        if (!hasHistory)
        {
            _db.Products.Remove(p);
            await _db.SaveChangesAsync(ct);
            return Ok(new { removed = true });
        }

        p.IsActive = false;
        await _db.SaveChangesAsync(ct);
        return Ok(new { removed = false });
    }
}
