using Solucao.Backend.Models.Entities;

namespace Solucao.Backend.Services.Fiscal;

public record FiscalEmissionRequest(FiscalDocument Document, Sale Sale, Tenant Tenant);

public record FiscalEmissionResult(
    bool Authorized,
    string? AccessKey,
    string? ProtocolNumber,
    string? Xml,
    string? RejectionReason);

/// <summary>
/// Abstração da emissão fiscal. O provider default é o simulado (sem SEFAZ).
/// Para emitir de verdade, implementar esta interface sobre um gateway
/// (Focus NFe, PlugNotas, TecnoSpeed, ...) e trocar Fiscal:Provider no
/// appsettings — nenhum controller precisa mudar.
/// </summary>
public interface IFiscalProvider
{
    string Name { get; }
    Task<FiscalEmissionResult> EmitAsync(FiscalEmissionRequest request, CancellationToken ct);
    Task<bool> CancelAsync(FiscalDocument document, string reason, CancellationToken ct);
}
