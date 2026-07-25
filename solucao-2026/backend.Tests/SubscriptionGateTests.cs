using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.Extensions.Configuration;
using Solucao.Backend.Models.Entities;
using Solucao.Backend.Services;
using Xunit;

namespace Solucao.Backend.Tests;

/// <summary>
/// O acesso de suporte (impersonação) precisa atravessar o bloqueio por
/// assinatura vencida — é exatamente quando o superadmin tem de entrar.
/// </summary>
public class SubscriptionGateTests
{
    private static JwtService Jwt() => new(new ConfigurationBuilder()
        .AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:Issuer"] = "solucao-backend",
            ["Jwt:Audience"] = "solucao-clients",
            ["Jwt:Key"] = "0123456789abcdef0123456789abcdef-unit-test",
        }).Build());

    private static User AnyUser() => new()
    {
        Id = Guid.NewGuid(), TenantId = Guid.NewGuid(), Name = "Suporte SOLUÇÃO",
        Email = "suporte@plataforma.interno", Role = "admin", PasswordHash = "",
    };

    [Fact]
    public void ImpersonationToken_CarriesTheExemptionClaim()
    {
        var (token, _) = Jwt().GenerateAccessToken(AnyUser(), "Cliente Alvo", impersonated: true);
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token);

        Assert.Equal("1", jwt.Claims.First(c => c.Type == JwtService.ImpersonationClaim).Value);
    }

    [Fact]
    public void NormalLoginToken_HasNoExemptionClaim()
    {
        var (token, _) = Jwt().GenerateAccessToken(AnyUser(), "Loja do Cliente");
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token);

        Assert.DoesNotContain(jwt.Claims, c => c.Type == JwtService.ImpersonationClaim);
    }

    [Theory]
    [InlineData(true, false)]   // suporte: nunca bloqueia
    [InlineData(false, true)]   // cliente comum com assinatura vencida: bloqueia
    public void ExpiredSubscription_BlocksOnlyRealClients(bool impersonated, bool expectBlocked)
    {
        var (token, _) = Jwt().GenerateAccessToken(AnyUser(), "Loja", impersonated);
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token);
        var principal = new ClaimsPrincipal(new ClaimsIdentity(jwt.Claims, "test"));

        // Mesma condição usada pelo middleware e pelo SettingsController
        var isSupportSession = principal.FindFirst(JwtService.ImpersonationClaim)?.Value == "1";
        var expiry = DateOnly.FromDateTime(DateTime.Now).AddDays(-30);
        var blocked = !isSupportSession && DateOnly.FromDateTime(DateTime.Now) >= expiry.AddDays(4);

        Assert.Equal(expectBlocked, blocked);
    }
}
