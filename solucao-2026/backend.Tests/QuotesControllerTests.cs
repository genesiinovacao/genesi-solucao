using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Solucao.Backend.Controllers;
using Solucao.Backend.Data;
using Solucao.Backend.Models.Dtos.Quotes;
using Solucao.Backend.Models.Entities;
using Solucao.Backend.Services;
using Solucao.Backend.Tests.Support;
using Xunit;

namespace Solucao.Backend.Tests;

/// <summary>
/// Orçamento do balcão: numerado por loja, não toca estoque nem caixa, e só
/// vira venda quando o cliente volta com o papel.
/// </summary>
public class QuotesControllerTests
{
    private sealed class NoStockAlerts : IStockAlertService
    {
        public Task CheckAndNotifyAsync(Guid tenantId, IReadOnlyCollection<Guid> productIds, CancellationToken ct)
            => Task.CompletedTask;
    }

    private static readonly Guid TenantId = Guid.NewGuid();

    private static (QuotesController controller, AppDbContext db, TenantContext ctx, Product product) Setup()
    {
        var db = TestDb.Create();
        var ctx = new TenantContext();
        var userId = Guid.NewGuid();
        ctx.SetContext(TenantId, userId, "cashier");

        db.Users.Add(new User
        {
            Id = userId, TenantId = TenantId, Name = "Caixa 1", Email = "c@loja.com",
            PasswordHash = "x", Role = "cashier", IsActive = true,
        });

        var product = new Product
        {
            Id = Guid.NewGuid(), TenantId = TenantId, Name = "Pastilha de freio",
            CostPrice = 60m, SalePrice = 120m, StockQuantity = 5m,
        };
        db.Products.Add(product);
        db.SaveChanges();

        return (new QuotesController(db, ctx), db, ctx, product);
    }

    private static CreateQuoteRequest Request(Guid productId, decimal qty = 2m) => new(
        Items: new List<QuoteLineRequest>
        {
            new(productId, "Pastilha de freio", qty, 120m, 0m, qty * 120m),
        },
        CustomerId: null,
        CustomerName: "João da Esquina",
        CustomerPhone: "11999998888",
        Subtotal: qty * 120m,
        DiscountAmount: 0m,
        SurchargeAmount: 0m,
        TotalAmount: qty * 120m,
        Notes: null);

    [Fact]
    public async Task Create_NumbersSequentially_PerTenant()
    {
        var (controller, _, _, product) = Setup();

        var first = Assert.IsType<OkObjectResult>((await controller.Create(Request(product.Id), default)).Result);
        var second = Assert.IsType<OkObjectResult>((await controller.Create(Request(product.Id), default)).Result);

        Assert.Equal(1, ((QuoteDto)first.Value!).Number);
        Assert.Equal(2, ((QuoteDto)second.Value!).Number);
    }

    [Fact]
    public async Task Create_DoesNotTouchStock()
    {
        var (controller, db, _, product) = Setup();

        await controller.Create(Request(product.Id), default);

        // Orçamento não reserva peça: o estoque continua disponível para venda
        Assert.Equal(5m, (await db.Products.SingleAsync()).StockQuantity);
        Assert.Empty(db.StockMovements);
        Assert.Empty(db.Sales);
    }

    [Fact]
    public async Task Create_SetsValidityFromRequestedDays()
    {
        var (controller, _, _, product) = Setup();

        var ok = Assert.IsType<OkObjectResult>(
            (await controller.Create(Request(product.Id) with { ValidDays = 30 }, default)).Result);

        var dto = (QuoteDto)ok.Value!;
        var expected = Services.Billing.SubscriptionCycle.Today().AddDays(30);
        Assert.Equal(expected, dto.ValidUntil);
        Assert.False(dto.IsExpired);
    }

    /// <summary>
    /// Contrato ou tabela combinada com oficina vale até a loja avisar: sem
    /// prazo é NULL, não uma data futura inventada que mentiria no papel.
    /// </summary>
    [Fact]
    public async Task Create_NoExpiry_LeavesValidityNull()
    {
        var (controller, db, _, product) = Setup();

        var ok = Assert.IsType<OkObjectResult>(
            (await controller.Create(Request(product.Id) with { NoExpiry = true }, default)).Result);

        var dto = (QuoteDto)ok.Value!;
        Assert.Null(dto.ValidUntil);
        Assert.False(dto.IsExpired);
        Assert.Null((await db.Quotes.SingleAsync()).ValidUntil);
    }

