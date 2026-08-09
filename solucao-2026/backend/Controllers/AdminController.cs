using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Solucao.Backend.Data;
using Solucao.Backend.Models.Dtos.Admin;
using Solucao.Backend.Services;

namespace Solucao.Backend.Controllers;

/// <summary>
/// Painel do dono da plataforma. A tabela tenants não tem RLS (control plane),
/// então as operações cross-tenant funcionam com a conexão normal; a criação
/// de usuário de outro tenant passa pela função SECURITY DEFINER.
/// </summary>
[ApiController]
[Authorize(Roles = "superadmin")]
[Route("api/admin")]
public class AdminController : ControllerBase
{
    // ~200 KB de imagem => ~270 KB em base64
    private const int MaxLogoBase64Length = 300_000;

    private static readonly string[] Segments =
        { "supermercado", "farmacia", "loja_roupas", "loja_pecas", "padaria", "conveniencia", "petshop", "papelaria", "outro" };

    private readonly AppDbContext _db;
    private readonly IJwtService _jwt;
    private readonly ITenantContext _tenant;
    private readonly IMemoryCache _cache;
    private readonly IAuditService _audit;
    private readonly ILogger<AdminController> _log;

    public AdminController(
        AppDbContext db, IJwtService jwt, ITenantContext tenant,
        IMemoryCache cache, IAuditService audit, ILogger<AdminController> log)
    {
        _db = db;
        _jwt = jwt;
        _tenant = tenant;
        _cache = cache;
        _audit = audit;
        _log = log;
    }

    private static AdminTenantDto ToDto(Models.Entities.Tenant t, string? groupName = null) => new(
        t.Id, t.Name, t.Cnpj, t.PlanType, t.Segment, t.IsActive,
        t.MaxPosTerminals, t.LogoBase64, t.SubscriptionExpiresAt, t.SubscriptionIsBonus,
        t.GroupId, groupName, t.CreatedAt);

    // ---- Redes de lojas (grupo econômico) ----

    [HttpGet("groups")]
    public async Task<ActionResult<List<TenantGroupDto>>> ListGroups(CancellationToken ct)
    {
        var groups = await _db.TenantGroups.AsNoTracking().OrderBy(g => g.Name).ToListAsync(ct);
        var counts = await _db.Tenants.AsNoTracking()
            .Where(t => t.GroupId != null)
            .GroupBy(t => t.GroupId!.Value)
            .Select(g => new { GroupId = g.Key, Count = g.Count() })
            .ToListAsync(ct);

        return Ok(groups.Select(g => new TenantGroupDto(
            g.Id, g.Name, counts.FirstOrDefault(c => c.GroupId == g.Id)?.Count ?? 0)).ToList());
    }

    [HttpPost("groups")]
    public async Task<ActionResult<TenantGroupDto>> CreateGroup([FromBody] CreateGroupRequest req, CancellationToken ct)
    {
        var name = req.Name?.Trim();
        if (string.IsNullOrWhiteSpace(name) || name.Length < 2)
            return BadRequest(new { error = "Informe o nome da rede (mínimo 2 caracteres)." });

        var group = new Models.Entities.TenantGroup { Id = Guid.NewGuid(), Name = name, CreatedAt = DateTime.UtcNow };
        _db.TenantGroups.Add(group);
        await _db.SaveChangesAsync(ct);

        _log.LogInformation("Rede criada: {Name} ({Id})", group.Name, group.Id);
        return Ok(new TenantGroupDto(group.Id, group.Name, 0));
    }

    /// <summary>Valida que a rede informada existe antes de vincular a loja.</summary>
    private async Task<bool> GroupExistsAsync(Guid? groupId, CancellationToken ct) =>
        groupId is null || await _db.TenantGroups.AnyAsync(g => g.Id == groupId, ct);

