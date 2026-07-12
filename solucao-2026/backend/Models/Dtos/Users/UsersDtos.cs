using System.ComponentModel.DataAnnotations;

namespace Solucao.Backend.Models.Dtos.Users;

public record TeamUserDto(
    Guid Id,
    string Name,
    string Email,
    string Role,
    bool IsActive,
    DateTime? LastLoginAt,
    DateTime CreatedAt);

public record CreateUserRequest(
    [Required, StringLength(255)] string Name,
    [Required, EmailAddress] string Email,
    [Required, MinLength(6)] string Password,
    [Required] string Role);

public record UpdateUserRequest(
    [Required, StringLength(255)] string Name,
    [Required] string Role,
    bool IsActive);

public record ResetPasswordRequest(
    [Required, MinLength(6)] string NewPassword);
