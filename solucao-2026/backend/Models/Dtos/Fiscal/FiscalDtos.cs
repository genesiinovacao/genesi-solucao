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

public record EmitFiscalRequest(string? DocumentType);
public record CancelFiscalRequest(string Reason);

public record FiscalDocumentListDto(
    IReadOnlyList<FiscalDocumentDto> Items,
    int TotalCount,
    int Page,
    int PageSize,
    int TotalPages);
