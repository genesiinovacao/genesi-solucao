using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Solucao.Backend.Controllers;
using Solucao.Backend.Models.Dtos.Auth;
using Solucao.Backend.Models.Dtos.Users;
using Solucao.Backend.Models.Entities;
using Solucao.Backend.Services;
using Solucao.Backend.Tests.Support;
using Xunit;

namespace Solucao.Backend.Tests;

/// <summary>
/// Operação de balcão: troca de turno por código+PIN e autorização de
/// supervisor para desconto acima do limite da loja.
/// </summary>
public class OperatorPinTests
{
    private static readonly Guid TenantId = Guid.NewGuid();

    private static IConfiguration Config() => new ConfigurationBuilder()
        .AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:Issuer"] = "solucao-backend",
            ["Jwt:Audience"] = "solucao-clients",
            ["Jwt:Key"] = "0123456789abcdef0123456789abcdef-unit-test",
        }).Build();

    private static User Operator(string name, string role, string? code, string? pin, bool active = true) => new()
    {
        Id = Guid.NewGuid(), TenantId = TenantId, Name = name,
        Email = $"{Guid.NewGuid():N}@loja.com", PasswordHash = "x", Role = role, IsActive = active,
        OperatorCode = code,
        PinHash = pin is null ? null : BCrypt.Net.BCrypt.HashPassword(pin),
    };

    private static (AuthController controller, Data.AppDbContext db) Setup(User loggedIn)
    {
        var db = TestDb.Create();
        var config = Config();
        var controller = new AuthController(
            db, new JwtService(config), config, new FakeAudit(),
            new OperatorAuthService(db), NullLogger<AuthController>.Instance);

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, loggedIn.Id.ToString()),
            new(JwtService.TenantIdClaim, TenantId.ToString()),
            new(ClaimTypes.Role, loggedIn.Role),
        };
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(claims, "test")) },
        };

        db.Tenants.Add(new Tenant { Id = TenantId, Name = "Mercado Teste", Cnpj = "11222333000144" });
        db.Users.Add(loggedIn);
        db.SaveChanges();
        return (controller, db);
    }

    // ---- Troca de turno ----

    [Fact]
    public async Task SwitchOperator_AcceptsCorrectCodeAndPin()
    {
        var caixa1 = Operator("Ana Caixa", "cashier", "01", "1234");
        var (controller, db) = Setup(caixa1);
        var caixa2 = Operator("Bruno Caixa", "cashier", "02", "5678");
        db.Users.Add(caixa2);
        db.SaveChanges();

        var response = await controller.SwitchOperator(
            new AuthController.OperatorLoginRequest("02", "5678"), default);

        var login = Assert.IsType<LoginResponse>(Assert.IsType<OkObjectResult>(response.Result).Value);
        Assert.Equal(caixa2.Id, login.User.Id);
        Assert.Equal("Bruno Caixa", login.User.Name);
    }

    [Fact]
    public async Task SwitchOperator_IsCaseInsensitiveOnCode()
    {
        var caixa = Operator("Ana", "cashier", "01", "1234");
        var (controller, db) = Setup(caixa);
        db.Users.Add(Operator("Carla", "cashier", "CX2", "9999"));
        db.SaveChanges();

        var response = await controller.SwitchOperator(
            new AuthController.OperatorLoginRequest("cx2", "9999"), default);
        Assert.IsType<OkObjectResult>(response.Result);
    }

    [Theory]
    [InlineData("02", "0000")]   // PIN errado
    [InlineData("99", "5678")]   // código inexistente
    public async Task SwitchOperator_RejectsWrongCredentials(string code, string pin)
    {
        var caixa1 = Operator("Ana", "cashier", "01", "1234");
        var (controller, db) = Setup(caixa1);
        db.Users.Add(Operator("Bruno", "cashier", "02", "5678"));
        db.SaveChanges();

        var response = await controller.SwitchOperator(
            new AuthController.OperatorLoginRequest(code, pin), default);
        Assert.IsType<UnauthorizedObjectResult>(response.Result);
    }

    [Fact]
    public async Task SwitchOperator_RejectsInactiveUser()
    {
        var caixa1 = Operator("Ana", "cashier", "01", "1234");
        var (controller, db) = Setup(caixa1);
        db.Users.Add(Operator("Demitido", "cashier", "09", "1111", active: false));
        db.SaveChanges();

        var response = await controller.SwitchOperator(
            new AuthController.OperatorLoginRequest("09", "1111"), default);
        Assert.IsType<UnauthorizedObjectResult>(response.Result);
    }

    [Fact]
    public async Task SwitchOperator_RejectsUserWithoutPin()
    {
        var caixa1 = Operator("Ana", "cashier", "01", "1234");
        var (controller, db) = Setup(caixa1);
        db.Users.Add(Operator("Sem PIN", "cashier", "07", null));
        db.SaveChanges();

        var response = await controller.SwitchOperator(
            new AuthController.OperatorLoginRequest("07", "1234"), default);
        Assert.IsType<UnauthorizedObjectResult>(response.Result);
    }

    // ---- Autorização de supervisor ----

    [Theory]
    [InlineData("admin")]
    [InlineData("manager")]
    public async Task Authorize_AllowsSupervisors(string role)
    {
        var caixa = Operator("Ana", "cashier", "01", "1234");
        var (controller, db) = Setup(caixa);
        db.Users.Add(Operator("Gerente", role, "99", "4321"));
        db.SaveChanges();

        var response = await controller.AuthorizeAction(
            new AuthController.AuthorizeRequest("99", "4321", "desconto de 30%", 30m), default);

        var dto = Assert.IsType<AuthController.AuthorizationDto>(
            Assert.IsType<OkObjectResult>(response.Result).Value);
        Assert.True(dto.Authorized);
        Assert.Equal("Gerente", dto.SupervisorName);
    }

    [Fact]
    public async Task Authorize_RefusesCashierAsSupervisor()
    {
        var caixa = Operator("Ana", "cashier", "01", "1234");
        var (controller, db) = Setup(caixa);
        db.Users.Add(Operator("Outro Caixa", "cashier", "02", "5678"));
        db.SaveChanges();

        var response = await controller.AuthorizeAction(
            new AuthController.AuthorizeRequest("02", "5678", "desconto de 50%", 50m), default);

        var result = Assert.IsType<ObjectResult>(response.Result);
        Assert.Equal(403, result.StatusCode);
    }

    [Fact]
    public async Task Authorize_RefusesWrongPin()
    {
        var caixa = Operator("Ana", "cashier", "01", "1234");
        var (controller, db) = Setup(caixa);
        db.Users.Add(Operator("Gerente", "manager", "99", "4321"));
        db.SaveChanges();

        var response = await controller.AuthorizeAction(
            new AuthController.AuthorizeRequest("99", "0000", "desconto", 30m), default);
        Assert.IsType<UnauthorizedObjectResult>(response.Result);
    }

    // ---- Cadastro do operador ----

    [Fact]
    public async Task CreateUser_RejectsDuplicateOperatorCode()
    {
        var db = TestDb.Create();
        var ctx = new TenantContext();
        ctx.SetContext(TenantId, Guid.NewGuid(), "admin");
        var users = new UsersController(db, ctx, new FakeAudit(), NullLogger<UsersController>.Instance);

        db.Users.Add(Operator("Ana", "cashier", "01", "1234"));
        db.SaveChanges();

        var response = await users.Create(
            new CreateUserRequest("Bruno", "bruno@loja.com", "123456", "cashier", "01", "5678"), default);

        Assert.IsType<ConflictObjectResult>(response.Result);
    }

    [Theory]
    [InlineData("1")]         // curto demais
    [InlineData("COD COM ESPACO")]
    public async Task CreateUser_RejectsInvalidOperatorCode(string code)
    {
        var db = TestDb.Create();
        var ctx = new TenantContext();
        ctx.SetContext(TenantId, Guid.NewGuid(), "admin");
        var users = new UsersController(db, ctx, new FakeAudit(), NullLogger<UsersController>.Instance);

        var response = await users.Create(
            new CreateUserRequest("Bruno", "bruno@loja.com", "123456", "cashier", code, "5678"), default);

        Assert.IsType<BadRequestObjectResult>(response.Result);
    }

    [Theory]
    [InlineData("123")]        // PIN curto
    [InlineData("12a4")]       // PIN não numérico
    public async Task CreateUser_RejectsInvalidPin(string pin)
    {
        var db = TestDb.Create();
        var ctx = new TenantContext();
        ctx.SetContext(TenantId, Guid.NewGuid(), "admin");
        var users = new UsersController(db, ctx, new FakeAudit(), NullLogger<UsersController>.Instance);

        var response = await users.Create(
            new CreateUserRequest("Bruno", "bruno@loja.com", "123456", "cashier", "05", pin), default);

        Assert.IsType<BadRequestObjectResult>(response.Result);
    }
}
