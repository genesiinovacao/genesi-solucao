using System.ComponentModel.DataAnnotations;

namespace Solucao.Backend.Models.Dtos.Suppliers;

public record SupplierDto(
    Guid Id,
    string Name,
    string? Cnpj,
    string? ContactName,
    string? Phone,
    string? Email,
    string? Address,
    string? Category,
    string Status,
    string? Notes,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record CreateSupplierRequest(
    [Required, StringLength(255)] string Name,
    string? Cnpj,
    string? ContactName,
    string? Phone,
    string? Email,
    string? Address,
    string? Category,
    string? Notes);

public record UpdateSupplierRequest(
    [Required, StringLength(255)] string Name,
    string? Cnpj,
    string? ContactName,
    string? Phone,
    string? Email,
    string? Address,
    string? Category,
    string Status,
    string? Notes);

public record SupplierListResponse(
    IReadOnlyList<SupplierDto> Items,
    int Page, int PageSize, int TotalCount, int TotalPages);
