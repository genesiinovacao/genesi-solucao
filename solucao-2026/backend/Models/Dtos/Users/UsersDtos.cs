using System.ComponentModel.DataAnnotations;

namespace Solucao.Backend.Models.Dtos.Users;

public record TeamUserDto(
    Guid Id,
    string Name,
    string Email,
    string Role,
    bool IsActive,
    string? OperatorCode,
    bool HasPin,
    DateTime? LastLoginAt,
    DateTime CreatedAt);

public record CreateUserRequest(
    [Required, StringLength(255)] string Name,
    [Required, EmailAddress] string Email,
    [Required, MinLength(6)] string Password,
    [Required] string Role,
    string? OperatorCode = null,
    string? Pin = null);

public record UpdateUserRequest(
    [Required, StringLength(255)] string Name,
    [Required] string Role,
    bool IsActive,
    string? OperatorCode = null);

/// <summary>Define ou troca o PIN de caixa. Vazio remove o acesso rápido.</summary>
public record SetPinRequest(string? Pin);

public record ResetPasswordRequest(
    [Required, MinLength(6)] string NewPassword);
