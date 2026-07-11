using System.Security.Claims;
using Solucao.Backend.Models.Entities;

namespace Solucao.Backend.Services;

public interface IJwtService
{
    (string token, DateTime expiresAt) GenerateAccessToken(User user, string tenantName);
    string GenerateRefreshTokenRaw();
    string HashRefreshToken(string raw);
    bool VerifyRefreshToken(string raw, string hash);
}
