using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
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
    private readonly ILogger<AdminController> _log;

    public AdminController(AppDbContext db, ILogger<AdminController> log)
    {
        _db = db;
        _log = log;
    }

    [HttpGet("tenants")]
    public async Task<ActionResult<List<AdminTenantDto>>> ListTenants(CancellationToken ct)
    {
        var tenants = await _db.Tenants.AsNoTracking()
            .Where(t => t.Id != Guid.Parse("00000000-0000-0000-0000-000000000001"))
            .OrderBy(t => t.Name)
            .ToListAsync(ct);

        return Ok(tenants.Select(t => new AdminTenantDto(
            t.Id, t.Name, t.Cnpj, t.PlanType, t.Segment, t.IsActive,
            t.MaxPosTerminals, t.LogoBase64, t.CreatedAt)).ToList());
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
        await _db.SaveChangesAsync(ct);

        _log.LogInformation("Admin criou tenant {Name} ({Id}), segmento {Segment}, {MaxPos} PDV(s)",
            t.Name, t.Id, t.Segment, t.MaxPosTerminals);

        return Ok(new AdminTenantDto(
            t.Id, t.Name, t.Cnpj, t.PlanType, t.Segment, t.IsActive,
            t.MaxPosTerminals, t.LogoBase64, t.CreatedAt));
    }

    [HttpPut("tenants/{id:guid}")]
    public async Task<ActionResult<AdminTenantDto>> UpdateTenant(Guid id, [FromBody] UpdateTenantRequest req, CancellationToken ct)
    {
        if (!Segments.Contains(req.Segment))
            return BadRequest(new { error = $"Segmento inválido. Opções: {string.Join(", ", Segments)}" });
        if (req.LogoBase64 is { Length: > MaxLogoBase64Length })
            return BadRequest(new { error = "Logo muito grande — use uma imagem de até ~200 KB." });

        var t = await _db.Tenants.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (t is null) return NotFound();

        t.Name = req.Name.Trim();
        t.Segment = req.Segment;
        t.LogoBase64 = req.LogoBase64;
        t.MaxPosTerminals = req.MaxPosTerminals;
        t.IsActive = req.IsActive;
        t.PlanType = req.PlanType;
        await _db.SaveChangesAsync(ct);

        return Ok(new AdminTenantDto(
            t.Id, t.Name, t.Cnpj, t.PlanType, t.Segment, t.IsActive,
            t.MaxPosTerminals, t.LogoBase64, t.CreatedAt));
    }

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
