using System.IdentityModel.Tokens.Jwt;
using Microsoft.Extensions.Configuration;
using Solucao.Backend.Models.Entities;
using Solucao.Backend.Services;
using Xunit;

namespace Solucao.Backend.Tests;

public class JwtServiceTests
{
    private static IConfiguration Config(string key = "0123456789abcdef0123456789abcdef-unit-test") =>
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:Issuer"] = "solucao-backend",
            ["Jwt:Audience"] = "solucao-clients",
            ["Jwt:Key"] = key,
            ["Jwt:AccessTokenMinutes"] = "60",
        }).Build();

    private static User DemoUser(Guid tenantId) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        Name = "Caixa Teste",
        Email = "caixa@teste.com",
        Role = "cashier",
    };

    [Fact]
    public void GenerateAccessToken_IncludesTenantAndUserClaims()
    {
        var svc = new JwtService(Config());
        var tenantId = Guid.NewGuid();
        var user = DemoUser(tenantId);

        var (token, expiresAt) = svc.GenerateAccessToken(user, "Mercado Teste");

        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token);
        Assert.Equal(user.Id.ToString(), jwt.Claims.First(c => c.Type == "sub").Value);
        Assert.Equal(tenantId.ToString(), jwt.Claims.First(c => c.Type == JwtService.TenantIdClaim).Value);
        Assert.Equal("Mercado Teste", jwt.Claims.First(c => c.Type == JwtService.TenantNameClaim).Value);
        Assert.Contains(jwt.Claims, c => c.Value == "cashier");
        Assert.True(expiresAt > DateTime.UtcNow.AddMinutes(55));
    }

    [Fact]
    public void Constructor_RejectsShortKey()
    {
        Assert.Throws<InvalidOperationException>(() => new JwtService(Config("curta")));
    }

    [Fact]
    public void RefreshToken_HashAndVerify_RoundTrips()
    {
        var svc = new JwtService(Config());
        var raw = svc.GenerateRefreshTokenRaw();
        var hash = svc.HashRefreshToken(raw);

        Assert.True(svc.VerifyRefreshToken(raw, hash));
        Assert.False(svc.VerifyRefreshToken(raw + "x", hash));
    }

    [Fact]
    public void GenerateRefreshTokenRaw_IsUrlSafeAndUnique()
    {
        var svc = new JwtService(Config());
        var a = svc.GenerateRefreshTokenRaw();
        var b = svc.GenerateRefreshTokenRaw();

        Assert.NotEqual(a, b);
        Assert.DoesNotContain('/', a);
        Assert.DoesNotContain('+', a);
        Assert.DoesNotContain('=', a);
    }
}