    /// <summary>
    /// Registra no histórico financeiro um período concedido como cortesia.
    /// Fica como linha de valor zero em billing_charges — o financeiro
    /// distingue bonificação de assinatura paga sem precisar de outra tabela.
    /// </summary>
    private void RecordBonus(Models.Entities.Tenant t, DateOnly? previousExpiry, DateOnly newExpiry, string? notes)
    {
        var today = Services.Billing.SubscriptionCycle.Today();
        _db.BillingCharges.Add(new Models.Entities.BillingCharge
        {
            Id = Guid.NewGuid(),
            TenantId = t.Id,
            ChargeType = "bonus",
            PlanType = t.PlanType,
            Months = 0,
            Amount = 0m,
            Provider = "bonus",
            Status = "paid",
            PeriodStart = previousExpiry is { } p && p > today ? p : today,
            AppliedNewExpiry = newExpiry,
            Notes = string.IsNullOrWhiteSpace(notes) ? "Bonificação concedida pelo administrador" : notes.Trim(),
            PaidAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
        });

        _log.LogInformation("BONIFICAÇÃO: tenant {Name} ({Id}) com cortesia até {Expiry}", t.Name, t.Id, newExpiry);
    }

    [HttpGet("tenants")]
    public async Task<ActionResult<List<AdminTenantDto>>> ListTenants(CancellationToken ct)
    {
        var tenants = await _db.Tenants.AsNoTracking()
            .Where(t => t.Id != Guid.Parse("00000000-0000-0000-0000-000000000001"))
            .OrderBy(t => t.Name)
            .ToListAsync(ct);

        var groups = await _db.TenantGroups.AsNoTracking().ToDictionaryAsync(g => g.Id, g => g.Name, ct);

        return Ok(tenants
            .Select(t => ToDto(t, t.GroupId is { } gid && groups.TryGetValue(gid, out var n) ? n : null))
            .ToList());
    }

    /// <summary>Histórico financeiro do cliente: cobranças pagas e bonificações.</summary>
    [HttpGet("tenants/{id:guid}/charges")]
    public async Task<ActionResult<List<TenantChargeDto>>> ListCharges(Guid id, CancellationToken ct)
    {
        var charges = await _db.BillingCharges.AsNoTracking()
            .Where(c => c.TenantId == id)
            .OrderByDescending(c => c.CreatedAt)
            .Take(100)
            .ToListAsync(ct);

        return Ok(charges.Select(c => new TenantChargeDto(
            c.Id, c.ChargeType, c.PlanType, c.Months, c.Amount, c.ProRataDays, c.ProRataAmount,
            c.Status, c.Provider, c.PeriodStart, c.AppliedNewExpiry, c.Notes, c.CreatedAt, c.PaidAt)).ToList());
    }

    [HttpPost("tenants")]
    public async Task<ActionResult<AdminTenantDto>> CreateTenant([FromBody] CreateTenantRequest req, CancellationToken ct)
    {
        var cnpjDigits = new string(req.Cnpj.Where(char.IsDigit).ToArray());
        if (cnpjDigits.Length != 14)
            return BadRequest(new { error = "CNPJ inválido: informe os 14 dígitos." });
        if (!Segments.Contains(req.Segment))
            return BadRequest(new { error = $"Segmento inválido. Opções: {string.Join(", ", Segments)}" });
        if (req.LogoBase64 is { Length: > MaxLogoBase64Length })
            return BadRequest(new { error = "Logo muito grande — use uma imagem de até ~200 KB." });
        if (!await GroupExistsAsync(req.GroupId, ct))
            return BadRequest(new { error = "Rede informada não existe." });

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
            return Conflict(new { error = "Já existe um cliente cadastrado com esse CNPJ." });
        }
        catch (Npgsql.PostgresException pe) when (pe.MessageText.Contains("email_taken"))
        {
            return Conflict(new { error = "Esse e-mail já está em uso." });
        }

        var tenantId = created.Single().TenantId;

