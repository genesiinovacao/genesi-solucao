namespace Solucao.Backend.Models.Entities;

/// <summary>Linha única (id = 1) com configurações globais da plataforma.</summary>
public class PlatformSettings
{
    public int Id { get; set; } = 1;
    public string? LogoBase64 { get; set; }
    public DateTime UpdatedAt { get; set; }
}
