using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Solucao.Backend.Controllers;
using Solucao.Backend.Models.Dtos.Auth;
using Solucao.Backend.Models.Entities;
using Solucao.Backend.Services;
using Solucao.Backend.Tests.Support;
using Xunit;

namespace Solucao.Backend.Tests;

/// <summary>
/// Rede de lojas: o funcionário alterna entre filiais do mesmo grupo — e
/// nunca para uma loja de outro dono.
/// </summary>
public class StoreSwitchTests
{
    private static readonly Guid GroupA = Guid.NewGuid();
    private static readonly Guid GroupB = Guid.NewGuid();

    private static IConfiguration Config() => new ConfigurationBuilder()
        .AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:Issuer"] = "solucao-backend",
            ["Jwt:Audience"] = "solucao-clients",
            ["Jwt:Key"] = "0123456789abcdef0123456789abcdef-unit-test",
        }).Build();

    private static Tenant Store(string name, Guid? groupId, bool active = true) => new()
    {
        Id = Guid.NewGuid(), Name = name, Cnpj = Guid.NewGuid().ToString("N")[..14],
        GroupId = groupId, IsActive = active,
    };

    private static (AuthController controller, Data.AppDbContext db) Setup(Tenant currentStore, User user)
    {
        var db = TestDb.Create();
        var config = Config();
        var controller = new AuthController(
            db, new JwtService(config), config, new FakeAudit(),
            new OperatorAuthService(db), NullLogger<AuthController>.Instance);

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(JwtService.TenantIdClaim, currentStore.Id.ToString()),
            new(ClaimTypes.Role, user.Role),
        };
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(claims, "test")) },
        };
        return (controller, db);
    }

    private static User UserIn(Tenant t) => new()
    {
        Id = Guid.NewGuid(), TenantId = t.Id, Name = "João Caixa",
        Email = $"{Guid.NewGuid():N}@loja.com", PasswordHash = "x", Role = "manager", IsActive = true,
    };

    [Fact]
    public async Task Stores_ListsAllSiblingsOfTheGroup()
    {
        var matriz = Store("Matriz", GroupA);
        var filial = Store("Filial Centro", GroupA);
        var alheia = Store("Loja de Outro Dono", GroupB);
        var user = UserIn(matriz);

        var (controller, db) = Setup(matriz, user);
        db.Tenants.AddRange(matriz, filial, alheia);
        db.Users.Add(user);
        db.SaveChanges();

        var response = await controller.Stores(default);
        var stores = Assert.IsType<List<AuthController.StoreDto>>(
            Assert.IsType<OkObjectResult>(response.Result).Value);

        Assert.Equal(2, stores.Count);
        Assert.DoesNotContain(stores, s => s.Name == "Loja de Outro Dono");
        Assert.True(stores.Single(s => s.Id == matriz.Id).IsCurrent);
    }

    [Fact]
    public async Task Stores_LoneStoreReturnsOnlyItself()
    {
        var loja = Store("Loja Única", groupId: null);
        var user = UserIn(loja);

        var (controller, db) = Setup(loja, user);
        db.Tenants.Add(loja);
        db.Users.Add(user);
        db.SaveChanges();

        var response = await controller.Stores(default);
        var stores = Assert.IsType<List<AuthController.StoreDto>>(
            Assert.IsType<OkObjectResult>(response.Result).Value);

        Assert.Single(stores);
    }

    [Fact]
    public async Task SwitchStore_IssuesTokenForTheSiblingStore()
    {
        var matriz = Store("Matriz", GroupA);
        var filial = Store("Filial Centro", GroupA);
        var user = UserIn(matriz);

        var (controller, db) = Setup(matriz, user);
        db.Tenants.AddRange(matriz, filial);
        db.Users.Add(user);
        db.SaveChanges();

        var response = await controller.SwitchStore(new AuthController.SwitchStoreRequest(filial.Id), default);
        var login = Assert.IsType<LoginResponse>(Assert.IsType<OkObjectResult>(response.Result).Value);

        Assert.Equal(filial.Id, login.User.TenantId);
        Assert.Equal("Filial Centro", login.User.TenantName);
        Assert.Equal(user.Id, login.User.Id);          // continua o mesmo funcionário
        Assert.Equal("", login.RefreshToken);          // sessão da filial não renova
    }

    [Fact]
    public async Task SwitchStore_RefusesStoreFromAnotherGroup()
    {
        var matriz = Store("Matriz", GroupA);
        var alheia = Store("Loja de Outro Dono", GroupB);
        var user = UserIn(matriz);

        var (controller, db) = Setup(matriz, user);
        db.Tenants.AddRange(matriz, alheia);
        db.Users.Add(user);
        db.SaveChanges();

        var response = await controller.SwitchStore(new AuthController.SwitchStoreRequest(alheia.Id), default);
        Assert.IsType<ForbidResult>(response.Result);
    }

    [Fact]
    public async Task SwitchStore_RefusesWhenCurrentStoreHasNoGroup()
    {
        var loja = Store("Loja Única", groupId: null);
        var outra = Store("Outra Qualquer", GroupA);
        var user = UserIn(loja);

        var (controller, db) = Setup(loja, user);
        db.Tenants.AddRange(loja, outra);
        db.Users.Add(user);
        db.SaveChanges();

        var response = await controller.SwitchStore(new AuthController.SwitchStoreRequest(outra.Id), default);
        Assert.IsType<ForbidResult>(response.Result);
    }

    [Fact]
    public async Task SwitchStore_RefusesBlockedStore()
    {
        var matriz = Store("Matriz", GroupA);
        var filial = Store("Filial Bloqueada", GroupA, active: false);
        var user = UserIn(matriz);

        var (controller, db) = Setup(matriz, user);
        db.Tenants.AddRange(matriz, filial);
        db.Users.Add(user);
        db.SaveChanges();

        var response = await controller.SwitchStore(new AuthController.SwitchStoreRequest(filial.Id), default);
        Assert.IsType<BadRequestObjectResult>(response.Result);
    }
}
