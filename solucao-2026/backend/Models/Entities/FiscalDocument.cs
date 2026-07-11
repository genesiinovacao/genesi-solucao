namespace Solucao.Backend.Models.Entities;

public class FiscalDocument
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid SaleId { get; set; }
    public string DocumentType { get; set; } = "nfce";
    public string Status { get; set; } = "pending";
    public string Environment { get; set; } = "homologation";
    public string Provider { get; set; } = "simulated";
    public int Series { get; set; } = 1;
    public long Number { get; set; }
    public string? AccessKey { get; set; }
    public string? ProtocolNumber { get; set; }
    public string? Xml { get; set; }
    public string? RejectionReason { get; set; }
    public DateTime? IssuedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
