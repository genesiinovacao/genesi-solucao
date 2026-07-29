using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
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
    private readonly IAuditService _audit;
    private readonly ILogger<AuthController> _log;

    public AuthController(
        AppDbContext db, IJwtService jwt, IConfiguration config,
        IAuditService audit, ILogger<AuthController> log)
    {
        _db = db;
        _jwt = jwt;
        _config = config;
        _audit = audit;
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

            // Registro de acesso (LGPD art. 37). Vai por SQL dentro desta
            // transação porque no login o ITenantContext ainda está vazio —
            // é o set_config acima que satisfaz a policy de RLS do audit_log.
            var ip = RemoteIp();
            await _db.Database.ExecuteSqlInterpolatedAsync($@"
                INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata, ip_address)
                VALUES ({user.TenantId}, {user.UserId}, 'auth.login', 'user', {user.UserId},
                        {$"{{\"role\":\"{user.Role}\"}}"}::jsonb, {ip}::inet)", ct);

            await tx.CommitAsync(ct);
        }

        await _db.Database.ExecuteSqlInterpolatedAsync($"SELECT app_touch_last_login({user.UserId})", ct);

        return Ok(new LoginResponse(
            access,
            refreshRaw,
            expiresAt,
            new UserDto(user.UserId, user.TenantId, user.TenantName, user.Name, user.Email, user.Role)));
    }

    // O cadastro de tenant é exclusivo do painel administrativo:
    // POST /api/admin/tenants (role superadmin). Não há signup público.

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

    // =======================================================================
    // Rede de lojas — o funcionário alterna entre as filiais do mesmo grupo
    // =======================================================================

    public record StoreDto(Guid Id, string Name, string Cnpj, bool IsActive, bool IsCurrent);
    public record SwitchStoreRequest(Guid TenantId);

    /// <summary>
    /// Lojas do grupo da loja atual. Lista vazia (ou uma só) significa que o
    /// cliente não faz parte de uma rede — o front nem mostra o seletor.
    /// </summary>
    [HttpGet("stores")]
    [Authorize]
    public async Task<ActionResult<List<StoreDto>>> Stores(CancellationToken ct)
    {
        var tenantIdClaim = User.FindFirstValue(JwtService.TenantIdClaim);
        if (!Guid.TryParse(tenantIdClaim, out var currentTenantId)) return Unauthorized();

        var current = await _db.Tenants.AsNoTracking()
            .FirstOrDefaultAsync(t => t.Id == currentTenantId, ct);
        if (current is null) return NotFound();

        // Sem grupo: a própria loja é a única
        if (current.GroupId is null)
            return Ok(new List<StoreDto> { new(current.Id, current.Name, current.Cnpj, current.IsActive, true) });

        var stores = await _db.Tenants.AsNoTracking()
            .Where(t => t.GroupId == current.GroupId)
            .OrderBy(t => t.Name)
            .ToListAsync(ct);

        return Ok(stores
            .Select(t => new StoreDto(t.Id, t.Name, t.Cnpj, t.IsActive, t.Id == currentTenantId))
            .ToList());
    }

    /// <summary>
    /// Emite um token para outra loja da mesma rede. O usuário continua sendo
    /// o mesmo; muda o tenant_id — e com ele todo o escopo do RLS.
    /// </summary>
    [HttpPost("switch-store")]
    [Authorize]
    public async Task<ActionResult<LoginResponse>> SwitchStore(
        [FromBody] SwitchStoreRequest req, CancellationToken ct)
    {
        var tenantIdClaim = User.FindFirstValue(JwtService.TenantIdClaim);
        var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(tenantIdClaim, out var currentTenantId) ||
            !Guid.TryParse(userIdClaim, out var userId)) return Unauthorized();

        var current = await _db.Tenants.AsNoTracking().FirstOrDefaultAsync(t => t.Id == currentTenantId, ct);
        var target = await _db.Tenants.AsNoTracking().FirstOrDefaultAsync(t => t.Id == req.TenantId, ct);
        if (current is null || target is null) return NotFound();

        // A trava do modelo: só troca dentro da mesma rede, e rede precisa existir
        if (current.GroupId is null || target.GroupId != current.GroupId)
            return Forbid();
        if (!target.IsActive)
            return BadRequest(new { error = $"A loja {target.Name} está bloqueada." });

        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null || !user.IsActive) return Unauthorized();

        var (access, expiresAt) = _jwt.GenerateAccessToken(
            new User
            {
                Id = user.Id,
                TenantId = target.Id,          // passa a operar na filial escolhida
                Name = user.Name,
                Email = user.Email,
                Role = user.Role,
                PasswordHash = ""
            },
            target.Name);

        _log.LogInformation("Troca de loja: usuário {UserId} de {De} para {Para}",
            userId, current.Name, target.Name);

        // Sem refresh token: a sessão da filial expira sozinha, como no suporte
        return Ok(new LoginResponse(
            access, "", expiresAt,
            new UserDto(user.Id, target.Id, target.Name, user.Name, user.Email, user.Role)));
    }

    // =======================================================================
    // Operação de caixa — troca de turno e autorização de supervisor
    // =======================================================================

    public record OperatorLoginRequest(string OperatorCode, string Pin);
    public record AuthorizeRequest(string OperatorCode, string Pin, string Action, decimal? Value);
    public record AuthorizationDto(bool Authorized, string SupervisorName, string Role);

    /// <summary>
    /// Troca o operador do caixa sem sair do aplicativo. Exige uma sessão
    /// já autenticada (o PDV entrou com e-mail e senha ao ser instalado):
    /// é ela que define a loja onde o código do operador é procurado.
    /// </summary>
    [HttpPost("switch-operator")]
    [Authorize]
    public async Task<ActionResult<LoginResponse>> SwitchOperator(
        [FromBody] OperatorLoginRequest req, CancellationToken ct)
    {
        var tenantIdClaim = User.FindFirstValue(JwtService.TenantIdClaim);
        if (!Guid.TryParse(tenantIdClaim, out var tenantId)) return Unauthorized();

        var target = await FindOperatorAsync(req.OperatorCode, req.Pin, ct);
        if (target is null)
        {
            _log.LogInformation("Troca de operador recusada para o código {Code}", req.OperatorCode);
            return Unauthorized(new { error = "Código ou PIN inválido." });
        }

        var tenantName = await _db.Tenants.AsNoTracking()
            .Where(t => t.Id == tenantId).Select(t => t.Name).FirstOrDefaultAsync(ct) ?? "";

        var (access, expiresAt) = _jwt.GenerateAccessToken(target, tenantName);

        // Marca o acesso do turno (via EF: o RLS já restringe à loja da sessão)
        target.LastLoginAt = DateTime.UtcNow;
        _audit.Log("pos.operator_switch", "user", target.Id, new { code = target.OperatorCode });
        await _db.SaveChangesAsync(ct);

        _log.LogInformation("Operador do caixa trocado para {Name} ({Code})", target.Name, target.OperatorCode);

        // Sem refresh: a sessão do turno expira sozinha
        return Ok(new LoginResponse(
            access, "", expiresAt,
            new UserDto(target.Id, tenantId, tenantName, target.Name, target.Email, target.Role)));
    }

    /// <summary>
    /// Autoriza uma operação sensível (desconto acima do limite, por exemplo)
    /// sem trocar quem está no caixa. Só admin ou gerente autorizam.
    /// </summary>
    [HttpPost("authorize")]
    [Authorize]
    public async Task<ActionResult<AuthorizationDto>> AuthorizeAction(
        [FromBody] AuthorizeRequest req, CancellationToken ct)
    {
        var supervisor = await FindOperatorAsync(req.OperatorCode, req.Pin, ct);
        if (supervisor is null)
            return Unauthorized(new { error = "Código ou PIN inválido." });
        if (supervisor.Role is not ("admin" or "manager"))
            return StatusCode(403, new { error = $"{supervisor.Name} não tem permissão para autorizar." });

        // Fica no log: quem autorizou o quê, e de qual caixa
        _audit.Log("pos.authorize", "user", supervisor.Id,
            new { action = req.Action, value = req.Value, byOperator = User.FindFirstValue(ClaimTypes.NameIdentifier) });
        await _db.SaveChangesAsync(ct);

        _log.LogInformation("Autorização de {Supervisor} para {Action} (valor {Value})",
            supervisor.Name, req.Action, req.Value);

        return Ok(new AuthorizationDto(true, supervisor.Name, supervisor.Role));
    }

    /// <summary>Operador ativo da loja atual com código e PIN conferidos.</summary>
    private async Task<User?> FindOperatorAsync(string? code, string? pin, CancellationToken ct)
    {
        var normalized = code?.Trim().ToUpperInvariant();
        if (string.IsNullOrWhiteSpace(normalized) || string.IsNullOrWhiteSpace(pin)) return null;

        // RLS já limita à loja da sessão. Sem AsNoTracking: o SwitchOperator
        // grava o último acesso na mesma instância.
        var user = await _db.Users
            .FirstOrDefaultAsync(u => u.OperatorCode == normalized && u.IsActive, ct);

        if (user?.PinHash is null) return null;
        return BCrypt.Net.BCrypt.Verify(pin, user.PinHash) ? user : null;
    }

    /// <summary>IP de origem — atrás do proxy vem no X-Forwarded-For.</summary>
    private string? RemoteIp()
    {
        var forwarded = Request.Headers["X-Forwarded-For"].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(forwarded))
        {
            var first = forwarded.Split(',')[0].Trim();
            if (System.Net.IPAddress.TryParse(first, out var parsed)) return parsed.ToString();
        }
        return HttpContext.Connection.RemoteIpAddress?.ToString();
    }

    // Internal projection records (must have parameterless ctor or matching property names)
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
