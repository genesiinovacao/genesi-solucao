using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Solucao.Backend.Data;
using Solucao.Backend.Models.Dtos.Users;
using Solucao.Backend.Models.Entities;
using Solucao.Backend.Services;

namespace Solucao.Backend.Controllers;

/// <summary>
/// Equipe do tenant: o admin da loja cria caixas/gerentes, redefine senhas e
/// ativa/desativa contas. O RLS restringe tudo ao tenant do token — inclusive
/// quando quem opera é o superadmin via impersonação (token com role admin).
/// </summary>
[ApiController]
[Authorize]
[Route("api/users")]
public class UsersController : ControllerBase
{
    private static readonly string[] Roles = { "admin", "manager", "cashier" };

    private readonly AppDbContext _db;
    private readonly ITenantContext _tenant;
    private readonly ILogger<UsersController> _log;

    public UsersController(AppDbContext db, ITenantContext tenant, ILogger<UsersController> log)
    {
        _db = db;
        _tenant = tenant;
        _log = log;
    }

    private static TeamUserDto ToDto(User u) =>
        new(u.Id, u.Name, u.Email, u.Role, u.IsActive, u.LastLoginAt, u.CreatedAt);

    [HttpGet]
    public async Task<ActionResult<List<TeamUserDto>>> List(CancellationToken ct)
    {
        if (_tenant.Role != "admin") return Forbid();

        var users = await _db.Users.AsNoTracking()
            .OrderBy(u => u.CreatedAt)
            .ToListAsync(ct);

        return Ok(users.Select(ToDto).ToList());
    }

    [HttpPost]
    public async Task<ActionResult<TeamUserDto>> Create([FromBody] CreateUserRequest req, CancellationToken ct)
    {
        if (_tenant.Role != "admin") return Forbid();
        if (_tenant.TenantId is not { } tenantId) return Unauthorized();
        if (!Roles.Contains(req.Role))
            return BadRequest(new { error = $"Papel inválido. Opções: {string.Join(", ", Roles)}" });

        var email = req.Email.Trim();

        // E-mail precisa ser único na plataforma inteira (o login é só por
        // e-mail, sem informar a loja). A checagem dentro do tenant o RLS
        // resolve; a global passa pela função SECURITY DEFINER do login.
        var clash = await _db.Database
            .SqlQuery<EmailLookup>($@"
                SELECT user_id AS ""UserId"" FROM app_find_user_for_login({email})")
            .ToListAsync(ct);
        if (clash.Count > 0)
            return Conflict(new { error = "Esse e-mail já está em uso." });

        var user = new User
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Name = req.Name.Trim(),
            Email = email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
            Role = req.Role,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync(ct);

        _log.LogInformation("Usuário {Email} ({Role}) criado no tenant {TenantId}", user.Email, user.Role, tenantId);
        return Ok(ToDto(user));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<TeamUserDto>> Update(Guid id, [FromBody] UpdateUserRequest req, CancellationToken ct)
    {
        if (_tenant.Role != "admin") return Forbid();
        if (!Roles.Contains(req.Role))
            return BadRequest(new { error = $"Papel inválido. Opções: {string.Join(", ", Roles)}" });

        var u = await _db.Users.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (u is null || u.Role == "superadmin") return NotFound();

        if (id == _tenant.UserId && (!req.IsActive || req.Role != "admin"))
            return BadRequest(new { error = "Você não pode desativar ou rebaixar a sua própria conta." });

        // A loja não pode ficar sem nenhum admin ativo (ninguém conseguiria
        // gerenciar a equipe depois).
        if (u.Role == "admin" && (req.Role != "admin" || !req.IsActive))
        {
            var otherAdmin = await _db.Users
                .AnyAsync(x => x.Id != id && x.Role == "admin" && x.IsActive, ct);
            if (!otherAdmin)
                return BadRequest(new { error = "Este é o único admin ativo da loja — promova outro usuário antes." });
        }

        var deactivated = u.IsActive && !req.IsActive;
        u.Name = req.Name.Trim();
        u.Role = req.Role;
        u.IsActive = req.IsActive;
        u.UpdatedAt = DateTime.UtcNow;

        if (deactivated)
        {
            var tokens = await _db.RefreshTokens
                .Where(t => t.UserId == id && t.RevokedAt == null).ToListAsync(ct);
            tokens.ForEach(t => t.RevokedAt = DateTime.UtcNow);
            _log.LogInformation("Usuário {Email} desativado; {N} sessão(ões) revogada(s)", u.Email, tokens.Count);
        }

        await _db.SaveChangesAsync(ct);
        return Ok(ToDto(u));
    }

    [HttpPost("{id:guid}/reset-password")]
    public async Task<ActionResult<TeamUserDto>> ResetPassword(
        Guid id, [FromBody] ResetPasswordRequest req, CancellationToken ct)
    {
        if (_tenant.Role != "admin") return Forbid();

        var u = await _db.Users.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (u is null || u.Role == "superadmin") return NotFound();

        u.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
        u.UpdatedAt = DateTime.UtcNow;

        // Sessões antigas caem junto: quem tinha o refresh token não continua
        // logado com a senha anterior.
        var tokens = await _db.RefreshTokens
            .Where(t => t.UserId == id && t.RevokedAt == null).ToListAsync(ct);
        tokens.ForEach(t => t.RevokedAt = DateTime.UtcNow);

        await _db.SaveChangesAsync(ct);
        _log.LogInformation("Senha redefinida para {Email}; {N} sessão(ões) revogada(s)", u.Email, tokens.Count);
        return Ok(ToDto(u));
    }

    private sealed record EmailLookup
    {
        public Guid UserId { get; init; }
    }
}
