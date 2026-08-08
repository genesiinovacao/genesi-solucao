using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Solucao.Backend.Controllers;
using Solucao.Backend.Data;
using Solucao.Backend.Models.Entities;
using Solucao.Backend.Services;
using Solucao.Backend.Tests.Support;
using Xunit;

namespace Solucao.Backend.Tests;

public class SyncControllerTests
{
    private sealed class FakeStockAlerts : IStockAlertService
    {
        public List<IReadOnlyCollection<Guid>> Calls { get; } = new();
        public Task CheckAndNotifyAsync(Guid tenantId, IReadOnlyCollection<Guid> productIds, CancellationToken ct)
        {
            Calls.Add(productIds);
            return Task.CompletedTask;
        }
    }

    private static (SyncController controller, AppDbContext db, FakeStockAlerts alerts, Guid tenantId, Product product) Setup()
    {
        var db = TestDb.Create();
        var tenantId = Guid.NewGuid();
        var userId = Guid.NewGuid();

        var product = new Product
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Name = "Arroz 5kg",
            CostPrice = 18m,
            SalePrice = 25m,
            StockQuantity = 10m,
            MinStock = 2m,
        };
        db.Products.Add(product);
        db.SaveChanges();

        var tenant = new TenantContext();
        tenant.SetContext(tenantId, userId, "cashier");

