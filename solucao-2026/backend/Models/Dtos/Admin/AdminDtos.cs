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
    DateOnly? SubscriptionExpiresAt,
    bool SubscriptionIsBonus,
    Guid? GroupId,
    string? GroupName,
    DateTime CreatedAt);

public record TenantGroupDto(Guid Id, string Name, int StoreCount);
public record CreateGroupRequest(string Name);

public record CreateTenantRequest(
    [Required, MinLength(2), MaxLength(255)] string TenantName,
    [Required] string Cnpj,
    [Required] string Segment,
    string? LogoBase64,
    [Range(0, 100)] int MaxPosTerminals,
    DateOnly? SubscriptionExpiresAt,
    bool SubscriptionIsBonus,
    Guid? GroupId,
    [Required, MinLength(2), MaxLength(255)] string UserName,
    [Required, EmailAddress] string Email,
    [Required, MinLength(6)] string Password);

public record UpdateTenantRequest(
    [Required, MinLength(2), MaxLength(255)] string Name,
    [Required] string Segment,
    string? LogoBase64,
    [Range(0, 100)] int MaxPosTerminals,
    DateOnly? SubscriptionExpiresAt,
    bool SubscriptionIsBonus,
    Guid? GroupId,
    bool IsActive,
    string PlanType);

/// <summary>Renovação manual. IsBonus = cortesia (não gera receita).</summary>
public record RenewSubscriptionRequest(DateOnly ExpiresAt, bool IsBonus = false, string? Notes = null);

/// <summary>Linha do histórico financeiro do cliente (paga ou bonificada).</summary>
public record TenantChargeDto(
    Guid Id,
    string ChargeType,
    string PlanType,
    int Months,
    decimal Amount,
    int ProRataDays,
    decimal ProRataAmount,
    string Status,
    string Provider,
    DateOnly? PeriodStart,
    DateOnly? AppliedNewExpiry,
    string? Notes,
    DateTime CreatedAt,
    DateTime? PaidAt);

public record PlatformLogoDto(string? LogoBase64);

public record ImpersonationResponse(
    string AccessToken,
    DateTime ExpiresAt,
    Solucao.Backend.Models.Dtos.Auth.UserDto User);

/// <summary>Usuário de um cliente, na tela de suporte. Nunca carrega o hash.</summary>
public record AdminTenantUserDto(
    Guid UserId,
    string Name,
    string Email,
    string Role,
    bool IsActive,
    DateTime? LastLogin);

/// <summary>
/// Redefinição feita pelo suporte: sem senha atual, porque quem redefine não
/// a conhece — é justamente o caso de o cliente ter perdido o acesso. O que
/// autoriza é o papel superadmin, e o ato fica no audit_log.
/// </summary>
public record AdminResetPasswordRequest(
    Guid UserId,
    [System.ComponentModel.DataAnnotations.Required]
    [System.ComponentModel.DataAnnotations.MinLength(6)]
    [System.ComponentModel.DataAnnotations.MaxLength(200)]
    string NewPassword);
