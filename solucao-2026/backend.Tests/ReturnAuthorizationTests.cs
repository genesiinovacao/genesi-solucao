using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Solucao.Backend.Controllers;
using Solucao.Backend.Models.Dtos.Returns;
using Solucao.Backend.Models.Entities;
using Solucao.Backend.Services;
using Solucao.Backend.Tests.Support;
using Xunit;

namespace Solucao.Backend.Tests;

/// <summary>
/// Devolução tira dinheiro do caixa e devolve mercadoria ao estoque — mesmo
/// risco da sangria. O operador executa, mas quem responde pela loja autoriza.
/// </summary>
public class ReturnAuthorizationTests
{
    private static readonly Guid TenantId = Guid.NewGuid();

    private static (ReturnsController controller, Data.AppDbContext db, Sale sale, SaleItem item) Setup(string role)
    {
        var db = TestDb.Create();
        var ctx = new TenantContext();
        var userId = Guid.NewGuid();
        ctx.SetContext(TenantId, userId, role);

        db.Users.Add(new User
        {
            Id = Guid.NewGuid(), TenantId = TenantId, Name = "Gerente", Email = "g@loja.com",
            PasswordHash = "x", Role = "manager", IsActive = true,
            OperatorCode = "99", PinHash = BCrypt.Net.BCrypt.HashPassword("4321"),
        });

        var product = new Product
        {
            Id = Guid.NewGuid(), TenantId = TenantId, Name = "Arroz 5kg",
            CostPrice = 18m, SalePrice = 25m, StockQuantity = 10m,
        };
        db.Products.Add(product);

        var item = new SaleItem
        {
            Id = Guid.NewGuid(), TenantId = TenantId, ProductId = product.Id,
            ProductName = product.Name, Quantity = 2m, UnitPrice = 25m, TotalPrice = 50m,
        };
        var sale = new Sale
        {
            Id = Guid.NewGuid(), TenantId = TenantId, UserId = userId,
            SaleDate = DateTime.UtcNow, Subtotal = 50m, TotalAmount = 50m,
            PaymentMethod = "cash", Status = "completed",
            Items = new List<SaleItem> { item },
        };
        db.Sales.Add(sale);
        db.SaveChanges();

        var controller = new ReturnsController(db, ctx, new OperatorAuthService(db), new FakeAudit());
        return (controller, db, sale, item);
    }

    private static CreateSaleReturnRequest Request(Guid saleItemId, string? code = null, string? pin = null) =>
        new(new List<SaleReturnLineRequest> { new(saleItemId, 1m) }, "cash", "Cliente desistiu", code, pin);

    [Fact]
    public async Task Cashier_CannotReturnWithoutSupervisor()
    {
        var (controller, db, sale, item) = Setup("cashier");

        var response = await controller.Create(sale.Id, Request(item.Id), default);

        var result = Assert.IsType<ObjectResult>(response.Result);
        Assert.Equal(403, result.StatusCode);
        Assert.Empty(db.SaleReturns);
        // Estoque intacto: nada pode ter voltado para a prateleira
        Assert.Equal(10m, (await db.Products.SingleAsync()).StockQuantity);
    }

    [Fact]
    public async Task Cashier_CannotReturnWithWrongPin()
    {
        var (controller, db, sale, item) = Setup("cashier");

        var response = await controller.Create(sale.Id, Request(item.Id, "99", "0000"), default);

        Assert.Equal(403, Assert.IsType<ObjectResult>(response.Result).StatusCode);
        Assert.Empty(db.SaleReturns);
    }

    [Fact]
    public async Task Cashier_ReturnsWithValidSupervisorPin()
    {
        var (controller, db, sale, item) = Setup("cashier");

        var response = await controller.Create(sale.Id, Request(item.Id, "99", "4321"), default);

        Assert.IsType<OkObjectResult>(response.Result);
        var saved = Assert.Single(db.SaleReturns);
        Assert.Contains("Gerente", saved.Reason);   // fica registrado quem liberou
        Assert.Equal(11m, (await db.Products.SingleAsync()).StockQuantity);
    }

    [Theory]
    [InlineData("admin")]
    [InlineData("manager")]
    public async Task SupervisorRoles_ReturnDirectly(string role)
    {
        var (controller, db, sale, item) = Setup(role);

        var response = await controller.Create(sale.Id, Request(item.Id), default);

        Assert.IsType<OkObjectResult>(response.Result);
        Assert.Single(db.SaleReturns);
    }
}