    /// <summary>Sem prazo nunca vence, nem consultado meses depois.</summary>
    [Fact]
    public async Task List_NoExpiryQuote_IsNeverExpired()
    {
        var (controller, _, _, product) = Setup();
        await controller.Create(Request(product.Id) with { NoExpiry = true }, default);

        var ok = Assert.IsType<OkObjectResult>((await controller.List(ct: default)).Result);
        var row = Assert.Single(((QuoteListResponse)ok.Value!).Items);
        Assert.Null(row.ValidUntil);
        Assert.False(row.IsExpired);
    }

    [Fact]
    public async Task Create_RecordsSeller()
    {
        var (controller, _, _, product) = Setup();

        var ok = Assert.IsType<OkObjectResult>(
            (await controller.Create(Request(product.Id), default)).Result);

        // O papel entregue ao cliente precisa dizer quem atendeu
        Assert.Equal("Caixa 1", ((QuoteDto)ok.Value!).SellerName);
    }

    [Fact]
    public async Task Create_WithoutItems_IsRejected()
    {
        var (controller, db, _, _) = Setup();

        var response = await controller.Create(
            Request(Guid.NewGuid()) with { Items = new List<QuoteLineRequest>() }, default);

        Assert.IsType<BadRequestObjectResult>(response.Result);
        Assert.Empty(db.Quotes);
    }

    [Fact]
    public async Task Cancel_KeepsHistory()
    {
        var (controller, db, _, product) = Setup();
        var created = (QuoteDto)Assert.IsType<OkObjectResult>(
            (await controller.Create(Request(product.Id), default)).Result).Value!;

        await controller.Cancel(created.Id, default);

        // Cancelado, não apagado: o que foi orçado e não fechou é informação
        var saved = await db.Quotes.SingleAsync();
        Assert.Equal("cancelled", saved.Status);
    }

    /// <summary>
    /// O ciclo que importa: cliente volta, a venda é sincronizada com o
    /// quoteId e o orçamento fecha apontando para a venda.
    ///
    /// ⚠️ Este teste passou verde enquanto a conversão estava quebrada em
    /// produção. O provider InMemory NÃO aplica chave estrangeira, então ele
    /// não viu que o UPDATE do orçamento saía antes do INSERT da venda — o
    /// PostgreSQL viu, e derrubou toda sincronização de venda vinda de
    /// orçamento com quotes_converted_sale_id_fkey.
    ///
    /// Vale para qualquer teste daqui: ordem de comandos e integridade
    /// referencial não são cobertas por esta suíte. Mexeu em relacionamento
    /// entre tabelas, teste contra Postgres de verdade antes de publicar.
    /// </summary>
    [Fact]
    public async Task SyncingSaleWithQuoteId_MarksQuoteConverted()
    {
        var (controller, db, ctx, product) = Setup();
        var created = (QuoteDto)Assert.IsType<OkObjectResult>(
            (await controller.Create(Request(product.Id), default)).Result).Value!;

        var sync = new SyncController(db, ctx, new NoStockAlerts(), NullLogger<SyncController>.Instance);
        var sale = new SaleSyncDto(
            OfflineSyncId: Guid.NewGuid(),
            CustomerId: null,
            SaleDate: DateTime.UtcNow,
            Subtotal: 240m,
            DiscountAmount: 0m,
            TotalAmount: 240m,
            PaymentMethod: "cash",
            AmountReceived: 240m,
            ChangeAmount: 0m,
            PosTerminalId: "pdv-teste",
            CashSessionId: null,
            Items: new List<SaleItemSyncDto> { new(product.Id, "Pastilha de freio", 2m, 120m, 0m, 240m) },
            Payments: null,
            QuoteId: created.Id);

        await sync.SyncSales(new List<SaleSyncDto> { sale }, default);

        var saved = await db.Quotes.SingleAsync();
        var savedSale = await db.Sales.SingleAsync();
        Assert.Equal("converted", saved.Status);
        Assert.Equal(savedSale.Id, saved.ConvertedSaleId);
        // Agora sim o estoque baixa — na venda, não no orçamento
        Assert.Equal(3m, (await db.Products.SingleAsync()).StockQuantity);
    }
}
