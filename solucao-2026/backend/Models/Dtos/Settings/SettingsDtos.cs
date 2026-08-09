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
    decimal MaxDiscountPercent,
    string TaxRegime,
    string? LogoEmoji,
    string? LogoBase64,
    string Segment,
    string? GlobalLogoBase64,
    DateOnly? SubscriptionExpiresAt,
    bool SubscriptionBlocked,
    bool SubscriptionIsBonus,
    /// <summary>Mapa ação → tecla do PDV. Vazio = padrão do sistema.</summary>
    IReadOnlyDictionary<string, string>? PdvShortcuts = null,
    bool AllowSaleWithoutStock = false);

public record UpdateTenantSettingsRequest(
    [Required, StringLength(255)] string Name,
    string? Phone,
    string? Email,
    string? Address,
    [Range(0, 9999999.99)] decimal DailySalesTarget,
    [Range(0, 100)] decimal MaxDiscountPercent,
    string TaxRegime,
    string? LogoEmoji,
    /// <summary>Logo da loja (data URL). O próprio admin carrega em Configurações.</summary>
    string? LogoBase64 = null,
    /// <summary>Mapa ação → tecla. Nulo mantém o que está salvo; vazio volta ao padrão.</summary>
    IReadOnlyDictionary<string, string>? PdvShortcuts = null,
    bool? AllowSaleWithoutStock = null);
