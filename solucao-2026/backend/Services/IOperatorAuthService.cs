using Microsoft.EntityFrameworkCore;
using Solucao.Backend.Data;
using Solucao.Backend.Models.Entities;

namespace Solucao.Backend.Services;

/// <summary>
/// Validação de código + PIN do operador. Compartilhado entre a troca de
/// turno, a autorização de desconto e a sangria — a regra de quem pode
/// autorizar mora em um lugar só.
/// </summary>
public interface IOperatorAuthService
{
    /// <summary>Operador ativo da loja atual, com PIN conferido.</summary>
    Task<User?> FindAsync(string? code, string? pin, CancellationToken ct);

    /// <summary>Idem, mas só admin ou gerente — quem pode autorizar.</summary>
    Task<User?> FindSupervisorAsync(string? code, string? pin, CancellationToken ct);
}

public sealed class OperatorAuthService : IOperatorAuthService
{
    private readonly AppDbContext _db;

    public OperatorAuthService(AppDbContext db) => _db = db;

    public async Task<User?> FindAsync(string? code, string? pin, CancellationToken ct)
    {
        var normalized = code?.Trim().ToUpperInvariant();
        if (string.IsNullOrWhiteSpace(normalized) || string.IsNullOrWhiteSpace(pin)) return null;

        // O RLS já restringe à loja da sessão
        var user = await _db.Users
            .FirstOrDefaultAsync(u => u.OperatorCode == normalized && u.IsActive, ct);

        if (user?.PinHash is null) return null;
        return BCrypt.Net.BCrypt.Verify(pin, user.PinHash) ? user : null;
    }

    public async Task<User?> FindSupervisorAsync(string? code, string? pin, CancellationToken ct)
    {
        var user = await FindAsync(code, pin, ct);
        return user is { Role: "admin" or "manager" } ? user : null;
    }
}
