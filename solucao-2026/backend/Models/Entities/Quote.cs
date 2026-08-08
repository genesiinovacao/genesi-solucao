namespace Solucao.Backend.Models.Entities;

/// <summary>
/// Orçamento entregue ao cliente. Não é venda: não baixa estoque nem entra
/// no caixa. Vira número só quando convertido (<see cref="ConvertedSaleId"/>).
/// </summary>
public class Quote
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    /// <summary>Sequencial por loja — é o número impresso no papel do cliente.</summary>
    public long Number { get; set; }
    public Guid? UserId { get; set; }
    public Guid? CustomerId { get; set; }
    /// <summary>Cliente de balcão sem cadastro.</summary>
    public string? CustomerName { get; set; }
    public string? CustomerPhone { get; set; }
    public decimal Subtotal { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal SurchargeAmount { get; set; }
    public decimal TotalAmount { get; set; }
    /// <summary>Preço de peça muda: sem validade o cliente cobra valor antigo.</summary>
    public DateOnly ValidUntil { get; set; }
    public string Status { get; set; } = "open";
    public Guid? ConvertedSaleId { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public List<QuoteItem> Items { get; set; } = new();
}

public class QuoteItem
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid QuoteId { get; set; }
    public Guid? ProductId { get; set; }
    public string ProductName { get; set; } = "";
    public decimal Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal TotalPrice { get; set; }
}
