using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Solucao.Backend.Controllers;
using Solucao.Backend.Models.Entities;
using Solucao.Backend.Services;
using Solucao.Backend.Services.Billing;
using Solucao.Backend.Tests.Support;
using Xunit;

namespace Solucao.Backend.Tests;

public class BillingControllerTests
{
    private static readonly Guid TenantId = Guid.NewGuid();

    private static (BillingController controller, Data.AppDbContext db) Setup(
        string role = "admin", TimeSpan? settleAfter = null, DateOnly? currentExpiry = null)
    {
        var db = TestDb.Create();
        var tenantCtx = new TenantContext();
        tenantCtx.SetContext(TenantId, Guid.NewGuid(), role);

        db.Tenants.Add(new Tenant
        {
            Id = TenantId, Name = "Loja Billing", Cnpj = "11222333000144",
            PlanType = "basic", SubscriptionExpiresAt = currentExpiry,
        });
        db.SaveChanges();

        var controller = new BillingController(
            db, tenantCtx,
            new SimulatedPixProvider(settleAfter ?? TimeSpan.Zero), // Zero = pago na hora
            new ConfigurationBuilder().Build(),
            new MemoryCache(new MemoryCacheOptions()),
            NullLogger<BillingController>.Instance);
        return (controller, db);
    }

    [Fact]
    public void GetPlans_ReturnsAllPlansWithPrices()
    {
        var (controller, _) = Setup();
        var plans = Assert.IsType<List<BillingController.PlanDto>>(
            Assert.IsType<OkObjectResult>(controller.GetPlans().Result).Value);
        Assert.Equal(4, plans.Count);
        Assert.All(plans, p => Assert.True(p.MonthlyPrice > 0));
    }

    [Theory]
    [InlineData("plano_vip", 1)]
    [InlineData("standard", 0)]
    [InlineData("standard", 13)]
    public async Task CreateCharge_RejectsInvalidInput(string plan, int months)
    {
        var (controller, _) = Setup();
        var response = await controller.CreateCharge(
            new BillingController.CreateChargeRequest(plan, months), default);
        Assert.IsType<BadRequestObjectResult>(response.Result);
    }

    [Fact]
    public async Task CreateCharge_ForbidsNonAdmin()
    {
        var (controller, _) = Setup(role: "cashier");
        var response = await controller.CreateCharge(
            new BillingController.CreateChargeRequest("standard", 1), default);
        Assert.IsType<ForbidResult>(response.Result);
    }

    [Fact]
    public async Task PaidCharge_AlwaysLandsOnBillingDay_AndChangesPlan()
    {
        var future = SubscriptionCycle.Today().AddDays(10);
        var (controller, db) = Setup(currentExpiry: future);

        var created = Assert.IsType<BillingController.ChargeDto>(
            Assert.IsType<OkObjectResult>((await controller.CreateCharge(
                new BillingController.CreateChargeRequest("premium", 3), default)).Result).Value);

        var polled = Assert.IsType<BillingController.ChargeDto>(
            Assert.IsType<OkObjectResult>((await controller.GetCharge(created.Id, default)).Result).Value);

        Assert.Equal("paid", polled.Status);
        var expected = SubscriptionCycle.BuildQuote(SubscriptionCycle.Today(), future, 249.90m, 3, 25);
        Assert.Equal(expected.NewExpiresAt, polled.NewExpiresAt);
        Assert.Equal(25, polled.NewExpiresAt!.Value.Day);   // vencimento no dia fixo

        var tenant = db.Tenants.Find(TenantId)!;
        Assert.Equal(expected.NewExpiresAt, tenant.SubscriptionExpiresAt);
        Assert.Equal("premium", tenant.PlanType);
    }

    [Fact]
    public async Task PaidCharge_ExpiredTenant_ExtendsFromToday()
    {
        var past = SubscriptionCycle.Today().AddDays(-30);
        var (controller, db) = Setup(currentExpiry: past);

        var created = Assert.IsType<BillingController.ChargeDto>(
            Assert.IsType<OkObjectResult>((await controller.CreateCharge(
                new BillingController.CreateChargeRequest("standard", 1), default)).Result).Value);
        await controller.GetCharge(created.Id, default);

        var expected = SubscriptionCycle.BuildQuote(SubscriptionCycle.Today(), past, 149.90m, 1, 25);
        Assert.Equal(expected.NewExpiresAt, db.Tenants.Find(TenantId)!.SubscriptionExpiresAt);
        Assert.Equal(25, expected.NewExpiresAt.Day);
    }

    [Fact]
    public async Task PaidCharge_ClearsBonusFlag()
    {
        var (controller, db) = Setup();
        db.Tenants.Find(TenantId)!.SubscriptionIsBonus = true;
        db.SaveChanges();

        var created = Assert.IsType<BillingController.ChargeDto>(
            Assert.IsType<OkObjectResult>((await controller.CreateCharge(
                new BillingController.CreateChargeRequest("standard", 1), default)).Result).Value);
        await controller.GetCharge(created.Id, default);

        Assert.False(db.Tenants.Find(TenantId)!.SubscriptionIsBonus);
    }

    [Fact]
    public async Task Quote_ShowsProRataBreakdownWithoutCreatingCharge()
    {
        var (controller, db) = Setup();

        var response = await controller.GetQuote("standard", 1, default);
        var quote = Assert.IsType<BillingController.QuoteDto>(
            Assert.IsType<OkObjectResult>(response.Result).Value);

        Assert.Equal(25, quote.BillingDay);
        Assert.Equal(25, quote.NewExpiresAt.Day);
        Assert.Equal(quote.ProRataAmount + quote.FullAmount, quote.Total);
        Assert.Empty(db.BillingCharges);   // consulta não grava nada
    }

    [Fact]
    public async Task PaidCharge_IsAppliedOnlyOnce()
    {
        var (controller, db) = Setup();

        var created = Assert.IsType<BillingController.ChargeDto>(
            Assert.IsType<OkObjectResult>((await controller.CreateCharge(
                new BillingController.CreateChargeRequest("standard", 1), default)).Result).Value);

        await controller.GetCharge(created.Id, default);
        var afterFirst = db.Tenants.Find(TenantId)!.SubscriptionExpiresAt;

        await controller.GetCharge(created.Id, default); // segunda consulta não reaplica
        Assert.Equal(afterFirst, db.Tenants.Find(TenantId)!.SubscriptionExpiresAt);
    }

    [Fact]
    public async Task PendingCharge_StaysPendingUntilProviderConfirms()
    {
        var (controller, _) = Setup(settleAfter: TimeSpan.FromHours(1)); // nunca paga no teste

        var created = Assert.IsType<BillingController.ChargeDto>(
            Assert.IsType<OkObjectResult>((await controller.CreateCharge(
                new BillingController.CreateChargeRequest("basic", 1), default)).Result).Value);

        var polled = Assert.IsType<BillingController.ChargeDto>(
            Assert.IsType<OkObjectResult>((await controller.GetCharge(created.Id, default)).Result).Value);
        Assert.Equal("pending", polled.Status);
        Assert.Null(polled.NewExpiresAt);
    }
}
