namespace Solucao.Backend.Models.Entities;

/// <summary>
/// Rede de lojas do mesmo dono. Cada filial continua sendo um tenant
/// independente (isolamento e assinatura próprios); o grupo só permite o
/// funcionário alternar entre elas sem novo login.
/// </summary>
public class TenantGroup
{
    public Guid Id { get; set; }
    public string Name { get; set; } = null!;
    public DateTime CreatedAt { get; set; }
}
