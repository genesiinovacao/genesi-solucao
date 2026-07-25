using System.IdentityModel.Tokens.Jwt;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Solucao.Backend.Controllers;
using Solucao.Backend.Models.Dtos.Admin;
using Solucao.Backend.Models.Entities;
using Solucao.Backend.Services;
using Solucao.Backend.Tests.Support;
using Xunit;

namespace Solucao.Backend.Tests;

public class AdminControllerTests
{
    private static (AdminController controller, Data.AppDbContext db) Setup()
    {
        var db = TestDb.Create();
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:Issuer"] = "solucao-backend",
            ["Jwt:Audience"] = "solucao-clients",
            ["Jwt:Key"] = "0123456789abcdef0123456789abcdef-unit-test",
        }).Build();
        var tenantCtx = new TenantContext();
        tenantCtx.SetContext(Guid.Parse("00000000-0000-0000-0000-000000000001"), Guid.NewGuid(), "superadmin");
        return (new AdminController(db, new JwtService(config), tenantCtx,
            new MemoryCache(new MemoryCacheOptions()), new FakeAudit(),
            NullLogger<AdminController>.Instance), db);
    }

    private static CreateTenantRequest ValidCreate(string cnpj = "12.345.678/0001-90", string segment = "farmacia") =>
        new("Farmácia Central", cnpj, segment, null, 2, null, false, null, "Ana Farm", "ana@farmacia.com", "123456");

    [Theory]
    [InlineData("123")]
    [InlineData("12.345.678/0001")]
    public async Task CreateTenant_RejectsInvalidCnpj(string cnpj)
    {
        var (controller, _) = Setup();
        var response = await controller.CreateTenant(ValidCreate(cnpj: cnpj), default);
        Assert.IsType<BadRequestObjectResult>(response.Result);
    }

    [Fact]
    public async Task CreateTenant_RejectsUnknownSegment()
    {
        var (controller, _) = Setup();
        var response = await controller.CreateTenant(ValidCreate(segment: "casa_de_shows"), default);
        Assert.IsType<BadRequestObjectResult>(response.Result);
    }

    [Fact]
    public async Task CreateTenant_RejectsOversizedLogo()
    {
        var (controller, _) = Setup();
        var req = ValidCreate() with { LogoBase64 = new string('A', 400_000) };
        var response = await controller.CreateTenant(req, default);
        Assert.IsType<BadRequestObjectResult>(response.Result);
    }

    [Fact]
    public async Task UpdateTenant_ChangesSegmentLimitAndActive()
    {
        var (controller, db) = Setup();
        var tenant = new Tenant { Id = Guid.NewGuid(), Name = "Loja X", Cnpj = "11222333000144" };
        db.Tenants.Add(tenant);
        db.SaveChanges();

        var response = await controller.UpdateTenant(tenant.Id,
            new UpdateTenantRequest("Loja X Renomeada", "loja_pecas", null, 5, null, false, null, false, "premium"), default);

        var dto = Assert.IsType<AdminTenantDto>(Assert.IsType<OkObjectResult>(response.Result).Value);
        Assert.Equal("Loja X Renomeada", dto.Name);
        Assert.Equal("loja_pecas", dto.Segment);
        Assert.Equal(5, dto.MaxPosTerminals);
        Assert.False(dto.IsActive);
    }

    [Fact]
    public async Task PlatformLogo_SetAndGet_RoundTrips()
    {
        var (controller, _) = Setup();

        var set = await controller.SetPlatformLogo(new PlatformLogoDto("data:image/png;base64,iVBORw0KGgo="), default);
        Assert.IsType<OkObjectResult>(set.Result);

        var get = await controller.GetPlatformLogo(default);
        var dto = Assert.IsType<PlatformLogoDto>(Assert.IsType<OkObjectResult>(get.Result).Value);
        Assert.StartsWith("data:image/png", dto.LogoBase64);
    }

    [Fact]
    public async Task RenewSubscription_UpdatesExpiryDate()
    {
        var (controller, db) = Setup();
        var tenant = new Tenant { Id = Guid.NewGuid(), Name = "Loja", Cnpj = "11222333000144" };
        db.Tenants.Add(tenant);
        db.SaveChanges();

        var newDate = DateOnly.FromDateTime(DateTime.UtcNow.AddMonths(1));
        var response = await controller.RenewSubscription(tenant.Id, new RenewSubscriptionRequest(newDate), default);

        var dto = Assert.IsType<AdminTenantDto>(Assert.IsType<OkObjectResult>(response.Result).Value);
        Assert.Equal(newDate, dto.SubscriptionExpiresAt);
    }

    [Fact]
    public async Task RenewSubscription_RejectsPastDate()
    {
        var (controller, db) = Setup();
        var tenant = new Tenant { Id = Guid.NewGuid(), Name = "Loja", Cnpj = "11222333000144" };
        db.Tenants.Add(tenant);
        db.SaveChanges();

        var response = await controller.RenewSubscription(tenant.Id,
            new RenewSubscriptionRequest(Solucao.Backend.Services.Billing.SubscriptionCycle.Today().AddDays(-1)), default);

        Assert.IsType<BadRequestObjectResult>(response.Result);
    }

    [Fact]
    public async Task RenewAsBonus_MarksTenantAndRecordsZeroValueCharge()
    {
        var (controller, db) = Setup();
        var tenant = new Tenant { Id = Guid.NewGuid(), Name = "Cortesia", Cnpj = "11222333000144" };
        db.Tenants.Add(tenant);
        db.SaveChanges();

        var until = Solucao.Backend.Services.Billing.SubscriptionCycle.Today().AddMonths(2);
        var response = await controller.RenewSubscription(tenant.Id,
            new RenewSubscriptionRequest(until, IsBonus: true, Notes: "Cliente em implantação"), default);

        var dto = Assert.IsType<AdminTenantDto>(Assert.IsType<OkObjectResult>(response.Result).Value);
        Assert.True(dto.SubscriptionIsBonus);
        Assert.Equal(until, dto.SubscriptionExpiresAt);

        var charge = Assert.Single(db.BillingCharges.Where(c => c.TenantId == tenant.Id));
        Assert.Equal("bonus", charge.ChargeType);
        Assert.Equal(0m, charge.Amount);
        Assert.Equal("paid", charge.Status);
        Assert.Equal(until, charge.AppliedNewExpiry);
        Assert.Equal("Cliente em implantação", charge.Notes);
    }

    [Fact]
    public async Task PaidRenew_DoesNotCreateBonusRecord()
    {
        var (controller, db) = Setup();
        var tenant = new Tenant { Id = Guid.NewGuid(), Name = "Pagante", Cnpj = "11222333000144" };
        db.Tenants.Add(tenant);
        db.SaveChanges();

        await controller.RenewSubscription(tenant.Id,
            new RenewSubscriptionRequest(Solucao.Backend.Services.Billing.SubscriptionCycle.Today().AddMonths(1)), default);

        Assert.Empty(db.BillingCharges.Where(c => c.TenantId == tenant.Id));
        Assert.False(db.Tenants.Find(tenant.Id)!.SubscriptionIsBonus);
    }

    [Fact]
    public async Task Impersonate_IssuesTokenScopedToTargetTenant()
    {
        var (controller, db) = Setup();
        var tenant = new Tenant { Id = Guid.NewGuid(), Name = "Cliente Alvo", Cnpj = "11222333000144" };
        db.Tenants.Add(tenant);
        db.SaveChanges();

        var response = await controller.Impersonate(tenant.Id, default);
        var dto = Assert.IsType<ImpersonationResponse>(Assert.IsType<OkObjectResult>(response.Result).Value);

        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(dto.AccessToken);
        Assert.Equal(tenant.Id.ToString(), jwt.Claims.First(c => c.Type == JwtService.TenantIdClaim).Value);
        Assert.Contains(jwt.Claims, c => c.Value == "admin");
        Assert.Equal(tenant.Id, dto.User.TenantId);
        Assert.Equal("admin", dto.User.Role);
    }

    [Fact]
    public async Task Impersonate_RejectsBlockedTenant()
    {
        var (controller, db) = Setup();
        var tenant = new Tenant { Id = Guid.NewGuid(), Name = "Bloqueado", Cnpj = "55666777000188", IsActive = false };
        db.Tenants.Add(tenant);
        db.SaveChanges();

        var response = await controller.Impersonate(tenant.Id, default);
        Assert.IsType<BadRequestObjectResult>(response.Result);
    }

    [Fact]
    public async Task DeleteTenant_RejectsPlatformTenant()
    {
        var (controller, _) = Setup();
        var response = await controller.DeleteTenant(Guid.Parse("00000000-0000-0000-0000-000000000001"), "Plataforma", default);
        Assert.IsType<BadRequestObjectResult>(response);
    }

    [Fact]
    public async Task DeleteTenant_RejectsActiveTenant()
    {
        var (controller, db) = Setup();
        var tenant = new Tenant { Id = Guid.NewGuid(), Name = "Ativo", Cnpj = "11222333000144", IsActive = true };
        db.Tenants.Add(tenant);
        db.SaveChanges();

        var response = await controller.DeleteTenant(tenant.Id, "Ativo", default);
        Assert.IsType<BadRequestObjectResult>(response);
        Assert.NotNull(db.Tenants.Find(tenant.Id));
    }

    [Fact]
    public async Task DeleteTenant_RejectsWrongConfirmName()
    {
        var (controller, db) = Setup();
        var tenant = new Tenant { Id = Guid.NewGuid(), Name = "Loja Certa", Cnpj = "11222333000144", IsActive = false };
        db.Tenants.Add(tenant);
        db.SaveChanges();

        var response = await controller.DeleteTenant(tenant.Id, "Loja Errada", default);
        Assert.IsType<BadRequestObjectResult>(response);
        Assert.NotNull(db.Tenants.Find(tenant.Id));
    }

    [Fact]
    public async Task DeleteTenant_RemovesBlockedTenantWithExactName()
    {
        var (controller, db) = Setup();
        var tenant = new Tenant { Id = Guid.NewGuid(), Name = "Para Excluir", Cnpj = "11222333000144", IsActive = false };
        db.Tenants.Add(tenant);
        db.SaveChanges();

        var response = await controller.DeleteTenant(tenant.Id, "Para Excluir", default);
        Assert.IsType<NoContentResult>(response);
        Assert.Null(db.Tenants.Find(tenant.Id));
    }

    [Fact]
    public async Task ListTenants_HidesPlatformTenant()
    {
        var (controller, db) = Setup();
        db.Tenants.Add(new Tenant { Id = Guid.Parse("00000000-0000-0000-0000-000000000001"), Name = "Plataforma", Cnpj = "00" });
        db.Tenants.Add(new Tenant { Id = Guid.NewGuid(), Name = "Cliente Real", Cnpj = "11222333000144" });
        db.SaveChanges();

        var response = await controller.ListTenants(default);
        var list = Assert.IsType<List<AdminTenantDto>>(Assert.IsType<OkObjectResult>(response.Result).Value);
        Assert.Single(list);
        Assert.Equal("Cliente Real", list[0].Name);
    }
}
