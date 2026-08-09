namespace Solucao.Backend.Models.Dtos.Fiscal;

public record FiscalDocumentDto(
    Guid Id,
    Guid SaleId,
    string DocumentType,
    string Status,
    string Environment,
    string Provider,
    int Series,
    long Number,
    string? AccessKey,
    string? ProtocolNumber,
    string? RejectionReason,
    DateTime? IssuedAt,
    DateTime CreatedAt);

/// <summary>
/// Tudo o que o cupom precisa imprimir num DANFE de NFC-e. Montado no
/// servidor para o PDV não ter de conhecer regra fiscal.
///
/// <para><b>HasFiscalValue</b> é a trava: só é verdadeiro com documento
/// autorizado, em ambiente de produção e por provider real. Falso obriga o
/// cupom a sair marcado como sem valor fiscal — um DANFE que parece válido
/// sem autorização da SEFAZ é documento enganoso, não é layout bonito.</para>
/// </summary>
public record FiscalReceiptDto(
    // Emitente
    string EmitName,
    string EmitCnpj,
    string? EmitStateRegistration,
    string? EmitAddress,
    string? EmitPhone,
    // Documento
    long Number,
    int Series,
    DateTime? IssuedAt,
    string? AccessKey,
    string? ProtocolNumber,
    string? QrCodeData,
    string? ConsultaUrl,
    string Status,
    string Environment,
    string Provider,
    bool HasFiscalValue,
    string? WarningLabel,
    // Valores
    decimal ApproximateTaxAmount,
    string? CustomerTaxId);

public record EmitFiscalRequest(string? DocumentType);
public record CancelFiscalRequest(string Reason);

public record FiscalDocumentListDto(
    IReadOnlyList<FiscalDocumentDto> Items,
    int TotalCount,
    int Page,
    int PageSize,
    int TotalPages);
