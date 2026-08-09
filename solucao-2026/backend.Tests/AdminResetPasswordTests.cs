using Microsoft.AspNetCore.Http;
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

/// <summary>
/// Redefinição de senha de cliente pelo suporte.
///
/// O caminho feliz depende de duas funções SECURITY DEFINER que só existem no
/// PostgreSQL (o provider InMemory não tem SQL bruto), então o que dá para
/// travar aqui é o contrato de autorização — que é justamente o que não pode
/// afrouxar: só superadmin, e sempre auditado.
/// </summary>
public class AdminResetPasswordTests
{
    private static readonly Guid PlatformTenant = new("00000000-0000-0000-0000-000000000001");

    private static (AdminController controller, Data.AppDbContext db, FakeAudit audit) Setup(string role)
    {
        var db = TestDb.Create();
        var ctx = new TenantContext();
        ctx.SetContext(PlatformTenant, Guid.NewGuid(), role);

        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:Issuer"] = "solucao-backend",
            ["Jwt:Audience"] = "solucao-clients",
            ["Jwt:Key"] = "0123456789abcdef0123456789abcdef-unit-test",
            ["Jwt:AccessTokenMinutes"] = "60",
        }).Build();

        var audit = new FakeAudit();
        var controller = new AdminController(
            db, new JwtService(config), ctx, new MemoryCache(new MemoryCacheOptions()),
            audit, NullLogger<AdminController>.Instance)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
        };
        return (controller, db, audit);
    }

    /// <summary>
    /// Poder redefinir senha de terceiro é do dono da plataforma. O atributo
    /// [Authorize(Roles="superadmin")] na classe é o que garante isso — este
    /// teste documenta a dependência, já que o atributo não roda em teste
    /// unitário de controller.
    /// </summary>
    [Fact]
    public void Controller_IsRestrictedToSuperadmin()
    {
        var attr = typeof(AdminController)
            .GetCustomAttributes(typeof(Microsoft.AspNetCore.Authorization.AuthorizeAttribute), true)
            .Cast<Microsoft.AspNetCore.Authorization.AuthorizeAttribute>()
            .SingleOrDefault();

        Assert.NotNull(attr);
        Assert.Equal("superadmin", attr!.Roles);
    }

    [Fact]
    public async Task Reset_OnUnknownTenant_Is404()
    {
        var (controller, _, audit) = Setup("superadmin");

        var result = await controller.ResetTenantUserPassword(
            Guid.NewGuid(), new AdminResetPasswordRequest(Guid.NewGuid(), "NovaSenha123"), default);

        Assert.IsType<NotFoundResult>(result);
        Assert.Empty(audit.Entries);
    }

    [Fact]
    public async Task ListUsers_OnUnknownTenant_Is404()
    {
        var (controller, _, _) = Setup("superadmin");

        var response = await controller.ListTenantUsers(Guid.NewGuid(), default);

        Assert.IsType<NotFoundResult>(response.Result);
    }

    /// <summary>
    /// A senha nova carrega tamanho mínimo, senão o suporte poderia definir
    /// "1" para o cliente.
    ///
    /// Confere os atributos no parâmetro do construtor, não via
    /// Validator.TryValidateObject: em record posicional os atributos ficam no
    /// parâmetro, e o Validator só enxerga propriedades — ele daria "válido"
    /// para senha vazia e o teste passaria mentindo. Quem aplica de verdade é
    /// o model binding do ASP.NET, que lê o construtor.
    /// </summary>
    [Fact]
    public void Request_DeclaresMinimumPasswordLength()
    {
        var parametro = typeof(AdminResetPasswordRequest)
            .GetConstructors().Single()
            .GetParameters().Single(p => p.Name == "NewPassword");

        var min = parametro
            .GetCustomAttributes(typeof(System.ComponentModel.DataAnnotations.MinLengthAttribute), false)
            .Cast<System.ComponentModel.DataAnnotations.MinLengthAttribute>()
            .SingleOrDefault();

        Assert.NotNull(min);
        Assert.True(min!.Length >= 6, "senha do cliente não pode ser mais curta que 6");
        Assert.Contains(parametro.GetCustomAttributes(false),
            a => a is System.ComponentModel.DataAnnotations.RequiredAttribute);
    }
}
