using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Solucao.Backend.Data;
using Solucao.Backend.Models.Entities;
using Solucao.Backend.Services;

namespace Solucao.Backend.Controllers;

[ApiController]
[Authorize]
[Route("api/sync")]
public class SyncController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ITenantContext _tenant;
    private readonly IStockAlertService _stockAlerts;
    private readonly ILogger<SyncController> _log;

    public SyncController(AppDbContext db, ITenantContext tenant, IStockAlertService stockAlerts, ILogger<SyncController> log)
    {
        _db = db;
        _tenant = tenant;
        _stockAlerts = stockAlerts;
        _log = log;
    }

    /// <summary>
    /// Receives a batch of sales captured offline by the PDV (Electron + SQLite).
    /// Idempotent via OfflineSyncId: duplicates are silently skipped.
    /// </summary>
    [HttpPost("sales")]
    public async Task<ActionResult<IReadOnlyList<SyncResult>>> SyncSales(
        [FromBody] List<SaleSyncDto> salesToSync,
        CancellationToken ct)
    {
        if (_tenant.TenantId is not { } tenantId) return Unauthorized();
        if (salesToSync is null || salesToSync.Count == 0)
            return BadRequest(new { error = "Nenhuma venda para sincronizar." });

        var results = new List<SyncResult>(salesToSync.Count);
        var incomingIds = salesToSync.Select(s => s.OfflineSyncId).ToList();

        var existingIds = await _db.Sales
            .Where(s => s.OfflineSyncId != null && incomingIds.Contains(s.OfflineSyncId.Value))
            .Select(s => s.OfflineSyncId!.Value)
            .ToListAsync(ct);

        var existingSet = existingIds.ToHashSet();

        // Carrega de uma vez os produtos vendidos para dar baixa de estoque
        var productIds = salesToSync
            .Where(s => !existingSet.Contains(s.OfflineSyncId))
            .SelectMany(s => s.Items)
            .Where(i => i.ProductId.HasValue)
            .Select(i => i.ProductId!.Value)
            .Distinct()
            .ToList();

        var products = await _db.Products
            .Where(p => productIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, ct);

        // Transação para manter venda + estoque + movimentações atômicos
        await using var tx = await _db.Database.BeginTransactionAsync(ct);

        foreach (var dto in salesToSync)
        {
            if (existingSet.Contains(dto.OfflineSyncId))
            {
                results.Add(new SyncResult(dto.OfflineSyncId, "AlreadySynced", null));
                continue;
            }

            try
            {
                var sale = new Sale
                {
                    // Gerado no cliente para poder referenciar nos stock_movements
                    // antes do SaveChanges (o default do banco só preenche após o INSERT)
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    UserId = _tenant.UserId,
                    CustomerId = dto.CustomerId,
                    OfflineSyncId = dto.OfflineSyncId,
                    CashSessionId = dto.CashSessionId,
                    SaleDate = dto.SaleDate,
                    Subtotal = dto.Subtotal,
                    DiscountAmount = dto.DiscountAmount,
                    SurchargeAmount = dto.SurchargeAmount,
                    TotalAmount = dto.TotalAmount,
                    PaymentMethod = dto.PaymentMethod,
                    AmountReceived = dto.AmountReceived,
                    ChangeAmount = dto.ChangeAmount,
                    PosTerminalId = dto.PosTerminalId,
                    Status = "completed",
                    Items = dto.Items.Select(i => new SaleItem
                    {
                        TenantId = tenantId,
                        ProductId = i.ProductId,
                        ProductName = i.ProductName,
                        Quantity = i.Quantity,
                        UnitPrice = i.UnitPrice,
                        DiscountAmount = i.DiscountAmount,
                        TotalPrice = i.TotalPrice
                    }).ToList(),
                    Payments = dto.Payments?.Select(p => new SalePayment
                    {
                        TenantId = tenantId,
                        Method = p.Method,
                        Amount = p.Amount,
                        AuthorizationCode = p.AuthorizationCode
                    }).ToList() ?? new()
                };

                _db.Sales.Add(sale);

                // Vale crédito: abate do saldo que o cliente ganhou em
                // devoluções. Nunca deixa negativo — se o PDV mandou mais que
                // o saldo (crédito usado noutro caixa), consome o que existe.
                var storeCredit = sale.Payments
                    .Where(p => p.Method == "store_credit")
                    .Sum(p => p.Amount);

                if (storeCredit > 0 && dto.CustomerId is { } customerId)
                {
                    var customer = await _db.Customers.FirstOrDefaultAsync(c => c.Id == customerId, ct);
                    if (customer is not null)
                    {
                        var usado = Math.Min(storeCredit, customer.CreditBalance);
                        customer.CreditBalance -= usado;
                        _log.LogInformation(
                            "Vale crédito: {Usado} abatido de {Cliente} (saldo restante {Saldo})",
                            usado, customer.Name, customer.CreditBalance);
                    }
                }

                // Baixa de estoque + movimentação (pode ficar negativo: vendas
                // offline podem ultrapassar o saldo conhecido pelo servidor)
                foreach (var item in dto.Items)
                {
                    if (item.ProductId is not { } pid || !products.TryGetValue(pid, out var product))
                        continue;

                    product.StockQuantity -= item.Quantity;

                    _db.StockMovements.Add(new StockMovement
                    {
                        TenantId = tenantId,
                        ProductId = pid,
                        UserId = _tenant.UserId,
                        MovementType = "sale",
                        Quantity = -item.Quantity,
                        BalanceAfter = product.StockQuantity,
                        UnitCost = product.CostPrice,
                        ReferenceType = "sale",
                        ReferenceId = sale.Id,
                        Notes = $"Venda sincronizada do PDV ({dto.PosTerminalId ?? "?"})",
                        CreatedAt = DateTime.UtcNow,
                    });
                }

                results.Add(new SyncResult(dto.OfflineSyncId, "Success", null));
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "Failed to map sale {OfflineSyncId}", dto.OfflineSyncId);
                results.Add(new SyncResult(dto.OfflineSyncId, "Error", ex.Message));
            }
        }

        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        // Após o commit: alerta em tempo real (SignalR) para produtos críticos
        try
        {
            await _stockAlerts.CheckAndNotifyAsync(tenantId, productIds, ct);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Falha ao enviar alertas de estoque (sync segue OK)");
        }

        return Ok(results);
    }
}

public record SaleSyncDto(
    Guid OfflineSyncId,
    Guid? CustomerId,
    DateTime SaleDate,
    decimal Subtotal,
    decimal DiscountAmount,
    decimal TotalAmount,
    string PaymentMethod,
    decimal? AmountReceived,
    decimal? ChangeAmount,
    string? PosTerminalId,
    Guid? CashSessionId,
    List<SaleItemSyncDto> Items,
    List<SalePaymentSyncDto>? Payments,
    // Opcional: PDV antigo não envia, e o padrão zero mantém o total correto
    decimal SurchargeAmount = 0);

public record SaleItemSyncDto(
    Guid? ProductId,
    string ProductName,
    decimal Quantity,
    decimal UnitPrice,
    decimal DiscountAmount,
    decimal TotalPrice);

public record SalePaymentSyncDto(
    string Method,
    decimal Amount,
    string? AuthorizationCode);

public record SyncResult(Guid OfflineSyncId, string Status, string? Message);
