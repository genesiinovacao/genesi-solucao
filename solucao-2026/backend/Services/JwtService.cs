using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using Solucao.Backend.Models.Entities;

namespace Solucao.Backend.Services;

public sealed class JwtService : IJwtService
{
    public const string TenantIdClaim = "tenant_id";
    public const string TenantNameClaim = "tenant_name";

    private readonly JwtOptions _opts;

    public JwtService(IConfiguration config)
    {
        _opts = new JwtOptions
        {
            Issuer = config["Jwt:Issuer"] ?? throw new InvalidOperationException("Jwt:Issuer missing"),
            Audience = config["Jwt:Audience"] ?? throw new InvalidOperationException("Jwt:Audience missing"),
            Key = config["Jwt:Key"] ?? throw new InvalidOperationException("Jwt:Key missing"),
            AccessTokenMinutes = config.GetValue("Jwt:AccessTokenMinutes", 60),
            RefreshTokenDays = config.GetValue("Jwt:RefreshTokenDays", 14)
        };

        if (Encoding.UTF8.GetByteCount(_opts.Key) < 32)
            throw new InvalidOperationException("Jwt:Key must be at least 32 bytes (256 bits).");
    }

    public const string ImpersonationClaim = "imp";

    public (string token, DateTime expiresAt) GenerateAccessToken(User user, string tenantName, bool impersonated = false)
    {
        var now = DateTime.UtcNow;
        var expiresAt = now.AddMinutes(_opts.AccessTokenMinutes);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(JwtRegisteredClaimNames.Email, user.Email),
            new(ClaimTypes.Role, user.Role),
            new("name", user.Name),
            new(TenantIdClaim, user.TenantId.ToString()),
            new(TenantNameClaim, tenantName),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        if (impersonated) claims.Add(new Claim(ImpersonationClaim, "1"));

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_opts.Key));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _opts.Issuer,
            audience: _opts.Audience,
            claims: claims,
            notBefore: now,
            expires: expiresAt,
            signingCredentials: creds);

        return (new JwtSecurityTokenHandler().WriteToken(token), expiresAt);
    }

    public string GenerateRefreshTokenRaw()
    {
        Span<byte> bytes = stackalloc byte[64];
        RandomNumberGenerator.Fill(bytes);
        return Convert.ToBase64String(bytes).Replace("/", "_").Replace("+", "-").TrimEnd('=');
    }

    public string HashRefreshToken(string raw)
    {
        Span<byte> hash = stackalloc byte[32];
        SHA256.HashData(Encoding.UTF8.GetBytes(raw), hash);
        return Convert.ToHexString(hash);
    }

    public bool VerifyRefreshToken(string raw, string hash) =>
        CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(HashRefreshToken(raw)),
            Encoding.UTF8.GetBytes(hash));

    private sealed class JwtOptions
    {
        public required string Issuer { get; init; }
        public required string Audience { get; init; }
        public required string Key { get; init; }
        public int AccessTokenMinutes { get; init; }
        public int RefreshTokenDays { get; init; }
    }
}
