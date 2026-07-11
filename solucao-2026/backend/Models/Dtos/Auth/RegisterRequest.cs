using System.ComponentModel.DataAnnotations;

namespace Solucao.Backend.Models.Dtos.Auth;

public record RegisterRequest(
    [Required, MinLength(2), MaxLength(255)] string TenantName,
    [Required] string Cnpj,
    [Required, MinLength(2), MaxLength(255)] string UserName,
    [Required, EmailAddress] string Email,
    [Required, MinLength(6)] string Password
);