        var alerts = new FakeStockAlerts();
        var controller = new SyncController(db, tenant, alerts, NullLogger<SyncController>.Instance);
        return (controller, db, alerts, tenantId, product);
    }

    private static SaleSyncDto DemoSale(Guid offlineSyncId, Guid productId, decimal qty = 3m) => new(
        OfflineSyncId: offlineSyncId,
        CustomerId: null,
        SaleDate: DateTime.UtcNow,
        Subtotal: qty * 25m,
        DiscountAmount: 0m,
        TotalAmount: qty * 25m,
        PaymentMethod: "cash",
        AmountReceived: 100m,
        ChangeAmount: 100m - qty * 25m,
        PosTerminalId: "pdv-teste",
        CashSessionId: null,
        Items: new List<SaleItemSyncDto>
        {
            new(productId, "Arroz 5kg", qty, 25m, 0m, qty * 25m),
        },
        Payments: null);

    [Fact]
    public async Task SyncSales_CreatesSale_DeductsStock_AndLogsMovement()
    {
        var (controller, db, alerts, _, product) = Setup();
        var syncId = Guid.NewGuid();

        var response = await controller.SyncSales(new List<SaleSyncDto> { DemoSale(syncId, product.Id) }, default);

        var ok = Assert.IsType<OkObjectResult>(response.Result);
        var results = Assert.IsAssignableFrom<IReadOnlyList<SyncResult>>(ok.Value);
        Assert.Equal("Success", results.Single().Status);

        var sale = await db.Sales.Include(s => s.Items).SingleAsync();
        Assert.Equal(syncId, sale.OfflineSyncId);
        Assert.Equal(75m, sale.TotalAmount);

        var updated = await db.Products.SingleAsync();
        Assert.Equal(7m, updated.StockQuantity);

        var movement = await db.StockMovements.SingleAsync();
        Assert.Equal("sale", movement.MovementType);
        Assert.Equal(-3m, movement.Quantity);
        Assert.Equal(7m, movement.BalanceAfter);
        Assert.Equal(sale.Id, movement.ReferenceId);
        Assert.NotEqual(Guid.Empty, movement.ReferenceId!.Value);

        Assert.Single(alerts.Calls);
        Assert.Contains(product.Id, alerts.Calls[0]);
    }

    [Fact]
    public async Task SyncSales_IsIdempotent_ByOfflineSyncId()
    {
        var (controller, db, _, _, product) = Setup();
        var syncId = Guid.NewGuid();
        var batch = new List<SaleSyncDto> { DemoSale(syncId, product.Id) };

        await controller.SyncSales(batch, default);
        var response = await controller.SyncSales(batch, default);

        var ok = Assert.IsType<OkObjectResult>(response.Result);
        var results = Assert.IsAssignableFrom<IReadOnlyList<SyncResult>>(ok.Value);
        Assert.Equal("AlreadySynced", results.Single().Status);

        // Nenhuma duplicação: uma venda, um movimento, estoque baixado uma vez
        Assert.Equal(1, await db.Sales.CountAsync());
        Assert.Equal(1, await db.StockMovements.CountAsync());
        Assert.Equal(7m, (await db.Products.SingleAsync()).StockQuantity);
    }

    [Fact]
    public async Task SyncSales_AllowsNegativeStock_ForOfflineOversell()
    {
        var (controller, db, _, _, product) = Setup();

        await controller.SyncSales(new List<SaleSyncDto> { DemoSale(Guid.NewGuid(), product.Id, qty: 15m) }, default);

        Assert.Equal(-5m, (await db.Products.SingleAsync()).StockQuantity);
    }

    [Fact]
    public async Task SyncSales_EmptyBatch_ReturnsBadRequest()
    {
        var (controller, _, _, _, _) = Setup();
        var response = await controller.SyncSales(new List<SaleSyncDto>(), default);
        Assert.IsType<BadRequestObjectResult>(response.Result);
    }

    /// <summary>
    /// Vale crédito precisa sair do saldo do cliente, senão a devolução gera
    /// crédito infinito — o mesmo saldo seria gasto em toda venda.
    /// </summary>
    [Fact]
    public async Task SyncSales_StoreCredit_DebitsCustomerBalance()
    {
        var (controller, db, _, tenantId, product) = Setup();
        var customer = new Customer
        {
            Id = Guid.NewGuid(), TenantId = tenantId, Name = "Ana", CreditBalance = 50m,
        };
        db.Customers.Add(customer);
        await db.SaveChangesAsync();

        var dto = DemoSale(Guid.NewGuid(), product.Id) with
        {
            CustomerId = customer.Id,
            PaymentMethod = "mixed",
            Payments = new List<SalePaymentSyncDto>
            {
                new("store_credit", 30m, null),
                new("cash", 45m, null),
            },
        };

        await controller.SyncSales(new List<SaleSyncDto> { dto }, default);

        Assert.Equal(20m, (await db.Customers.SingleAsync()).CreditBalance);
    }

    /// <summary>
    /// Saldo gasto noutro caixa enquanto o PDV estava offline: consome o que
    /// existe em vez de deixar o cliente com crédito negativo.
    /// </summary>
    [Fact]
    public async Task SyncSales_StoreCredit_NeverGoesNegative()
    {
        var (controller, db, _, tenantId, product) = Setup();
        var customer = new Customer
        {
            Id = Guid.NewGuid(), TenantId = tenantId, Name = "Bruno", CreditBalance = 10m,
        };
        db.Customers.Add(customer);
        await db.SaveChangesAsync();

        var dto = DemoSale(Guid.NewGuid(), product.Id) with
        {
            CustomerId = customer.Id,
            PaymentMethod = "store_credit",
            Payments = new List<SalePaymentSyncDto> { new("store_credit", 75m, null) },
        };

        await controller.SyncSales(new List<SaleSyncDto> { dto }, default);

        Assert.Equal(0m, (await db.Customers.SingleAsync()).CreditBalance);
    }

    /// <summary>Acréscimo (entrega/taxa) precisa chegar gravado na venda.</summary>
    [Fact]
    public async Task SyncSales_PersistsSurchargeAmount()
    {
        var (controller, db, _, _, product) = Setup();

        var dto = DemoSale(Guid.NewGuid(), product.Id) with
        {
            SurchargeAmount = 8m,
            TotalAmount = 83m,
        };

        await controller.SyncSales(new List<SaleSyncDto> { dto }, default);

        var sale = await db.Sales.SingleAsync();
        Assert.Equal(8m, sale.SurchargeAmount);
        Assert.Equal(83m, sale.TotalAmount);
    }
}
