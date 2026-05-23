using Microsoft.AspNetCore.Mvc;
using Solucao.Backend.Models;
using Solucao.Backend.Data;

namespace Solucao.Backend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SyncController : ControllerBase
{
    private readonly AppDbContext _context;

    public SyncController(AppDbContext context)
    {
        _context = context;
    }

    [HttpPost("sales")]
    public async Task<IActionResult> SyncSales([FromBody] List<SaleSyncDto> salesToSync)
    {
        if (salesToSync == null || !salesToSync.Any())
            return BadRequest("Nenhuma venda para sincronizar.");

        var tenantId = HttpContext.Items["TenantId"] as string;
        var results = new List<SyncResult>();

        foreach (var saleDto in salesToSync)
        {
            try 
            {
                // 1. Verificar se a venda já existe (evitar duplicidade por ID de sincronia offline)
                var exists = _context.Sales.Any(s => s.OfflineSyncId == saleDto.OfflineSyncId);
                
                if (!exists)
                {
                    // 2. Mapear DTO para Entidade de Venda
                    var sale = new Sale 
                    {
                        TenantId = Guid.Parse(tenantId),
                        OfflineSyncId = saleDto.OfflineSyncId,
                        TotalAmount = saleDto.TotalAmount,
                        SaleDate = saleDto.SaleDate,
                        PaymentMethod = saleDto.PaymentMethod,
                        Items = saleDto.Items.Select(i => new SaleItem {
                            ProductId = i.ProductId,
                            Quantity = i.Quantity,
                            UnitPrice = i.UnitPrice
                        }).ToList()
                    };

                    _context.Sales.Add(sale);
                    results.Add(new SyncResult { OfflineSyncId = saleDto.OfflineSyncId, Status = "Success" });
                }
                else 
                {
                    results.Add(new SyncResult { OfflineSyncId = saleDto.OfflineSyncId, Status = "AlreadySynced" });
                }
            }
            catch (Exception ex)
            {
                results.Add(new SyncResult { OfflineSyncId = saleDto.OfflineSyncId, Status = "Error", Message = ex.Message });
            }
        }

        await _context.SaveChangesAsync();
        return Ok(results);
    }
}

public class SaleSyncDto
{
    public Guid OfflineSyncId { get; set; }
    public decimal TotalAmount { get; set; }
    public DateTime SaleDate { get; set; }
    public string PaymentMethod { get; set; }
    public List<SaleItemSyncDto> Items { get; set; }
}

public class SaleItemSyncDto
{
    public Guid ProductId { get; set; }
    public decimal Quantity { get; set; }
    public decimal UnitPrice { get; set; }
}

public class SyncResult
{
    public Guid OfflineSyncId { get; set; }
    public string Status { get; set; }
    public string Message { get; set; }
}
