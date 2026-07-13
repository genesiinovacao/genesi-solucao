using Microsoft.AspNetCore.Mvc;
using Solucao.Backend.Controllers;
using Solucao.Backend.Models.Dtos.Products;
using Solucao.Backend.Models.Entities;
using Solucao.Backend.Services;
using Solucao.Backend.Tests.Support;
using Xunit;

namespace Solucao.Backend.Tests;

public class ProductsControllerTests
{
    private static readonly Guid TenantId = Guid.NewGuid();

    private static (ProductsController controller, Data.AppDbContext db) Setup()
    {
        var db = TestDb.Create();
        var tenantCtx = new TenantContext();
        tenantCtx.SetContext(TenantId, Guid.NewGuid(), "admin");
        return (new ProductsController(db, tenantCtx), db);
    }

    private static Product AddProduct(Data.AppDbContext db, decimal stock = 0)
    {
        var p = new Product { Id = Guid.NewGuid(), TenantId = TenantId, Name = "Produto Teste", StockQuantity = stock };
        db.Products.Add(p);
        db.SaveChanges();
        return p;
    }

    [Fact]
    public async Task AdjustStock_UpdatesQuantityAndRecordsMovement()
    {
        var (controller, db) = Setup();
        var product = AddProduct(db, stock: 0);

        var response = await controller.AdjustStock(product.Id,
            new ProductsController.AdjustStockRequest(50, "Correção de cadastro"), default);

        var dto = Assert.IsType<ProductDto>(Assert.IsType<OkObjectResult>(response.Result).Value);
        Assert.Equal(50, dto.StockQuantity);

        var movement = Assert.Single(db.StockMovements.Where(m => m.ProductId == product.Id));
        Assert.Equal("adjustment", movement.MovementType);
        Assert.Equal(50, movement.Quantity);
        Assert.Equal(50, movement.BalanceAfter);
        Assert.Equal("Correção de cadastro", movement.Notes);
    }

    [Fact]
    public async Task AdjustStock_RejectsNegativeQuantity()
    {
        var (controller, db) = Setup();
        var product = AddProduct(db, stock: 10);

        var response = await controller.AdjustStock(product.Id,
            new ProductsController.AdjustStockRequest(-5, null), default);

        Assert.IsType<BadRequestObjectResult>(response.Result);
        Assert.Equal(10, db.Products.Find(product.Id)!.StockQuantity);
    }

    [Fact]
    public async Task AdjustStock_SameQuantityRecordsNothing()
    {
        var (controller, db) = Setup();
        var product = AddProduct(db, stock: 10);

        var response = await controller.AdjustStock(product.Id,
            new ProductsController.AdjustStockRequest(10, null), default);

        Assert.IsType<OkObjectResult>(response.Result);
        Assert.Empty(db.StockMovements.Where(m => m.ProductId == product.Id));
    }

    [Fact]
    public async Task Delete_RemovesProductWithoutHistory()
    {
        var (controller, db) = Setup();
        var product = AddProduct(db);

        var response = await controller.Delete(product.Id, default);

        Assert.IsType<OkObjectResult>(response);
        Assert.Null(db.Products.Find(product.Id));
    }

    [Fact]
    public async Task Delete_OnlyDeactivatesProductWithHistory()
    {
        var (controller, db) = Setup();
        var product = AddProduct(db, stock: 5);
        db.StockMovements.Add(new StockMovement
        {
            Id = Guid.NewGuid(), TenantId = TenantId, ProductId = product.Id,
            MovementType = "adjustment", Quantity = 5, BalanceAfter = 5, CreatedAt = DateTime.UtcNow,
        });
        db.SaveChanges();

        var response = await controller.Delete(product.Id, default);

        Assert.IsType<OkObjectResult>(response);
        var kept = db.Products.Find(product.Id);
        Assert.NotNull(kept);
        Assert.False(kept!.IsActive);
    }
}
