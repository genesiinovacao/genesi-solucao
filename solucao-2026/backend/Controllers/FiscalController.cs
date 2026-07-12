using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Solucao.Backend.Data;
using Solucao.Backend.Models.Dtos.Fiscal;
using Solucao.Backend.Models.Entities;
using Solucao.Backend.Services;
using Solucao.Backend.Services.Fiscal;

namespace Solucao.Backend.Controllers;

[ApiController]
[Authorize]
[Route("api/fiscal")]
public class FiscalController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ITenantContext _tenant;
    private readonly IFiscalProvider _provider;
    private readonly IConfiguration _config;
    private readonly ILogger<FiscalController> _log;

    public FiscalController(
        AppDbContext db, ITenantContext tenant, IFiscalProvider provider,
        IConfiguration config, ILogger<FiscalController> log)
    {
        _db = db;
        _tenant = tenant;
        _provider = provider;
        _config = config;
        _log = log;
    }

    /// <summary>Emite o documento fiscal (NFC-e por padrão) de uma venda.</summary>
    [HttpPost("sales/{saleId:guid}/emit")]
    public async Task<ActionResult<FiscalDocumentDto>> Emit(
        Guid saleId, [FromBody] EmitFiscalRequest? req, CancellationToken ct)
    {
        if (_tenant.TenantId is not { } tenantId) return Unauthorized();

        var docType = req?.DocumentType ?? "nfce";
        if (docType is not ("nfce" or "nfe" or "sat"))
            return BadRequest(new { error = "documentType deve ser nfce, nfe ou sat." });

        var sale = await _db.Sales.Include(s => s.Items)
            .FirstOrDefaultAsync(s => s.Id == saleId, ct);
        if (sale is null) return NotFound(new { error = "Venda não encontrada." });
        if (sale.Status == "cancelled")
            return BadRequest(new { error = "Não é possível emitir documento fiscal de venda cancelada." });

        var alreadyActive = await _db.FiscalDocuments.AnyAsync(
            d => d.SaleId == saleId && (d.Status == "authorized" || d.Status == "pending"), ct);
        if (alreadyActive)
            return Conflict(new { error = "Esta venda já possui documento fiscal autorizado ou em processamento." });

        var tenant = await _db.Tenants.AsNoTracking().FirstAsync(t => t.Id == tenantId, ct);

        var series = _config.GetValue("Fiscal:Series", 1);
        var environment = _config.GetValue("Fiscal:Environment", "homologation")!;

        // Transação: numeração sequencial + emissão atômicas. O índice único
        // (tenant, type, series, number) barra corrida entre requests.
        await using var tx = await _db.Database.BeginTransactionAsync(ct);

        var lastNumber = await _db.FiscalDocuments
            .Where(d => d.DocumentType == docType && d.Series == series)
            .MaxAsync(d => (long?)d.Number, ct) ?? 0;

        var doc = new FiscalDocument
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            SaleId = saleId,
            DocumentType = docType,
            Environment = environment,
            Provider = _provider.Name,
            Series = series,
            Number = lastNumber + 1,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };

        var result = await _provider.EmitAsync(new FiscalEmissionRequest(doc, sale, tenant), ct);

        doc.Status = result.Authorized ? "authorized" : "rejected";
        doc.AccessKey = result.AccessKey;
        doc.ProtocolNumber = result.ProtocolNumber;
        doc.Xml = result.Xml;
        doc.RejectionReason = result.RejectionReason;
        doc.IssuedAt = result.Authorized ? DateTime.UtcNow : null;

        _db.FiscalDocuments.Add(doc);
        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        _log.LogInformation("Fiscal {Type} #{Number} {Status} para venda {SaleId} (provider {Provider})",
            docType, doc.Number, doc.Status, saleId, _provider.Name);

        return Ok(ToDto(doc));
    }

    /// <summary>Cancela um documento fiscal autorizado. Ato gerencial —
    /// o caixa emite nota, mas não cancela.</summary>
    [Authorize(Roles = "admin,manager")]
    [HttpPost("documents/{id:guid}/cancel")]
    public async Task<ActionResult<FiscalDocumentDto>> Cancel(
        Guid id, [FromBody] CancelFiscalRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Reason) || req.Reason.Trim().Length < 15)
            return BadRequest(new { error = "Informe uma justificativa com pelo menos 15 caracteres (exigência da SEFAZ)." });

        var doc = await _db.FiscalDocuments.FirstOrDefaultAsync(d => d.Id == id, ct);
        if (doc is null) return NotFound();
        if (doc.Status != "authorized")
            return BadRequest(new { error = $"Só é possível cancelar documento autorizado (status atual: {doc.Status})." });

        var ok = await _provider.CancelAsync(doc, req.Reason.Trim(), ct);
        if (!ok) return StatusCode(502, new { error = "O provider fiscal recusou o cancelamento." });

        doc.Status = "cancelled";
        doc.RejectionReason = req.Reason.Trim();
        doc.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        return Ok(ToDto(doc));
    }

    /// <summary>Documento fiscal mais recente de uma venda (404 se nunca emitido).</summary>
    [HttpGet("sales/{saleId:guid}")]
    public async Task<ActionResult<FiscalDocumentDto>> GetBySale(Guid saleId, CancellationToken ct)
    {
        var doc = await _db.FiscalDocuments.AsNoTracking()
            .Where(d => d.SaleId == saleId)
            .OrderByDescending(d => d.CreatedAt)
            .FirstOrDefaultAsync(ct);
        return doc is null ? NotFound() : Ok(ToDto(doc));
    }

    /// <summary>XML do documento (simulado enquanto o provider for 'simulated').</summary>
    [HttpGet("documents/{id:guid}/xml")]
    public async Task<IActionResult> GetXml(Guid id, CancellationToken ct)
    {
        var doc = await _db.FiscalDocuments.AsNoTracking().FirstOrDefaultAsync(d => d.Id == id, ct);
        if (doc?.Xml is null) return NotFound();
        return Content(doc.Xml, "application/xml");
    }

    /// <summary>Lista paginada dos documentos fiscais do tenant.</summary>
    [HttpGet("documents")]
    public async Task<ActionResult<FiscalDocumentListDto>> List(
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = _db.FiscalDocuments.AsNoTracking().OrderByDescending(d => d.CreatedAt);
        var total = await query.CountAsync(ct);
        var items = await query.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);

        return Ok(new FiscalDocumentListDto(
            items.Select(ToDto).ToList(), total, page, pageSize,
            (int)Math.Ceiling(total / (double)pageSize)));
    }

    private static FiscalDocumentDto ToDto(FiscalDocument d) => new(
        d.Id, d.SaleId, d.DocumentType, d.Status, d.Environment, d.Provider,
        d.Series, d.Number, d.AccessKey, d.ProtocolNumber, d.RejectionReason,
        d.IssuedAt, d.CreatedAt);
}
