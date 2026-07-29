using Microsoft.AspNetCore.Mvc;
using Solucao.Backend.Controllers;
using Solucao.Backend.Models.Dtos.Promotions;
using Solucao.Backend.Models.Entities;
using Solucao.Backend.Services;
using Solucao.Backend.Tests.Support;
using Xunit;

namespace Solucao.Backend.Tests;

/// <summary>
/// Promoção com alvo errado é pior que promoção nenhuma: fica cadastrada,
/// o lojista acha que está valendo e nunca desconta nada.
/// </summary>
public class PromotionTargetTests
{
    private static readonly Guid TenantId = Guid.NewGuid();

    private static (PromotionsController controller, Data.AppDbContext db, Product product) Setup()
    {
        var db = TestDb.Create();
        var ctx = new TenantContext();
        ctx.SetContext(TenantId, Guid.NewGuid(), "admin");

        var product = new Product
        {
            Id = Guid.NewGuid(), TenantId = TenantId, Name = "Refrigerante 2L",
            Category = "Bebidas", SalePrice = 8m, IsActive = true,
        };
        db.Products.Add(product);
        db.SaveChanges();

        return (new PromotionsController(db, ctx), db, product);
    }

    private static CreatePromotionRequest Promo(string targetType, string? targetValue) =>
        new("Promo Teste", 10m, targetType, targetValue,
            DateOnly.FromDateTime(DateTime.Today), DateOnly.FromDateTime(DateTime.Today.AddDays(7)));

    [Fact]
    public async Task Category_AcceptsCategoryInUse()
    {
        var (controller, _, _) = Setup();
        var response = await controller.Create(Promo("category", "Bebidas"), default);
        Assert.IsType<OkObjectResult>(response.Result);
    }

    [Fact]
    public async Task Category_IsCaseInsensitive()
    {
        var (controller, _, _) = Setup();
        var response = await controller.Create(Promo("category", "bebidas"), default);
        Assert.IsType<OkObjectResult>(response.Result);
    }

    [Fact]
    public async Task Category_RejectsTypoThatWouldNeverMatch()
    {
        var (controller, db, _) = Setup();
        // "Bebida" no singular: era o erro silencioso que passava antes
        var response = await controller.Create(Promo("category", "Bebida"), default);

        Assert.IsType<BadRequestObjectResult>(response.Result);
        Assert.Empty(db.Promotions);
    }

    [Fact]
    public async Task Product_AcceptsExistingId()
    {
        var (controller, _, product) = Setup();
        var response = await controller.Create(Promo("product", product.Id.ToString()), default);
        Assert.IsType<OkObjectResult>(response.Result);
    }

    [Theory]
    [InlineData("nome do produto")]                              // texto livre
    [InlineData("11111111-1111-1111-1111-111111111111")]         // id inexistente
    public async Task Product_RejectsInvalidTarget(string target)
    {
        var (controller, db, _) = Setup();
        var response = await controller.Create(Promo("product", target), default);

        Assert.IsType<BadRequestObjectResult>(response.Result);
        Assert.Empty(db.Promotions);
    }

    [Theory]
    [InlineData("gold")]
    [InlineData("silver")]
    [InlineData("bronze")]
    public async Task Loyalty_AcceptsKnownTiers(string tier)
    {
        var (controller, _, _) = Setup();
        var response = await controller.Create(Promo("loyalty", tier), default);
        Assert.IsType<OkObjectResult>(response.Result);
    }

    [Fact]
    public async Task Loyalty_RejectsUnknownTier()
    {
        var (controller, _, _) = Setup();
        var response = await controller.Create(Promo("loyalty", "ouro"), default);
        Assert.IsType<BadRequestObjectResult>(response.Result);
    }

    [Fact]
    public async Task Total_NeedsNoTarget()
    {
        var (controller, _, _) = Setup();
        var response = await controller.Create(Promo("total", null), default);
        Assert.IsType<OkObjectResult>(response.Result);
    }

    [Fact]
    public async Task Categories_ListsOnlyCategoriesInUse()
    {
        var db = TestDb.Create();
        var ctx = new TenantContext();
        ctx.SetContext(TenantId, Guid.NewGuid(), "admin");
        db.Products.AddRange(
            new Product { Id = Guid.NewGuid(), TenantId = TenantId, Name = "A", Category = "Bebidas", IsActive = true },
            new Product { Id = Guid.NewGuid(), TenantId = TenantId, Name = "B", Category = "Bebidas", IsActive = true },
            new Product { Id = Guid.NewGuid(), TenantId = TenantId, Name = "C", Category = "Limpeza", IsActive = true },
            new Product { Id = Guid.NewGuid(), TenantId = TenantId, Name = "D", Category = null, IsActive = true });
        db.SaveChanges();

        var products = new ProductsController(db, ctx);
        var response = await products.Categories(default);
        var list = Assert.IsType<List<string>>(Assert.IsType<OkObjectResult>(response.Result).Value);

        Assert.Equal(new[] { "Bebidas", "Limpeza" }, list);
    }
}
