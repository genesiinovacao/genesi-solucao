namespace Solucao.Backend.Models.Dtos.Auth;

public record LoginResponse(
    string AccessToken,
    string RefreshToken,
    DateTime ExpiresAt,
    UserDto User
);

public record UserDto(
    Guid Id,
    Guid TenantId,
    string TenantName,
    string Name,
    string Email,
    string Role
);

public record RefreshRequest(string RefreshToken);
