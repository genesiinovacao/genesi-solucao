using Solucao.Backend.Models.Entities;

namespace Solucao.Backend.Services.Fiscal;

public record FiscalEmissionRequest(FiscalDocument Document, Sale Sale, Tenant Tenant);

public record FiscalEmissionResult(
    bool Authorized,
    string? AccessKey,
    string? ProtocolNumber,
    string? Xml,
    string? RejectionReason,
    /// <summary>
    /// Conteúdo do QR Code da NFC-e. Um QR que a SEFAZ valida depende do CSC
    /// da loja e de hash SHA-1 sobre os parâmetros — só provider real produz.
    /// </summary>
    string? QrCodeData = null,
    /// <summary>URL de consulta pela chave, que muda por UF.</summary>
    string? ConsultaUrl = null);

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
