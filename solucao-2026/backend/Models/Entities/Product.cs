namespace Solucao.Backend.Models.Entities;

public class Product
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid? SupplierId { get; set; }
    public string? Sku { get; set; }
    public string? Barcode { get; set; }
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public string? Category { get; set; }
    public string Unit { get; set; } = "un";
    public string? Emoji { get; set; }
    public decimal CostPrice { get; set; }
    public decimal SalePrice { get; set; }
    public decimal StockQuantity { get; set; }
    public decimal MinStock { get; set; }
    public DateOnly? ExpiryDate { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
