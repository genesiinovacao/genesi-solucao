using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Solucao.Backend.Data;
using Solucao.Backend.Models.Dtos.Auth;
using Solucao.Backend.Models.Entities;
using Solucao.Backend.Services;

namespace Solucao.Backend.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IJwtService _jwt;
    private readonly IConfiguration _config;
    private readonly ILogger<AuthController> _log;

    public AuthController(AppDbContext db, IJwtService jwt, IConfiguration config, ILogger<AuthController> log)
    {
        _db = db;
        _jwt = jwt;
        _config = config;
        _log = log;
    }

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<ActionResult<LoginResponse>> Login([FromBody] LoginRequest req, CancellationToken ct)
    {
        // Step 1 — cross-tenant lookup via SECURITY DEFINER function (bypasses RLS)
        var lookup = await _db.Database
            .SqlQuery<UserLoginLookup>($@"
                SELECT user_id        AS ""UserId"",
                       tenant_id      AS ""TenantId"",
                       tenant_name    AS ""TenantName"",
                       tenant_active  AS ""TenantActive"",
                       name           AS ""Name"",
                       email::text    AS ""Email"",
                       password_hash  AS ""PasswordHash"",
                       role           AS ""Role"",
                       is_active      AS ""IsActive""
                FROM app_find_user_for_login({req.Email})")
            .ToListAsync(ct);

        var user = lookup.FirstOrDefault();
        if (user is null || !user.IsActive || !user.TenantActive)
        {
            _log.LogInformation("Login failed (user not found / inactive) for {Email}", req.Email);
            return Unauthorized(new { error = "Credenciais inválidas." });
        }

        if (!BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
        {
            _log.LogInformation("Login failed (wrong password) for {Email}", req.Email);
            return Unauthorized(new { error = "Credenciais inválidas." });
        }

        // Step 2 — issue tokens
        var (access, expiresAt) = _jwt.GenerateAccessToken(
            new User
            {
                Id = user.UserId,
                TenantId = user.TenantId,
                Name = user.Name,
                Email = user.Email,
                Role = user.Role,
                PasswordHash = ""
            },
            user.TenantName);

        var refreshRaw = _jwt.GenerateRefreshTokenRaw();
        var refreshDays = _config.GetValue("Jwt:RefreshTokenDays", 14);

        // Wrap in a transaction so SET and INSERT share the same physical connection.
        // Without the transaction, Npgsql's pool may hand out a different connection
        // for the second command, losing the tenant context and tripping the RLS policy.
        await using (var tx = await _db.Database.BeginTransactionAsync(ct))
        {
            await _db.Database.ExecuteSqlInterpolatedAsync(
                $"SELECT set_config('app.current_tenant_id', {user.TenantId.ToString()}, true)", ct);

            await _db.Database.ExecuteSqlInterpolatedAsync($@"
                INSERT INTO refresh_tokens (user_id, tenant_id, token_hash, expires_at)
                VALUES ({user.UserId}, {user.TenantId}, {_jwt.HashRefreshToken(refreshRaw)}, {DateTime.UtcNow.AddDays(refreshDays)})", ct);

            await tx.CommitAsync(ct);
        }

        await _db.Database.ExecuteSqlInterpolatedAsync($"SELECT app_touch_last_login({user.UserId})", ct);

        return Ok(new LoginResponse(
            access,
            refreshRaw,
            expiresAt,
            new UserDto(user.UserId, user.TenantId, user.TenantName, user.Name, user.Email, user.Role)));
    }

    /// <summary>
    /// Cadastro self-service: cria o mercado (tenant) + usuário admin e já
    /// devolve os tokens (auto-login). A criação acontece na função
    /// SECURITY DEFINER app_register_tenant, pois não há contexto de tenant
    /// para o RLS antes do tenant existir.
    /// </summary>
    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<ActionResult<LoginResponse>> Register([FromBody] RegisterRequest req, CancellationToken ct)
    {
        var cnpjDigits = new string(req.Cnpj.Where(char.IsDigit).ToArray());
        if (cnpjDigits.Length != 14)
            return BadRequest(new { error = "CNPJ inválido: informe os 14 dígitos." });

        var passwordHash = BCrypt.Net.BCrypt.HashPassword(req.Password);

        List<RegisterResult> created;
        try
        {
            created = await _db.Database
                .SqlQuery<RegisterResult>($@"
                    SELECT tenant_id AS ""TenantId"", user_id AS ""UserId""
                    FROM app_register_tenant(
                        {req.TenantName.Trim()}, {cnpjDigits},
                        {req.UserName.Trim()}, {req.Email.Trim()}, {passwordHash})")
                .ToListAsync(ct);
        }
        catch (Npgsql.PostgresException pe) when (pe.MessageText.Contains("cnpj_taken"))
        {
            return Conflict(new { error = "Já existe um mercado cadastrado com esse CNPJ." });
        }
        catch (Npgsql.PostgresException pe) when (pe.MessageText.Contains("email_taken"))
        {
            return Conflict(new { error = "Esse e-mail já está em uso." });
        }

        var result = created.Single();
        _log.LogInformation("Novo tenant cadastrado: {TenantName} ({TenantId})", req.TenantName, result.TenantId);

        // Auto-login: mesmo fluxo de emissão de tokens do /login
        var (access, expiresAt) = _jwt.GenerateAccessToken(
            new User
            {
                Id = result.UserId,
                TenantId = result.TenantId,
                Name = req.UserName.Trim(),
                Email = req.Email.Trim(),
                Role = "admin",
                PasswordHash = ""
            },
            req.TenantName.Trim());

        var refreshRaw = _jwt.GenerateRefreshTokenRaw();
        var refreshDays = _config.GetValue("Jwt:RefreshTokenDays", 14);

        await using (var tx = await _db.Database.BeginTransactionAsync(ct))
        {
            await _db.Database.ExecuteSqlInterpolatedAsync(
                $"SELECT set_config('app.current_tenant_id', {result.TenantId.ToString()}, true)", ct);

            await _db.Database.ExecuteSqlInterpolatedAsync($@"
                INSERT INTO refresh_tokens (user_id, tenant_id, token_hash, expires_at)
                VALUES ({result.UserId}, {result.TenantId}, {_jwt.HashRefreshToken(refreshRaw)}, {DateTime.UtcNow.AddDays(refreshDays)})", ct);

            await tx.CommitAsync(ct);
        }

        return Ok(new LoginResponse(
            access,
            refreshRaw,
            expiresAt,
            new UserDto(result.UserId, result.TenantId, req.TenantName.Trim(), req.UserName.Trim(), req.Email.Trim(), "admin")));
    }

    [HttpPost("refresh")]
    [AllowAnonymous]
    public async Task<ActionResult<LoginResponse>> Refresh([FromBody] RefreshRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.RefreshToken))
            return Unauthorized(new { error = "Refresh token ausente." });

        var hash = _jwt.HashRefreshToken(req.RefreshToken);

        // Cross-tenant lookup via SECURITY DEFINER (bypasses RLS, narrow scope)
        var row = await _db.Database
            .SqlQuery<RefreshTokenLookup>($@"
                SELECT user_id       AS ""UserId"",
                       tenant_id     AS ""TenantId"",
                       expires_at    AS ""ExpiresAt"",
                       revoked_at    AS ""RevokedAt"",
                       user_name     AS ""Name"",
                       user_email::text AS ""Email"",
                       user_role     AS ""Role"",
                       user_active   AS ""IsActive"",
                       tenant_name   AS ""TenantName"",
                       tenant_active AS ""TenantActive""
                FROM app_find_refresh_token({hash})")
            .ToListAsync(ct);

        var token = row.FirstOrDefault();
        if (token is null || token.RevokedAt is not null || token.ExpiresAt < DateTime.UtcNow
            || !token.IsActive || !token.TenantActive)
            return Unauthorized(new { error = "Refresh token inválido ou expirado." });

        var (access, expiresAt) = _jwt.GenerateAccessToken(
            new User
            {
                Id = token.UserId,
                TenantId = token.TenantId,
                Name = token.Name,
                Email = token.Email,
                Role = token.Role,
                PasswordHash = ""
            },
            token.TenantName);

        var newRefresh = _jwt.GenerateRefreshTokenRaw();
        var days = _config.GetValue("Jwt:RefreshTokenDays", 14);

        // Rotate: revoke old + issue new, same connection via transaction
        await using (var tx = await _db.Database.BeginTransactionAsync(ct))
        {
            await _db.Database.ExecuteSqlInterpolatedAsync(
                $"SELECT set_config('app.current_tenant_id', {token.TenantId.ToString()}, true)", ct);

            await _db.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = {hash}", ct);

            await _db.Database.ExecuteSqlInterpolatedAsync($@"
                INSERT INTO refresh_tokens (user_id, tenant_id, token_hash, expires_at)
                VALUES ({token.UserId}, {token.TenantId}, {_jwt.HashRefreshToken(newRefresh)}, {DateTime.UtcNow.AddDays(days)})", ct);

            await tx.CommitAsync(ct);
        }

        return Ok(new LoginResponse(
            access,
            newRefresh,
            expiresAt,
            new UserDto(token.UserId, token.TenantId, token.TenantName, token.Name, token.Email, token.Role)));
    }

    [HttpGet("me")]
    [Authorize]
    public async Task<ActionResult<UserDto>> Me(CancellationToken ct)
    {
        // RLS will scope to the current tenant. The user must exist within it.
        var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
                       ?? User.FindFirst("sub")?.Value;
        if (!Guid.TryParse(userIdClaim, out var userId))
            return Unauthorized();

        var u = await _db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == userId, ct);
        if (u is null) return NotFound();

        var tenantName = await _db.Tenants.AsNoTracking()
            .Where(t => t.Id == u.TenantId)
            .Select(t => t.Name)
            .FirstOrDefaultAsync(ct) ?? "";

        return Ok(new UserDto(u.Id, u.TenantId, tenantName, u.Name, u.Email, u.Role));
    }

    // Internal projection records (must have parameterless ctor or matching property names)
    private sealed record RegisterResult
    {
        public Guid TenantId { get; init; }
        public Guid UserId { get; init; }
    }

    private sealed record UserLoginLookup
    {
        public Guid UserId { get; init; }
        public Guid TenantId { get; init; }
        public string TenantName { get; init; } = "";
        public bool TenantActive { get; init; }
        public string Name { get; init; } = "";
        public string Email { get; init; } = "";
        public string PasswordHash { get; init; } = "";
        public string Role { get; init; } = "";
        public bool IsActive { get; init; }
    }

    private sealed record RefreshTokenLookup
    {
        public Guid UserId { get; init; }
        public Guid TenantId { get; init; }
        public DateTime ExpiresAt { get; init; }
        public DateTime? RevokedAt { get; init; }
        public string Name { get; init; } = "";
        public string Email { get; init; } = "";
        public string Role { get; init; } = "";
        public bool IsActive { get; init; }
        public string TenantName { get; init; } = "";
        public bool TenantActive { get; init; }
    }
}
