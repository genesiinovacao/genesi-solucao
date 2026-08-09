using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
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
/// Troca da própria senha pela tela — o que faltava para não depender de SQL
/// no banco quando alguém perde o acesso, principalmente o superadmin, que o
/// reset do UsersController recusa de propósito.
/// </summary>
public class ChangePasswordTests
{
    private static readonly Guid TenantId = Guid.NewGuid();
    private const string SenhaAtual = "SenhaAtual123";

    private static (AuthController controller, Data.AppDbContext db, User user) Setup(
        string role = "admin", bool impersonating = false, string? storedHash = null)
    {
        var db = TestDb.Create();
        var user = new User
        {
            Id = Guid.NewGuid(), TenantId = TenantId, Name = "Dono", Email = "dono@loja.com",
            PasswordHash = storedHash ?? BCrypt.Net.BCrypt.HashPassword(SenhaAtual, 11),
            Role = role, IsActive = true,
        };
        db.Users.Add(user);
        db.SaveChanges();

        // JwtService exige a config completa no construtor, mesmo que a troca
        // de senha não emita token nenhum.
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:Issuer"] = "solucao-backend",
            ["Jwt:Audience"] = "solucao-clients",
            ["Jwt:Key"] = "0123456789abcdef0123456789abcdef-unit-test",
            ["Jwt:AccessTokenMinutes"] = "60",
        }).Build();
        var controller = new AuthController(
            db, new JwtService(config), config, new FakeAudit(),
            new OperatorAuthService(db), NullLogger<AuthController>.Instance);

        var claims = new List<Claim> { new(ClaimTypes.NameIdentifier, user.Id.ToString()) };
        if (impersonating) claims.Add(new Claim(JwtService.ImpersonationClaim, "1"));

        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(claims, "test")),
            },
        };
        return (controller, db, user);
    }

    [Fact]
    public async Task ChangePassword_WithCorrectCurrent_Succeeds()
    {
        var (controller, db, user) = Setup();

        var result = await controller.ChangePassword(
            new ChangePasswordRequest(SenhaAtual, "NovaSenha456"), default);

        Assert.IsType<OkObjectResult>(result);
        var saved = await db.Users.SingleAsync();
        Assert.True(BCrypt.Net.BCrypt.Verify("NovaSenha456", saved.PasswordHash));
        Assert.False(BCrypt.Net.BCrypt.Verify(SenhaAtual, saved.PasswordHash));
    }

    /// <summary>
    /// Sem exigir a senha atual, uma sessão sequestrada viraria tomada
    /// definitiva da conta — o invasor trocaria a senha e o dono perderia
    /// o acesso.
    /// </summary>
    [Fact]
    public async Task ChangePassword_WithWrongCurrent_IsRejected()
    {
        var (controller, db, _) = Setup();

        var result = await controller.ChangePassword(
            new ChangePasswordRequest("chute-errado", "NovaSenha456"), default);

        Assert.IsType<BadRequestObjectResult>(result);
        Assert.True(BCrypt.Net.BCrypt.Verify(SenhaAtual, (await db.Users.SingleAsync()).PasswordHash));
    }

    /// <summary>Superadmin é justamente quem não tinha saída pela tela.</summary>
    [Fact]
    public async Task ChangePassword_WorksForSuperadmin()
    {
        var (controller, db, _) = Setup(role: "superadmin");

        var result = await controller.ChangePassword(
            new ChangePasswordRequest(SenhaAtual, "NovaSenha456"), default);

        Assert.IsType<OkObjectResult>(result);
        Assert.True(BCrypt.Net.BCrypt.Verify("NovaSenha456", (await db.Users.SingleAsync()).PasswordHash));
    }

    /// <summary>
    /// Suporte entra como o cliente para resolver problema, não para assumir
    /// a conta dele.
    /// </summary>
    [Fact]
    public async Task ChangePassword_IsBlockedDuringImpersonation()
    {
        var (controller, db, _) = Setup(impersonating: true);

        var result = await controller.ChangePassword(
            new ChangePasswordRequest(SenhaAtual, "NovaSenha456"), default);

        Assert.Equal(403, Assert.IsType<ObjectResult>(result).StatusCode);
        Assert.True(BCrypt.Net.BCrypt.Verify(SenhaAtual, (await db.Users.SingleAsync()).PasswordHash));
    }

    [Fact]
    public async Task ChangePassword_RejectsSameAsCurrent()
    {
        var (controller, _, _) = Setup();

        var result = await controller.ChangePassword(
            new ChangePasswordRequest(SenhaAtual, SenhaAtual), default);

        Assert.IsType<BadRequestObjectResult>(result);
    }

    /// <summary>
    /// Refresh token emitido com a senha antiga não pode continuar valendo:
    /// trocar senha é o gesto de quem suspeita de acesso indevido.
    /// </summary>
    [Fact]
    public async Task ChangePassword_RevokesOtherSessions()
    {
        var (controller, db, user) = Setup();
        db.RefreshTokens.Add(new RefreshToken
        {
            Id = Guid.NewGuid(), TenantId = TenantId, UserId = user.Id,
            TokenHash = "hash-antigo", ExpiresAt = DateTime.UtcNow.AddDays(14),
        });
        await db.SaveChangesAsync();

        await controller.ChangePassword(new ChangePasswordRequest(SenhaAtual, "NovaSenha456"), default);

        Assert.NotNull((await db.RefreshTokens.SingleAsync()).RevokedAt);
    }

    /// <summary>
    /// Hash corrompido: a senha atual é inverificável, então esta tela não
    /// destrava a conta. Mas responde explicando, em vez de estourar 500.
    /// </summary>
    [Fact]
    public async Task ChangePassword_WithCorruptStoredHash_ExplainsInsteadOfCrashing()
    {
        var (controller, _, _) = Setup(storedHash: "isto-nao-e-um-hash");

        var result = await controller.ChangePassword(
            new ChangePasswordRequest(SenhaAtual, "NovaSenha456"), default);

        Assert.IsType<BadRequestObjectResult>(result);
    }
}
