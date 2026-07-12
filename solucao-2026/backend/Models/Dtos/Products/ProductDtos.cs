using System.ComponentModel.DataAnnotations;

namespace Solucao.Backend.Models.Dtos.Products;

public record ProductDto(
    Guid Id,
    string? Sku,
    string? Barcode,
    string Name,
    string? Description,
    string? Category,
    string Unit,
    string? Emoji,
    decimal CostPrice,
    decimal SalePrice,
    decimal StockQuantity,
    decimal MinStock,
    DateOnly? ExpiryDate,
    bool IsActive,
    Guid? SupplierId,
    DateTime UpdatedAt
);

public record CreateProductRequest(
    string? Sku,
    string? Barcode,
    [Required, StringLength(255)] string Name,
    string? Description,
    string? Category,
    string Unit,
    string? Emoji,
    [Range(0, 9999999.99)] decimal CostPrice,
    [Range(0, 9999999.99)] decimal SalePrice,
    decimal StockQuantity,
    decimal MinStock,
    DateOnly? ExpiryDate,
    Guid? SupplierId
);

public record UpdateProductRequest(
    string? Sku,
    string? Barcode,
    [Required, StringLength(255)] string Name,
    string? Description,
    string? Category,
    string Unit,
    string? Emoji,
    [Range(0, 9999999.99)] decimal CostPrice,
    [Range(0, 9999999.99)] decimal SalePrice,
    decimal MinStock,
    DateOnly? ExpiryDate,
    Guid? SupplierId,
    bool IsActive
);

public record ProductListResponse(
    IReadOnlyList<ProductDto> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages
);
