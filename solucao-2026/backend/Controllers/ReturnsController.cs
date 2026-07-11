using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Solucao.Backend.Data;
using Solucao.Backend.Models.Dtos.Returns;
using Solucao.Backend.Models.Entities;
using Solucao.Backend.Services;

namespace Solucao.Backend.Controllers;

[ApiController]
[Authorize]
[Route("api/sales/{saleId:guid}/returns")]
public class ReturnsController : ControllerBase
{
    private static readonly HashSet<string> AllowedMethods = new()
    { "cash", "pix", "credit", "customer_credit" };

    private readonly AppDbContext _db;
    private readonly ITenantContext _tenant;

    public ReturnsController(AppDbContext db, ITenantContext tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    /// <summary>
    /// Registers a return (parcial ou total) of a sale.
    /// - Restores stock for each returned item (creates stock_movements rows)
    /// - Updates sale.status to 'returned' or 'partial_returned'
    /// - If refundMethod = 'customer_credit', credits the linked customer
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<SaleReturnDto>> Create(Guid saleId, [FromBody] CreateSaleReturnRequest req, CancellationToken ct)
    {
        if (_tenant.TenantId is not { } tenantId) return Unauthorized();
        if (_tenant.UserId is null) return Unauthorized();
        if (!AllowedMethods.Contains(req.RefundMethod))
            return BadRequest(new { error = $"refundMethod inválido. Permitidos: {string.Join(", ", AllowedMethods)}" });
        if (req.Items is null || req.Items.Count == 0)
            return BadRequest(new { error = "Informe pelo menos um item para devolver." });

        var sale = await _db.Sales
            .Include(s => s.Items)
            .FirstOrDefaultAsync(s => s.Id == saleId, ct);
        if (sale is null) return NotFound(new { error = "Venda não encontrada." });
        if (sale.Status == "cancelled" || sale.Status == "returned")
            return BadRequest(new { error = $"Venda já está {sale.Status}." });

        // Map line requests to actual sale items + validate quantities
        var saleItemsById = sale.Items.ToDictionary(i => i.Id);

        // Quanto já foi devolvido em devoluções anteriores
        var priorReturned = await _db.SaleReturnItems.AsNoTracking()
            .Where(ri => sale.Items.Select(i => i.Id).Contains(ri.SaleItemId))
            .GroupBy(ri => ri.SaleItemId)
            .Select(g => new { SaleItemId = g.Key, Qty = g.Sum(x => x.QuantityReturned) })
            .ToDictionaryAsync(x => x.SaleItemId, x => x.Qty, ct);

        var returnLines = new List<SaleReturnItem>();
        decimal totalRefund = 0m;

        foreach (var line in req.Items)
        {
            if (!saleItemsById.TryGetValue(line.SaleItemId, out var item))
                return BadRequest(new { error = $"Item {line.SaleItemId} não pertence à venda." });
            if (line.Quantity <= 0)
                return BadRequest(new { error = $"Quantidade do item {item.ProductName} deve ser > 0." });

            var alreadyReturned = priorReturned.GetValueOrDefault(item.Id, 0m);
            var remaining = item.Quantity - alreadyReturned;
            if (line.Quantity > remaining)
                return BadRequest(new { error = $"{item.ProductName}: só restam {remaining} para devolver." });

            var refund = Math.Round(line.Quantity * item.UnitPrice, 2);
            totalRefund += refund;

            returnLines.Add(new SaleReturnItem
            {
                TenantId = tenantId,
                SaleItemId = item.Id,
                ProductId = item.ProductId,
                QuantityReturned = line.Quantity,
                UnitPrice = item.UnitPrice,
                RefundAmount = refund,
            });
        }

        // Determina se a devolução é total ou parcial considerando o que ainda restava
        var totalRemainingQty = sale.Items.Sum(i => i.Quantity - priorReturned.GetValueOrDefault(i.Id, 0m));
        var totalReturningQty = req.Items.Sum(x => x.Quantity);
        var isPartial = totalReturningQty < totalRemainingQty;

        // Transação para manter estoque + saldo do cliente atômicos
        await using var tx = await _db.Database.BeginTransactionAsync(ct);

        var saleReturn = new SaleReturn
        {
            // Gerado no cliente para poder referenciar nos stock_movements
            // antes do SaveChanges (o default do banco só preenche após o INSERT)
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            SaleId = sale.Id,
            CustomerId = sale.CustomerId,
            UserId = _tenant.UserId,
            TotalRefund = totalRefund,
            RefundMethod = req.RefundMethod,
            Reason = req.Reason,
            IsPartial = isPartial,
            CreatedAt = DateTime.UtcNow,
        };
        foreach (var ri in returnLines) ri.SaleReturnId = saleReturn.Id;
        saleReturn.Items = returnLines;
        _db.SaleReturns.Add(saleReturn);

        // Estorna estoque + cria stock_movements
        foreach (var ri in returnLines)
        {
            if (ri.ProductId is not { } pid) continue;
            var product = await _db.Products.FirstOrDefaultAsync(p => p.Id == pid, ct);
            if (product is null) continue;
            product.StockQuantity += ri.QuantityReturned;

            _db.StockMovements.Add(new StockMovement
            {
                TenantId = tenantId,
                ProductId = pid,
                UserId = _tenant.UserId,
                MovementType = "return",
                Quantity = ri.QuantityReturned,
                BalanceAfter = product.StockQuantity,
                ReferenceType = "sale_return",
                ReferenceId = saleReturn.Id,
                Notes = req.Reason,
                CreatedAt = DateTime.UtcNow,
            });
        }

        // Atualiza status da venda
        sale.Status = isPartial ? "partial_returned" : "returned";

        // Crédito ao cliente se solicitado
        decimal? customerCreditAfter = null;
        if (req.RefundMethod == "customer_credit")
        {
            if (sale.CustomerId is not { } cid)
                return BadRequest(new { error = "Para gerar crédito é preciso uma venda com cliente identificado." });
            var customer = await _db.Customers.FirstOrDefaultAsync(c => c.Id == cid, ct);
            if (customer is null) return BadRequest(new { error = "Cliente da venda não encontrado." });
            customer.CreditBalance += totalRefund;
            customerCreditAfter = customer.CreditBalance;
        }

        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return Ok(new SaleReturnDto(
            saleReturn.Id, saleReturn.SaleId, saleReturn.CustomerId,
            sale.CustomerId is null ? null
                : await _db.Customers.AsNoTracking().Where(c => c.Id == sale.CustomerId).Select(c => c.Name).FirstOrDefaultAsync(ct),
            saleReturn.TotalRefund, saleReturn.RefundMethod, saleReturn.Reason, saleReturn.IsPartial, saleReturn.CreatedAt,
            sale.Status, customerCreditAfter,
            returnLines.Select(r => new SaleReturnItemDto(
                r.Id, r.SaleItemId, r.ProductId,
                saleItemsById[r.SaleItemId].ProductName,
                r.QuantityReturned, r.UnitPrice, r.RefundAmount)).ToList()));
    }

    /// <summary>List existing returns for a given sale.</summary>
    [HttpGet]
    public async Task<ActionResult<List<SaleReturnDto>>> List(Guid saleId, CancellationToken ct)
    {
        var sale = await _db.Sales.AsNoTracking()
            .Include(s => s.Items)
            .FirstOrDefaultAsync(s => s.Id == saleId, ct);
        if (sale is null) return NotFound();

        var nameBySaleItem = sale.Items.ToDictionary(i => i.Id, i => i.ProductName);

        var returns = await _db.SaleReturns.AsNoTracking()
            .Where(r => r.SaleId == saleId)
            .Include(r => r.Items)
            .OrderByDescending(r => r.CreatedAt)
            .ToListAsync(ct);

        var customerName = sale.CustomerId is { } cid
            ? await _db.Customers.AsNoTracking().Where(c => c.Id == cid).Select(c => c.Name).FirstOrDefaultAsync(ct)
            : null;

        return Ok(returns.Select(r => new SaleReturnDto(
            r.Id, r.SaleId, r.CustomerId, customerName,
            r.TotalRefund, r.RefundMethod, r.Reason, r.IsPartial, r.CreatedAt,
            sale.Status, null,
            r.Items.Select(it => new SaleReturnItemDto(
                it.Id, it.SaleItemId, it.ProductId,
                nameBySaleItem.GetValueOrDefault(it.SaleItemId, ""),
                it.QuantityReturned, it.UnitPrice, it.RefundAmount)).ToList())).ToList());
    }
}