        // Campos extras do cadastro admin (tenants não tem RLS)
        var t = await _db.Tenants.FirstAsync(x => x.Id == tenantId, ct);
        t.Segment = req.Segment;
        t.LogoBase64 = req.LogoBase64;
        t.MaxPosTerminals = req.MaxPosTerminals;
        t.SubscriptionExpiresAt = req.SubscriptionExpiresAt;
        t.SubscriptionIsBonus = req.SubscriptionIsBonus && req.SubscriptionExpiresAt is not null;
        t.GroupId = req.GroupId;

        if (t.SubscriptionIsBonus)
            RecordBonus(t, null, req.SubscriptionExpiresAt!.Value, "Bonificação no cadastro do cliente");

        await _db.SaveChangesAsync(ct);

        _log.LogInformation("Admin criou tenant {Name} ({Id}), segmento {Segment}, {MaxPos} PDV(s)",
            t.Name, t.Id, t.Segment, t.MaxPosTerminals);

        return Ok(ToDto(t));
    }

    [HttpPut("tenants/{id:guid}")]
    public async Task<ActionResult<AdminTenantDto>> UpdateTenant(Guid id, [FromBody] UpdateTenantRequest req, CancellationToken ct)
    {
        if (!Segments.Contains(req.Segment))
            return BadRequest(new { error = $"Segmento inválido. Opções: {string.Join(", ", Segments)}" });
        if (req.LogoBase64 is { Length: > MaxLogoBase64Length })
            return BadRequest(new { error = "Logo muito grande — use uma imagem de até ~200 KB." });
        if (!await GroupExistsAsync(req.GroupId, ct))
            return BadRequest(new { error = "Rede informada não existe." });

        var t = await _db.Tenants.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (t is null) return NotFound();

        var previousExpiry = t.SubscriptionExpiresAt;
        var wasBonus = t.SubscriptionIsBonus;

        t.Name = req.Name.Trim();
        t.Segment = req.Segment;
        t.LogoBase64 = req.LogoBase64;
        t.MaxPosTerminals = req.MaxPosTerminals;
        t.SubscriptionExpiresAt = req.SubscriptionExpiresAt;
        t.SubscriptionIsBonus = req.SubscriptionIsBonus && req.SubscriptionExpiresAt is not null;
        t.GroupId = req.GroupId;
        t.IsActive = req.IsActive;
        t.PlanType = req.PlanType;

        // Só registra quando a cortesia é nova ou o período mudou — salvar o
        // cadastro sem mexer na assinatura não deve poluir o histórico.
        if (t.SubscriptionIsBonus && (!wasBonus || previousExpiry != req.SubscriptionExpiresAt))
            RecordBonus(t, previousExpiry, req.SubscriptionExpiresAt!.Value, "Bonificação definida na edição do cliente");

        await _db.SaveChangesAsync(ct);

        return Ok(ToDto(t));
    }

    /// <summary>
    /// Exclusão definitiva de um cliente e de TODOS os seus dados (cascade em
    /// todas as tabelas). Duas travas: o cliente precisa estar bloqueado
    /// (IsActive = false) e o nome exato deve vir em ?confirm= — a UI pede
    /// para digitá-lo.
    /// </summary>
    [HttpDelete("tenants/{id:guid}")]
    public async Task<IActionResult> DeleteTenant(Guid id, [FromQuery] string? confirm, CancellationToken ct)
    {
        if (id == Guid.Parse("00000000-0000-0000-0000-000000000001"))
            return BadRequest(new { error = "O tenant da plataforma não pode ser excluído." });

        var t = await _db.Tenants.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (t is null) return NotFound();

        if (t.IsActive)
            return BadRequest(new { error = "Bloqueie o cliente antes de excluir (Editar → desmarcar \"Cliente ativo\")." });
        if (!string.Equals(confirm?.Trim(), t.Name, StringComparison.Ordinal))
            return BadRequest(new { error = "Confirmação incorreta: digite o nome exato do cliente." });

        // Auditoria antes do cascade: depois da remoção o vínculo não existe mais
        _audit.Log("admin.tenant_delete", "tenant", t.Id, new { tenantName = t.Name, cnpj = t.Cnpj });
        await _db.SaveChangesAsync(ct);

        _db.Tenants.Remove(t);
        await _db.SaveChangesAsync(ct);

        _log.LogWarning("TENANT EXCLUÍDO: {Name} ({Id}), CNPJ {Cnpj} — todos os dados removidos em cascata",
            t.Name, t.Id, t.Cnpj);
        return NoContent();
    }

    /// <summary>
    /// Renovação manual (pagamento fora do PIX ou cortesia). Com IsBonus a
    /// concessão entra no histórico como bonificação de valor zero.
    /// </summary>
    [HttpPost("tenants/{id:guid}/renew")]
    public async Task<ActionResult<AdminTenantDto>> RenewSubscription(
        Guid id, [FromBody] RenewSubscriptionRequest req, CancellationToken ct)
    {
        if (req.ExpiresAt < Services.Billing.SubscriptionCycle.Today())
            return BadRequest(new { error = "A nova data de expiração não pode estar no passado." });

        var t = await _db.Tenants.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (t is null) return NotFound();

        var previous = t.SubscriptionExpiresAt;
        t.SubscriptionExpiresAt = req.ExpiresAt;
        t.SubscriptionIsBonus = req.IsBonus;

        if (req.IsBonus)
            RecordBonus(t, previous, req.ExpiresAt, req.Notes);

        await _db.SaveChangesAsync(ct);
        _cache.Remove($"sub-exp:{t.Id}"); // reflete na hora no gate de bloqueio

        _log.LogInformation("Assinatura {Tipo}: {Tenant} de {De} para {Ate}",
            req.IsBonus ? "bonificada" : "renovada", t.Name, previous?.ToString() ?? "—", req.ExpiresAt);

        return Ok(ToDto(t));
    }

    /// <summary>
    /// Acesso de suporte: emite um token temporário com o tenant_id do cliente
    /// e papel admin. Sem senha envolvida e sem refresh token — expira sozinho.
    /// O RLS passa a enxergar o tenant do cliente pelo claim, como num login normal.
    /// </summary>
    [HttpPost("tenants/{id:guid}/impersonate")]
    public async Task<ActionResult<ImpersonationResponse>> Impersonate(Guid id, CancellationToken ct)
    {
        var t = await _db.Tenants.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (t is null) return NotFound();
        if (!t.IsActive) return BadRequest(new { error = "Cliente bloqueado — reative antes de acessar." });

        var superadminId = _tenant.UserId ?? Guid.Empty;

        var (token, expiresAt) = _jwt.GenerateAccessToken(
            new Models.Entities.User
            {
                Id = superadminId,
                TenantId = t.Id,
                Name = "Suporte SOLUÇÃO",
                Email = "suporte@plataforma.interno",
                Role = "admin",
                PasswordHash = ""
            },
            t.Name,
            impersonated: true);   // isenta o suporte do bloqueio por assinatura

        // Acesso do suporte aos dados de um cliente: registro obrigatório
        _audit.Log("admin.impersonate", "tenant", t.Id, new { tenantName = t.Name });
        await _db.SaveChangesAsync(ct);

        _log.LogWarning("IMPERSONATION: superadmin {UserId} acessou o tenant {TenantName} ({TenantId})",
            superadminId, t.Name, t.Id);

        return Ok(new ImpersonationResponse(
            token, expiresAt,
            new Models.Dtos.Auth.UserDto(superadminId, t.Id, t.Name, "Suporte SOLUÇÃO", "suporte@plataforma.interno", "admin")));
    }

    /// <summary>
    /// Usuários do cliente, para o suporte escolher quem terá a senha
    /// redefinida. Passa por função SECURITY DEFINER porque users tem RLS e o
    /// superadmin opera do tenant plataforma.
    /// </summary>
    [HttpGet("tenants/{id:guid}/users")]
    public async Task<ActionResult<List<AdminTenantUserDto>>> ListTenantUsers(Guid id, CancellationToken ct)
    {
        if (!await _db.Tenants.AnyAsync(t => t.Id == id, ct)) return NotFound();

        var rows = await _db.Database
            .SqlQuery<AdminTenantUserRow>($@"
                SELECT user_id    AS ""UserId"",
                       name       AS ""Name"",
                       email::text AS ""Email"",
                       role       AS ""Role"",
                       is_active  AS ""IsActive"",
                       last_login AS ""LastLogin""
                FROM app_admin_list_tenant_users({id})")
            .ToListAsync(ct);

        return Ok(rows
            .Select(r => new AdminTenantUserDto(r.UserId, r.Name, r.Email, r.Role, r.IsActive, r.LastLogin))
            .ToList());
    }

    /// <summary>
    /// Redefine a senha de um usuário do cliente, sem pedir a senha atual —
    /// quem redefine não a conhece, e é exatamente para isso que existe:
    /// o cliente perdeu o acesso e liga para o suporte.
    ///
    /// O que autoriza é o papel superadmin (no atributo da classe). O ato fica
    /// no audit_log com quem fez e sobre quem, porque poder redefinir senha de
    /// terceiro sem rastro é o tipo de coisa que não se explica depois.
    /// </summary>
    [HttpPost("tenants/{id:guid}/reset-password")]
    public async Task<IActionResult> ResetTenantUserPassword(
        Guid id, [FromBody] AdminResetPasswordRequest req, CancellationToken ct)
    {
        var t = await _db.Tenants.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (t is null) return NotFound();

        var hash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);

        // A função confere o par (usuário, cliente): id trocado por engano não
        // atinge usuário de outra loja. NULL = par inexistente.
        var affected = await _db.Database
            .SqlQuery<string?>($"SELECT app_admin_reset_user_password({req.UserId}, {id}, {hash}) AS \"Value\"")
            .ToListAsync(ct);

        var email = affected.FirstOrDefault();
        if (string.IsNullOrEmpty(email))
            return NotFound(new { error = "Usuário não encontrado neste cliente." });

        _audit.Log("admin.reset_client_password", "user", req.UserId,
            new { tenantId = id, tenantName = t.Name, email });
        await _db.SaveChangesAsync(ct);

        _log.LogWarning("Superadmin {Actor} redefiniu a senha de {Email} no tenant {TenantName} ({TenantId})",
            _tenant.UserId, email, t.Name, t.Id);

        return Ok(new { email });
    }

    private sealed record AdminTenantUserRow(
        Guid UserId, string Name, string Email, string Role, bool IsActive, DateTime? LastLogin);

    [HttpGet("platform-logo")]
    public async Task<ActionResult<PlatformLogoDto>> GetPlatformLogo(CancellationToken ct)
    {
        var s = await _db.PlatformSettings.AsNoTracking().FirstOrDefaultAsync(x => x.Id == 1, ct);
        return Ok(new PlatformLogoDto(s?.LogoBase64));
    }

    [HttpPut("platform-logo")]
    public async Task<ActionResult<PlatformLogoDto>> SetPlatformLogo([FromBody] PlatformLogoDto req, CancellationToken ct)
    {
        if (req.LogoBase64 is { Length: > MaxLogoBase64Length })
            return BadRequest(new { error = "Logo muito grande — use uma imagem de até ~200 KB." });

        var s = await _db.PlatformSettings.FirstOrDefaultAsync(x => x.Id == 1, ct);
        if (s is null)
        {
            s = new Models.Entities.PlatformSettings { Id = 1 };
            _db.PlatformSettings.Add(s);
        }
        s.LogoBase64 = req.LogoBase64;
        s.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        return Ok(new PlatformLogoDto(s.LogoBase64));
    }

    private sealed record RegisterResult
    {
        public Guid TenantId { get; init; }
        public Guid UserId { get; init; }
    }
}
