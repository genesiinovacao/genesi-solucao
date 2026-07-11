using Solucao.Backend.Models.Entities;
using Solucao.Backend.Services.Fiscal;
using Xunit;

namespace Solucao.Backend.Tests;

public class SimulatedFiscalProviderTests
{
    private static FiscalEmissionRequest DemoRequest(string docType = "nfce")
    {
        var tenantId = Guid.NewGuid();
        var tenant = new Tenant { Id = tenantId, Name = "Mercado do João", Cnpj = "12.345.678/0001-90" };
        var sale = new Sale
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            TotalAmount = 25.50m,
            Items =
            {
                new SaleItem { ProductName = "Café 500g", Quantity = 2, UnitPrice = 10m, TotalPrice = 20m },
                new SaleItem { ProductName = "Pão", Quantity = 1, UnitPrice = 5.50m, TotalPrice = 5.50m },
            },
        };
        var doc = new FiscalDocument
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            SaleId = sale.Id,
            DocumentType = docType,
            Series = 1,
            Number = 42,
        };
        return new FiscalEmissionRequest(doc, sale, tenant);
    }

    [Fact]
    public async Task Emit_Authorizes_WithValid44DigitAccessKey()
    {
        var provider = new SimulatedFiscalProvider();

        var result = await provider.EmitAsync(DemoRequest(), CancellationToken.None);

        Assert.True(result.Authorized);
        Assert.NotNull(result.AccessKey);
        Assert.Equal(44, result.AccessKey!.Length);
        Assert.All(result.AccessKey, c => Assert.True(char.IsDigit(c)));
        Assert.Equal(ComputeMod11(result.AccessKey[..43]), result.AccessKey[43] - '0');
    }

    [Fact]
    public async Task Emit_EncodesModelSeriesAndNumberInAccessKey()
    {
        var provider = new SimulatedFiscalProvider();

        var nfce = await provider.EmitAsync(DemoRequest("nfce"), CancellationToken.None);
        var nfe  = await provider.EmitAsync(DemoRequest("nfe"), CancellationToken.None);

        // Layout: cUF(2) AAMM(4) CNPJ(14) mod(2) serie(3) numero(9) tpEmis(1) cNF(8) DV(1)
        Assert.Equal("65", nfce.AccessKey!.Substring(20, 2));
        Assert.Equal("55", nfe.AccessKey!.Substring(20, 2));
        Assert.Equal("001", nfce.AccessKey.Substring(22, 3));
        Assert.Equal("000000042", nfce.AccessKey.Substring(25, 9));
        // CNPJ do tenant, sem máscara
        Assert.Equal("12345678000190", nfce.AccessKey.Substring(6, 14));
    }

    [Fact]
    public async Task Emit_XmlIsMarkedAsSimulated()
    {
        var provider = new SimulatedFiscalProvider();

        var result = await provider.EmitAsync(DemoRequest(), CancellationToken.None);

        Assert.NotNull(result.Xml);
        Assert.Contains("SEM VALOR FISCAL", result.Xml);
        Assert.Contains(result.AccessKey!, result.Xml);
        Assert.Contains("Café 500g", result.Xml);
    }

    [Fact]
    public async Task Cancel_AlwaysSucceedsInSimulation()
    {
        var provider = new SimulatedFiscalProvider();
        var ok = await provider.CancelAsync(new FiscalDocument(), "cancelamento de teste unitário", CancellationToken.None);
        Assert.True(ok);
    }

    private static int ComputeMod11(string digits)
    {
        var weights = new[] { 2, 3, 4, 5, 6, 7, 8, 9 };
        int sum = 0, w = 0;
        for (int i = digits.Length - 1; i >= 0; i--)
            sum += (digits[i] - '0') * weights[w++ % weights.Length];
        var rest = sum % 11;
        return rest < 2 ? 0 : 11 - rest;
    }
}
