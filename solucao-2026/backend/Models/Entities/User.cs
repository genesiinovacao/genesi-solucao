namespace Solucao.Backend.Models.Entities;

public class User
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public string Name { get; set; } = null!;
    public string Email { get; set; } = null!;
    public string PasswordHash { get; set; } = null!;
    public string Role { get; set; } = "manager";
    /// <summary>Código curto digitado no PDV na troca de turno (único na loja).</summary>
    public string? OperatorCode { get; set; }
    /// <summary>PIN numérico (BCrypt) — login rápido e autorização de supervisor.</summary>
    public string? PinHash { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime? LastLoginAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
