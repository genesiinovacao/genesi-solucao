using System.ComponentModel.DataAnnotations;

namespace Solucao.Backend.Models.Dtos.Auth;

/// <summary>
/// Troca da própria senha. Exige a senha atual de propósito: sem isso, uma
/// sessão sequestrada (máquina do caixa aberta, token vazado) viraria tomada
/// definitiva da conta — o invasor trocaria a senha e o dono perderia o acesso.
/// </summary>
public record ChangePasswordRequest(
    [Required] string CurrentPassword,
    [Required, MinLength(6), MaxLength(200)] string NewPassword);
