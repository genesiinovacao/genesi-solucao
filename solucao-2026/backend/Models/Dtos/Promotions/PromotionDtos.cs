using System.ComponentModel.DataAnnotations;

namespace Solucao.Backend.Models.Dtos.Promotions;

public record PromotionDto(
    Guid Id,
    string Name,
    decimal DiscountPercent,
    string TargetType,         // product | category | loyalty | total
    string? TargetValue,
    DateOnly StartsAt,
    DateOnly EndsAt,
    bool IsActive,
    int SalesCount,
    decimal TotalSavings,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record CreatePromotionRequest(
    [Required, StringLength(255)] string Name,
    [Range(0, 100)] decimal DiscountPercent,
    [Required] string TargetType,
    string? TargetValue,
    DateOnly StartsAt,
    DateOnly EndsAt);

public record UpdatePromotionRequest(
    [Required, StringLength(255)] string Name,
    [Range(0, 100)] decimal DiscountPercent,
    [Required] string TargetType,
    string? TargetValue,
    DateOnly StartsAt,
    DateOnly EndsAt,
    bool IsActive);

public record PromotionListResponse(
    IReadOnlyList<PromotionDto> Items,
    int Page, int PageSize, int TotalCount, int TotalPages);
