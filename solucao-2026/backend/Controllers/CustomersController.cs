using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Solucao.Backend.Data;
using Solucao.Backend.Models.Dtos.Customers;
using Solucao.Backend.Models.Entities;
using Solucao.Backend.Services;

namespace Solucao.Backend.Controllers;

[ApiController]
[Authorize]
[Route("api/customers")]
public class CustomersController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ITenantContext _tenant;
    private readonly IAuditService _audit;

    public CustomersController(AppDbContext db, ITenantContext tenant, IAuditService audit)
    {
        _db = db;
        _tenant = tenant;
        _audit = audit;
    }

    private static string Tier(int points) =>
        points >= 1000 ? "gold" : points >= 500 ? "silver" : "bronze";

    private static CustomerDto ToDto(Customer c) => new(
        c.Id, c.Name, c.TaxId, c.Email, c.Phone, c.Address,
        c.LoyaltyPoints, c.TotalSpent, c.Status, Tier(c.LoyaltyPoints),
        c.BirthDate, c.CreatedAt, c.UpdatedAt);

    [HttpGet]
    public async Task<ActionResult<CustomerListResponse>> List(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? search = null,
        [FromQuery] string? status = null,
        [FromQuery] string? tier = null,
        CancellationToken ct = default)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 200);

        var q = _db.Customers.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim();
            q = q.Where(c => EF.Functions.ILike(c.Name, $"%{s}%")
                          || (c.TaxId != null && EF.Functions.ILike(c.TaxId, $"%{s}%"))
                          || (c.Email != null && EF.Functions.ILike(c.Email, $"%{s}%"))
                          || (c.Phone != null && EF.Functions.ILike(c.Phone, $"%{s}%")));
        }

        if (!string.IsNullOrWhiteSpace(status))
            q = q.Where(c => c.Status == status);

        if (tier == "gold")        q = q.Where(c => c.LoyaltyPoints >= 1000);
        else if (tier == "silver") q = q.Where(c => c.LoyaltyPoints >= 500 && c.LoyaltyPoints < 1000);
        else if (tier == "bronze") q = q.Where(c => c.LoyaltyPoints < 500);
        else if (tier == "vip")    q = q.Where(c => c.LoyaltyPoints >= 500);

        var total = await q.CountAsync(ct);

        var items = await q
            .OrderByDescending(c => c.LoyaltyPoints)
            .ThenBy(c => c.Name)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        return Ok(new CustomerListResponse(
            items.Select(ToDto).ToList(),
            page, pageSize, total,
            (int)Math.Ceiling(total / (double)pageSize)));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<CustomerDto>> Get(Guid id, CancellationToken ct)
    {
        var c = await _db.Customers.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c is null) return NotFound();
        return Ok(ToDto(c));
    }

    [Authorize(Roles = "admin,manager")]
    [HttpPost]
    public async Task<ActionResult<CustomerDto>> Create([FromBody] CreateCustomerRequest req, CancellationToken ct)
    {
        if (_tenant.TenantId is not { } tenantId) return Unauthorized();

        var c = new Customer
        {
            TenantId = tenantId,
            Name = req.Name,
            TaxId = req.TaxId,
            Email = req.Email,
            Phone = req.Phone,
            Address = req.Address,
            LoyaltyPoints = req.LoyaltyPoints,
            BirthDate = req.BirthDate,
            Notes = req.Notes,
            Status = "active",
        };

        _db.Customers.Add(c);
        await _db.SaveChangesAsync(ct);
        return CreatedAtAction(nameof(Get), new { id = c.Id }, ToDto(c));
    }

    [Authorize(Roles = "admin,manager")]
    [HttpPut("{id:guid}")]
    public async Task<ActionResult<CustomerDto>> Update(Guid id, [FromBody] UpdateCustomerRequest req, CancellationToken ct)
    {
        var c = await _db.Customers.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c is null) return NotFound();

        c.Name = req.Name;
        c.TaxId = req.TaxId;
        c.Email = req.Email;
        c.Phone = req.Phone;
        c.Address = req.Address;
        c.LoyaltyPoints = req.LoyaltyPoints;
        c.Status = req.Status;
        c.BirthDate = req.BirthDate;
        c.Notes = req.Notes;

        await _db.SaveChangesAsync(ct);
        return Ok(ToDto(c));
    }

    [Authorize(Roles = "admin,manager")]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var c = await _db.Customers.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c is null) return NotFound();

        // Soft delete to preserve sales history
        c.Status = "inactive";
        _audit.Log("customer.deactivate", "customer", c.Id);
        await _db.SaveChangesAsync(ct);
        return NoContent();
    }

    // =======================================================================
    // LGPD — direitos do titular (art. 18)
    // =======================================================================

    public record PersonalDataExport(
        object Cadastro,
        object Fidelidade,
        IReadOnlyList<object> Compras,
        DateTime GeradoEm,
        string Observacao);

    /// <summary>
    /// Portabilidade / acesso (art. 18, II e V): devolve tudo o que a loja
    /// guarda sobre o titular, em JSON legível para entregar a ele.
    /// </summary>
    [Authorize(Roles = "admin,manager")]
    [HttpGet("{id:guid}/personal-data")]
    public async Task<ActionResult<PersonalDataExport>> ExportPersonalData(Guid id, CancellationToken ct)
    {
        var c = await _db.Customers.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c is null) return NotFound();

        var sales = await _db.Sales.AsNoTracking()
            .Where(s => s.CustomerId == id)
            .OrderByDescending(s => s.SaleDate)
            .Select(s => new { s.Id, s.SaleDate, s.TotalAmount, s.DiscountAmount, s.PaymentMethod, s.Status })
            .ToListAsync(ct);

        _audit.Log("customer.personal_data_export", "customer", c.Id, new { sales = sales.Count });
        await _db.SaveChangesAsync(ct);

        return Ok(new PersonalDataExport(
            Cadastro: new
            {
                c.Name, Cpf = c.TaxId, c.Email, c.Phone, c.Address,
                DataNascimento = c.BirthDate, Observacoes = c.Notes,
                Cadastrado = c.CreatedAt, c.Status,
            },
            Fidelidade: new { Pontos = c.LoyaltyPoints, TotalGasto = c.TotalSpent, Credito = c.CreditBalance },
            Compras: sales.Cast<object>().ToList(),
            GeradoEm: DateTime.UtcNow,
            Observacao: "Documento gerado a pedido do titular (LGPD art. 18). " +
                        "As compras são mantidas por obrigação fiscal mesmo após a anonimização do cadastro."));
    }

    /// <summary>
    /// Eliminação (art. 18, VI) por anonimização: apaga os dados pessoais e
    /// mantém a venda — nota fiscal emitida tem guarda obrigatória e não pode
    /// ser excluída. O vínculo deixa de identificar uma pessoa.
    /// </summary>
    [Authorize(Roles = "admin")]
    [HttpPost("{id:guid}/anonymize")]
    public async Task<ActionResult<CustomerDto>> Anonymize(Guid id, CancellationToken ct)
    {
        // Ato irreversível: além do [Authorize], a regra fica explícita aqui
        if (_tenant.Role != "admin") return Forbid();

        var c = await _db.Customers.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c is null) return NotFound();
        if (c.Status == "anonymized")
            return BadRequest(new { error = "Este cadastro já foi anonimizado." });

        var salesCount = await _db.Sales.CountAsync(s => s.CustomerId == id, ct);

        c.Name = $"Titular anonimizado ({c.Id.ToString()[..8]})";
        c.TaxId = null;
        c.Email = null;
        c.Phone = null;
        c.Address = null;
        c.BirthDate = null;
        c.Notes = null;
        c.Status = "anonymized";
        c.AnonymizedAt = DateTime.UtcNow;

        // Registra o atendimento do pedido — sem guardar o dado que foi apagado
        _audit.Log("customer.anonymize", "customer", c.Id, new { salesPreserved = salesCount });
        await _db.SaveChangesAsync(ct);

        return Ok(ToDto(c));
    }
}
