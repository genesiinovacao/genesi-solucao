using System.ComponentModel.DataAnnotations;

namespace Solucao.Backend.Models.Dtos.Customers;

public record CustomerDto(
    Guid Id,
    string Name,
    string? TaxId,
    string? Email,
    string? Phone,
    string? Address,
    int LoyaltyPoints,
    decimal TotalSpent,
    string Status,
    string Tier,            // bronze / silver / gold (derivado de LoyaltyPoints)
    DateOnly? BirthDate,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    // Saldo de devolução que o cliente pode gastar como vale crédito no PDV
    decimal CreditBalance = 0);

public record CreateCustomerRequest(
    [Required, StringLength(255)] string Name,
    string? TaxId,
    string? Email,
    string? Phone,
    string? Address,
    int LoyaltyPoints,
    DateOnly? BirthDate,
    string? Notes);

public record UpdateCustomerRequest(
    [Required, StringLength(255)] string Name,
    string? TaxId,
    string? Email,
    string? Phone,
    string? Address,
    int LoyaltyPoints,
    string Status,
    DateOnly? BirthDate,
    string? Notes);

public record CustomerListResponse(
    IReadOnlyList<CustomerDto> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages);
