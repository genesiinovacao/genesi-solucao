using System.Security.Claims;
using Solucao.Backend.Models.Entities;

namespace Solucao.Backend.Services;

public interface IJwtService
{
    /// <param name="impersonated">
    /// Token de acesso de suporte emitido pelo superadmin. Marca a claim
    /// <c>imp</c>, que isenta a sessão do bloqueio por assinatura vencida —
    /// é justamente quando o suporte precisa entrar.
    /// </param>
    (string token, DateTime expiresAt) GenerateAccessToken(User user, string tenantName, bool impersonated = false);
    string GenerateRefreshTokenRaw();
    string HashRefreshToken(string raw);
    bool VerifyRefreshToken(string raw, string hash);
}
