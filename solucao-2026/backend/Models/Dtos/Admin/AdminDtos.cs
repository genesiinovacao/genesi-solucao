using System.ComponentModel.DataAnnotations;

namespace Solucao.Backend.Models.Dtos.Admin;

public record AdminTenantDto(
    Guid Id,
    string Name,
    string Cnpj,
    string PlanType,
    string Segment,
    bool IsActive,
    int MaxPosTerminals,
    string? LogoBase64,
    DateTime CreatedAt);

public record CreateTenantRequest(
    [Required, MinLength(2), MaxLength(255)] string TenantName,
    [Required] string Cnpj,
    [Required] string Segment,
    string? LogoBase64,
    [Range(0, 100)] int MaxPosTerminals,
    [Required, MinLength(2), MaxLength(255)] string UserName,
    [Required, EmailAddress] string Email,
    [Required, MinLength(6)] string Password);

public record UpdateTenantRequest(
    [Required, MinLength(2), MaxLength(255)] string Name,
    [Required] string Segment,
    string? LogoBase64,
    [Range(0, 100)] int MaxPosTerminals,
    bool IsActive,
    string PlanType);

public record PlatformLogoDto(string? LogoBase64);
