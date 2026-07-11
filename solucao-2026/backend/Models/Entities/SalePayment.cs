namespace Solucao.Backend.Models.Entities;

public class SalePayment
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid SaleId { get; set; }
    public string Method { get; set; } = null!;
    public decimal Amount { get; set; }
    public string? AuthorizationCode { get; set; }
    public DateTime CreatedAt { get; set; }
}
