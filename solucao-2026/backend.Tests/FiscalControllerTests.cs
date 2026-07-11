using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Solucao.Backend.Controllers;
using Solucao.Backend.Data;
using Solucao.Backend.Models.Dtos.Fiscal;
using Solucao.Backend.Models.Entities;
using Solucao.Backend.Services;
using Solucao.Backend.Services.Fiscal;
using Solucao.Backend.Tests.Support;
using Xunit;

namespace Solucao.Backend.Tests;

public class FiscalControllerTests
{
    private static IConfiguration Config() =>
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Fiscal:Series"] = "1",
            ["Fiscal:Environment"] = "homologation",
        }).Build();

    private static (FiscalController controller, AppDbContext db, Guid tenantId) Setup()
    {
        var db = TestDb.Create();
        var tenantId = Guid.NewGuid();

        db.Tenants.Add(new Tenant { Id = tenantId, Name = "Mercado Teste", Cnpj = "12345678000190" });
        db.SaveChanges();

        var tenant = new TenantContext();
        tenant.SetContext(tenantId, Guid.NewGuid(), "admin");

        var controller = new FiscalController(
            db, tenant, new SimulatedFiscalProvider(), Config(), NullLogger<FiscalController>.Instance);
        return (controller, db, tenantId);
    }

    private static Sale AddSale(AppDbContext db, Guid tenantId, string status = "completed")
    {
        var sale = new Sale
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            TotalAmount = 50m,
            Subtotal = 50m,
            Status = status,
            SaleDate = DateTime.UtcNow,
            Items = { new SaleItem { TenantId = tenantId, ProductName = "Item", Quantity = 1, UnitPrice = 50m, TotalPrice = 50m } },
        };
        db.Sales.Add(sale);
        db.SaveChanges();
        return sale;
    }

    [Fact]
    public async Task Emit_AuthorizesDocument_WithSequentialNumbering()
    {
        var (controller, db, tenantId) = Setup();
        var sale1 = AddSale(db, tenantId);
        var sale2 = AddSale(db, tenantId);

        var r1 = await controller.Emit(sale1.Id, null, default);
        var r2 = await controller.Emit(sale2.Id, null, default);

        var d1 = Assert.IsType<FiscalDocumentDto>(Assert.IsType<OkObjectResult>(r1.Result).Value);
        var d2 = Assert.IsType<FiscalDocumentDto>(Assert.IsType<OkObjectResult>(r2.Result).Value);

        Assert.Equal("authorized", d1.Status);
        Assert.Equal(1, d1.Number);
        Assert.Equal(2, d2.Number);
        Assert.Equal(44, d1.AccessKey!.Length);
        Assert.Equal("homologation", d1.Environment);
    }

    [Fact]
    public async Task Emit_Twice_ForSameSale_ReturnsConflict()
    {
        var (controller, db, tenantId) = Setup();
        var sale = AddSale(db, tenantId);

        await controller.Emit(sale.Id, null, default);
        var second = await controller.Emit(sale.Id, null, default);

        Assert.IsType<ConflictObjectResult>(second.Result);
    }

    [Fact]
    public async Task Emit_ForCancelledSale_ReturnsBadRequest()
    {
        var (controller, db, tenantId) = Setup();
        var sale = AddSale(db, tenantId, status: "cancelled");

        var response = await controller.Emit(sale.Id, null, default);

        Assert.IsType<BadRequestObjectResult>(response.Result);
    }

    [Fact]
    public async Task Cancel_RequiresJustificationOf15Chars()
    {
        var (controller, db, tenantId) = Setup();
        var sale = AddSale(db, tenantId);
        var emitted = await controller.Emit(sale.Id, null, default);
        var doc = Assert.IsType<FiscalDocumentDto>(Assert.IsType<OkObjectResult>(emitted.Result).Value);

        var tooShort = await controller.Cancel(doc.Id, new CancelFiscalRequest("curta"), default);
        Assert.IsType<BadRequestObjectResult>(tooShort.Result);

        var ok = await controller.Cancel(doc.Id, new CancelFiscalRequest("erro de operação no caixa, venda duplicada"), default);
        var cancelled = Assert.IsType<FiscalDocumentDto>(Assert.IsType<OkObjectResult>(ok.Result).Value);
        Assert.Equal("cancelled", cancelled.Status);
    }
}
