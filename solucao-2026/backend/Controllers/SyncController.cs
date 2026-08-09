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
    /// Traduz a exceção do banco para algo que o operador do caixa consiga
    /// repassar. "HTTP 500: Null" na tela do PDV não ajuda ninguém: o defeito
    /// costuma ser dado (produto apagado depois da venda offline, sessão de
    /// caixa que não existe mais), e quem vê a tela precisa saber qual.
    /// </summary>
    private static string Describe(Exception ex)
    {
        var pg = ex as Npgsql.PostgresException
              ?? ex.InnerException as Npgsql.PostgresException;

        if (pg is null) return ex.Message;

        return pg.SqlState switch
        {
            // 23503 foreign_key_violation
            "23503" when pg.ConstraintName?.Contains("product") == true =>
                "Produto desta venda não existe mais no cadastro. "
                + "Recadastre-o (ou reative) e sincronize de novo.",
            "23503" when pg.ConstraintName?.Contains("cash_session") == true =>
                "A sessão de caixa desta venda não existe mais no servidor. "
                + "Feche e reabra o caixa no PDV.",
            "23503" when pg.ConstraintName?.Contains("customer") == true =>
                "O cliente desta venda não existe mais no cadastro.",
            "23503" => $"Referência inexistente no servidor ({pg.ConstraintName}).",
            // 23514 check_violation — valor novo que o banco ainda não aceita
            "23514" => $"Valor recusado pelo banco ({pg.ConstraintName}). "
                     + "Provavelmente falta aplicar uma migração no servidor.",
            // 23505 unique_violation
            "23505" => $"Registro duplicado ({pg.ConstraintName}).",
            // 42703 undefined_column — o clássico: código novo, banco antigo
            "42703" => $"Coluna ausente no banco ({pg.MessageText}). "
                     + "Falta aplicar a migração correspondente.",
            _ => $"{pg.SqlState}: {pg.MessageText}",
        };
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

        // Mapa, não só conjunto: o reenvio precisa devolver o id da venda
        // que já existe, senão o PDV não consegue emitir a nota dela.
        var existing = await _db.Sales
            .Where(s => s.OfflineSyncId != null && incomingIds.Contains(s.OfflineSyncId.Value))
            .Select(s => new { s.Id, SyncId = s.OfflineSyncId!.Value })
            .ToDictionaryAsync(x => x.SyncId, x => x.Id, ct);

        var existingSet = existing.Keys.ToHashSet();

        // Carrega de uma vez os produtos vendidos para dar baixa de estoque
        var productIds = salesToSync
            .Where(s => !existingSet.Contains(s.OfflineSyncId))
            .SelectMany(s => s.Items)
            .Where(i => i.ProductId.HasValue)
            .Select(i => i.ProductId!.Value)
            .Distinct()
            .ToList();

        // UMA TRANSAÇÃO POR VENDA, não uma para o lote inteiro.
        //
        // Antes o SaveChanges ficava fora do try/catch de cada venda: qualquer
        // erro de banco (FK de produto apagado, sessão de caixa inexistente,
        // CHECK novo) derrubava a requisição com 500 sem corpo, o lote inteiro
        // era desfeito e a venda ruim voltava na tentativa seguinte — travando
        // a fila da loja para sempre, sem dizer o motivo.
        //
        // Venda é evento independente: não há razão para uma arrastar as
        // outras. Agora a boa entra, a ruim é reportada com a causa.
        foreach (var dto in salesToSync)
        {
            if (existingSet.Contains(dto.OfflineSyncId))
            {
                results.Add(new SyncResult(
                    dto.OfflineSyncId, "AlreadySynced", null, existing[dto.OfflineSyncId]));
                continue;
            }

            // Recarrega por venda: depois de um rollback os produtos ficam com
            // o estoque já decrementado em memória, e reaproveitá-los
            // contaminaria a próxima venda do lote.
            var products = await _db.Products
                .Where(p => productIds.Contains(p.Id))
                .ToDictionaryAsync(p => p.Id, ct);

            await using var tx = await _db.Database.BeginTransactionAsync(ct);

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

                // Orçamento que virou venda. Marcado aqui, junto da venda, e
                // não num endpoint próprio: assim funciona igual quando o PDV
                // fechou a venda offline e só sincronizou depois.
                if (dto.QuoteId is { } quoteId)
                {
                    var quote = await _db.Quotes.FirstOrDefaultAsync(q => q.Id == quoteId, ct);
                    if (quote is not null && quote.Status != "converted")
                    {
                        quote.Status = "converted";
                        quote.ConvertedSaleId = sale.Id;
                        quote.UpdatedAt = DateTime.UtcNow;
                    }
                }

                // Baixa de estoque + movimentação (pode ficar negativo: vendas
                // offline podem ultrapassar o saldo conhecido pelo servidor)
                foreach (var item in dto.Items)
                {
                    if (item.ProductId is not { } pid || !products.TryGetValue(pid, out var product))
                        continue;

                    var before = product.StockQuantity;
                    product.StockQuantity -= item.Quantity;

                    // Saldo abaixo de zero é a marca de venda sem estoque —
                    // seja por venda offline concorrente, seja pelo caixa que
                    // vendeu com aval de gerente. Fica anotado na própria
                    // movimentação para o gerente regularizar na entrada da nota.
                    var semEstoque = product.StockQuantity < 0;
                    var nota = $"Venda sincronizada do PDV ({dto.PosTerminalId ?? "?"})";
                    if (semEstoque)
                    {
                        nota += $" — SEM ESTOQUE: saldo {before} antes, {product.StockQuantity} depois";
                        _log.LogWarning(
                            "Venda sem estoque: {Produto} ficou em {Saldo} (tenant {Tenant})",
                            product.Name, product.StockQuantity, tenantId);
                    }

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
                        Notes = nota,
                        CreatedAt = DateTime.UtcNow,
                    });
                }

                await _db.SaveChangesAsync(ct);
                await tx.CommitAsync(ct);

                results.Add(new SyncResult(dto.OfflineSyncId, "Success", null, sale.Id));
            }
            catch (Exception ex)
            {
                await tx.RollbackAsync(ct);
                // Sem isto o estado sujo desta venda vai junto no SaveChanges
                // da próxima e derruba uma venda que estava boa.
                _db.ChangeTracker.Clear();

                _log.LogError(ex, "Falha ao sincronizar a venda {OfflineSyncId} do terminal {Terminal}",
                    dto.OfflineSyncId, dto.PosTerminalId);
                results.Add(new SyncResult(dto.OfflineSyncId, "Error", Describe(ex)));
            }
        }

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
    decimal SurchargeAmount = 0,
    // Venda que nasceu de um orçamento — fecha o ciclo do papel do cliente
    Guid? QuoteId = null);

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

public record SyncResult(
    Guid OfflineSyncId,
    string Status,
    string? Message,
    /// <summary>Id da venda no servidor — o PDV usa para emitir a nota fiscal.</summary>
    Guid? SaleId = null);
