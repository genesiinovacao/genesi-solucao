using System.ComponentModel.DataAnnotations;

namespace Solucao.Backend.Models.Dtos.Settings;

public record TenantSettingsDto(
    Guid Id,
    string Name,
    string Cnpj,
    string PlanType,
    string? Phone,
    string? Email,
    string? Address,
    decimal DailySalesTarget,
    string TaxRegime,
    string? LogoEmoji);

public record UpdateTenantSettingsRequest(
    [Required, StringLength(255)] string Name,
    string? Phone,
    string? Email,
    string? Address,
    [Range(0, 9999999.99)] decimal DailySalesTarget,
    string TaxRegime,
    string? LogoEmoji);
