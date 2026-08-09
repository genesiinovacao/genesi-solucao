using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Solucao.Backend.Controllers;
using Solucao.Backend.Models.Entities;
using Solucao.Backend.Services;
using Solucao.Backend.Tests.Support;
using Xunit;

namespace Solucao.Backend.Tests;

/// <summary>
/// Uma venda ruim não pode travar a fila da loja.
///
/// Era o que acontecia: o SaveChanges ficava fora do try/catch de cada venda,
/// então um erro de banco derrubava a requisição inteira com 500 sem corpo. O
/// PDV mostrava "HTTP 500: Null", desfazia o lote todo e reenviava a mesma
/// venda ruim para sempre — com as boas presas junto.
/// </summary>
public class SyncErrorReportingTests
{
    private sealed class NoStockAlerts : IStockAlertService
    {
        public Task CheckAndNotifyAsync(Guid tenantId, IReadOnlyCollection<Guid> productIds, CancellationToken ct)
            => Task.CompletedTask;
    }

    private static (SyncController controller, Data.AppDbContext db, Guid tenantId, Product product) Setup()
    {
        var db = TestDb.Create();
        var tenantId = Guid.NewGuid();
        var ctx = new TenantContext();
        ctx.SetContext(tenantId, Guid.NewGuid(), "cashier");

        var product = new Product
        {
            Id = Guid.NewGuid(), TenantId = tenantId, Name = "Arroz 5kg",
            CostPrice = 18m, SalePrice = 25m, StockQuantity = 10m,
        };
        db.Products.Add(product);
        db.SaveChanges();

        return (new SyncController(db, ctx, new NoStockAlerts(), NullLogger<SyncController>.Instance),
                db, tenantId, product);
    }

    private static SaleSyncDto Sale(Guid productId, decimal qty = 1m) => new(
        OfflineSyncId: Guid.NewGuid(),
        CustomerId: null,
        SaleDate: DateTime.UtcNow,
        Subtotal: qty * 25m,
        DiscountAmount: 0m,
        TotalAmount: qty * 25m,
        PaymentMethod: "cash",
        AmountReceived: qty * 25m,
        ChangeAmount: 0m,
        PosTerminalId: "pdv-teste",
        CashSessionId: null,
        Items: new List<SaleItemSyncDto> { new(productId, "Arroz 5kg", qty, 25m, 0m, qty * 25m) },
        Payments: null);

    /// <summary>
    /// Cada venda tem a sua transação: o lote não é mais tudo-ou-nada.
    /// </summary>
    [Fact]
    public async Task EachSaleIsCommittedOnItsOwn()
    {
        var (controller, db, _, product) = Setup();
        var lote = new List<SaleSyncDto> { Sale(product.Id), Sale(product.Id), Sale(product.Id) };

        var response = await controller.SyncSales(lote, default);

        var ok = Assert.IsType<Microsoft.AspNetCore.Mvc.OkObjectResult>(response.Result);
        var results = Assert.IsAssignableFrom<IReadOnlyList<SyncResult>>(ok.Value);
        Assert.All(results, r => Assert.Equal("Success", r.Status));
        Assert.Equal(3, await db.Sales.CountAsync());
        Assert.Equal(7m, (await db.Products.SingleAsync()).StockQuantity);
        // Toda venda volta com o id do servidor, que o PDV usa para a nota
        Assert.All(results, r => Assert.NotNull(r.SaleId));
    }

    /// <summary>
    /// Reenvio do lote é seguro e continua devolvendo o id — o PDV precisa
    /// dele mesmo quando a venda já tinha subido.
    /// </summary>
    [Fact]
    public async Task ResendingReturnsSameSaleId()
    {
        var (controller, _, _, product) = Setup();
        var lote = new List<SaleSyncDto> { Sale(product.Id) };

        var primeira = await controller.SyncSales(lote, default);
        var segunda = await controller.SyncSales(lote, default);

        var idPrimeira = ((IReadOnlyList<SyncResult>)
            ((Microsoft.AspNetCore.Mvc.OkObjectResult)primeira.Result!).Value!).Single();
        var idSegunda = ((IReadOnlyList<SyncResult>)
            ((Microsoft.AspNetCore.Mvc.OkObjectResult)segunda.Result!).Value!).Single();

        Assert.Equal("Success", idPrimeira.Status);
        Assert.Equal("AlreadySynced", idSegunda.Status);
        Assert.Equal(idPrimeira.SaleId, idSegunda.SaleId);
    }

    /// <summary>
    /// Item apontando para produto inexistente é ignorado na baixa de estoque,
    /// não derruba a venda: o dinheiro entrou de qualquer jeito.
    /// </summary>
    [Fact]
    public async Task SaleWithUnknownProductStillSyncs()
    {
        var (controller, db, _, _) = Setup();

        var response = await controller.SyncSales(new List<SaleSyncDto> { Sale(Guid.NewGuid()) }, default);

        var ok = Assert.IsType<Microsoft.AspNetCore.Mvc.OkObjectResult>(response.Result);
        var results = Assert.IsAssignableFrom<IReadOnlyList<SyncResult>>(ok.Value);
        Assert.Equal("Success", results.Single().Status);
        Assert.Equal(1, await db.Sales.CountAsync());
    }
}
