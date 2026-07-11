namespace Solucao.Backend.Models.Entities;

public class SaleItem
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid SaleId { get; set; }
    public Guid? ProductId { get; set; }
    public string ProductName { get; set; } = null!;
    public decimal Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal TotalPrice { get; set; }
}
