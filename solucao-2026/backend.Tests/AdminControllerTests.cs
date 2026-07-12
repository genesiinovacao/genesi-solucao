using System.IdentityModel.Tokens.Jwt;
using Microsoft.AspNetCore.Mvc;
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
        return (new AdminController(db, new JwtService(config), tenantCtx, NullLogger<AdminController>.Instance), db);
    }

    private static CreateTenantRequest ValidCreate(string cnpj = "12.345.678/0001-90", string segment = "farmacia") =>
        new("Farmácia Central", cnpj, segment, null, 2, "Ana Farm", "ana@farmacia.com", "123456");

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
            new UpdateTenantRequest("Loja X Renomeada", "loja_pecas", null, 5, false, "premium"), default);

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
