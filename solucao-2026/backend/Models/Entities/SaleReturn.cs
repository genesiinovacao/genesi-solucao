namespace Solucao.Backend.Models.Entities;

public class SaleReturn
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid SaleId { get; set; }
    public Guid? CustomerId { get; set; }
    public Guid? UserId { get; set; }
    public decimal TotalRefund { get; set; }
    public string RefundMethod { get; set; } = "cash";
    public string? Reason { get; set; }
    public bool IsPartial { get; set; }
    public DateTime CreatedAt { get; set; }

    public List<SaleReturnItem> Items { get; set; } = new();
}

public class SaleReturnItem
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid SaleReturnId { get; set; }
    public Guid SaleItemId { get; set; }
    public Guid? ProductId { get; set; }
    public decimal QuantityReturned { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal RefundAmount { get; set; }
}
