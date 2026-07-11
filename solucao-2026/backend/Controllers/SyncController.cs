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
    private readonly ILogger<SyncController> _log;

    public SyncController(AppDbContext db, ITenantContext tenant, ILogger<SyncController> log)
    {
        _db = db;
        _tenant = tenant;
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
                    TenantId = tenantId,
                    UserId = _tenant.UserId,
                    CustomerId = dto.CustomerId,
                    OfflineSyncId = dto.OfflineSyncId,
                    CashSessionId = dto.CashSessionId,
                    SaleDate = dto.SaleDate,
                    Subtotal = dto.Subtotal,
                    DiscountAmount = dto.DiscountAmount,
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
                results.Add(new SyncResult(dto.OfflineSyncId, "Success", null));
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "Failed to map sale {OfflineSyncId}", dto.OfflineSyncId);
                results.Add(new SyncResult(dto.OfflineSyncId, "Error", ex.Message));
            }
        }

        await _db.SaveChangesAsync(ct);
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
    List<SalePaymentSyncDto>? Payments);

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
