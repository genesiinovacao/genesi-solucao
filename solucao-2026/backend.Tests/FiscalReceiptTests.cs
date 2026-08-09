using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Solucao.Backend.Controllers;
using Solucao.Backend.Models.Dtos.Fiscal;
using Solucao.Backend.Models.Entities;
using Solucao.Backend.Services;
using Solucao.Backend.Services.Fiscal;
using Solucao.Backend.Tests.Support;
using Xunit;

namespace Solucao.Backend.Tests;

/// <summary>
/// Dados do DANFE que o PDV imprime.
///
/// O teste que importa é o da trava: cupom com layout de nota fiscal sem
/// autorização real da SEFAZ é documento enganoso. HasFiscalValue só pode ser
/// verdadeiro com provider real em produção; fora disso o cupom tem de sair
/// carimbado.
/// </summary>
public class FiscalReceiptTests
{
    private static readonly Guid TenantId = Guid.NewGuid();

    private static (FiscalController controller, Data.AppDbContext db, Guid saleId) Setup(
        string provider, string environment)
    {
        var db = TestDb.Create();
        var ctx = new TenantContext();
        ctx.SetContext(TenantId, Guid.NewGuid(), "admin");

        db.Tenants.Add(new Tenant
        {
            Id = TenantId, Name = "Auto Peças Teste", Cnpj = "08171464000172",
            StateRegistration = "008892024", Address = "Rua Coronel Antonio Vicente, 108",
            Phone = "(81) 99974-1554", PlanType = "basic",
            ApproximateTaxPercent = 35.38m,
        });

        var saleId = Guid.NewGuid();
        db.Sales.Add(new Sale
        {
            Id = saleId, TenantId = TenantId, SaleDate = DateTime.UtcNow,
            Subtotal = 2.60m, TotalAmount = 2.60m, PaymentMethod = "cash", Status = "completed",
        });

        db.FiscalDocuments.Add(new FiscalDocument
        {
            Id = Guid.NewGuid(), TenantId = TenantId, SaleId = saleId,
            DocumentType = "nfce", Status = "authorized",
            Environment = environment, Provider = provider,
            Series = 0, Number = 594362,
            AccessKey = "26260808171464000172650000005943621956372710",
            ProtocolNumber = "226260728864359",
            QrCodeData = "https://exemplo/consulta?p=...",
            ConsultaUrl = "http://nfce.sefaz.pe.gov.br/nfce/consulta",
            IssuedAt = DateTime.UtcNow, CreatedAt = DateTime.UtcNow,
        });
        db.SaveChanges();

        var config = new ConfigurationBuilder().AddInMemoryCollection().Build();
        var controller = new FiscalController(
            db, ctx, new SimulatedFiscalProvider(), config, NullLogger<FiscalController>.Instance);
        return (controller, db, saleId);
    }

    private static FiscalReceiptDto Receipt(FiscalController c, Guid saleId)
    {
        var response = c.ReceiptData(saleId, default).GetAwaiter().GetResult();
        return (FiscalReceiptDto)Assert.IsType<OkObjectResult>(response.Result).Value!;
    }

    [Theory]
    [InlineData("simulated", "production")]     // provider fake, ambiente real
    [InlineData("simulated", "homologation")]
    [InlineData("focusnfe", "homologation")]    // provider real, ambiente de teste
    public void Receipt_WithoutRealAuthorization_HasNoFiscalValue(string provider, string env)
    {
        var (controller, _, saleId) = Setup(provider, env);

        var dto = Receipt(controller, saleId);

        Assert.False(dto.HasFiscalValue);
        Assert.NotNull(dto.WarningLabel);
        Assert.Contains("SEM VALOR FISCAL", dto.WarningLabel!);
    }

    [Fact]
    public void Receipt_WithRealProviderInProduction_HasFiscalValue()
    {
        var (controller, _, saleId) = Setup("focusnfe", "production");

        var dto = Receipt(controller, saleId);

        Assert.True(dto.HasFiscalValue);
        Assert.Null(dto.WarningLabel);
    }

    [Fact]
    public void Receipt_CarriesEmitterAndDocumentData()
    {
        var (controller, _, saleId) = Setup("focusnfe", "production");

        var dto = Receipt(controller, saleId);

        Assert.Equal("08171464000172", dto.EmitCnpj);
        Assert.Equal("008892024", dto.EmitStateRegistration);
        Assert.Equal(594362, dto.Number);
        Assert.Equal("226260728864359", dto.ProtocolNumber);
        Assert.Equal(44, dto.AccessKey!.Length);
    }

    /// <summary>Lei 12.741/2012: 35,38% de R$ 2,60 = R$ 0,92.</summary>
    [Fact]
    public void Receipt_ComputesApproximateTax()
    {
        var (controller, _, saleId) = Setup("focusnfe", "production");

        Assert.Equal(0.92m, Receipt(controller, saleId).ApproximateTaxAmount);
    }

    /// <summary>
    /// Venda sem documento autorizado não devolve cupom fiscal nenhum — o PDV
    /// cai no cupom não fiscal em vez de imprimir um DANFE pela metade.
    /// </summary>
    [Fact]
    public async Task Receipt_WithoutAuthorizedDocument_Is404()
    {
        var (controller, db, saleId) = Setup("focusnfe", "production");
        (await db.FiscalDocuments.SingleAsync()).Status = "rejected";
        await db.SaveChangesAsync();

        var response = await controller.ReceiptData(saleId, default);

        Assert.IsType<NotFoundObjectResult>(response.Result);
    }
}
