using System.Security.Cryptography;
using System.Text;
using Solucao.Backend.Models.Entities;

namespace Solucao.Backend.Services.Fiscal;

/// <summary>
/// Emissão fiscal simulada: gera chave de acesso de 44 dígitos com DV mod-11
/// real e um XML de demonstração, mas NÃO comunica com a SEFAZ. Serve para
/// desenvolver o fluxo ponta a ponta (emitir, consultar, cancelar) até um
/// gateway real ser plugado.
/// </summary>
public sealed class SimulatedFiscalProvider : IFiscalProvider
{
    public string Name => "simulated";

    // Código UF fixo (35 = SP) — provider real derivará do cadastro do tenant.
    private const string CodigoUf = "35";

    public Task<FiscalEmissionResult> EmitAsync(FiscalEmissionRequest request, CancellationToken ct)
    {
        var (doc, sale, tenant) = (request.Document, request.Sale, request.Tenant);

        var cnpj = new string(tenant.Cnpj.Where(char.IsDigit).ToArray()).PadLeft(14, '0');
        var model = doc.DocumentType == "nfe" ? "55" : "65";
        var now = DateTime.UtcNow;
        var randomCode = RandomNumberGenerator.GetInt32(0, 100_000_000).ToString("D8");

        var key43 =
            CodigoUf +
            now.ToString("yyMM") +
            cnpj +
            model +
            doc.Series.ToString("D3") +
            doc.Number.ToString("D9") +
            "1" +            // tpEmis = emissão normal
            randomCode;

        var accessKey = key43 + Mod11CheckDigit(key43);
        var protocol = $"1{CodigoUf}{now:yyyyMMddHHmmss}";

        var xml = BuildDemoXml(doc, sale, tenant, accessKey, protocol, now);

        // QR no formato da NFC-e, mas SEM assinatura válida: o hash real usa o
        // CSC da loja, que só existe com credenciamento na SEFAZ. Scaneado,
        // este QR não valida — serve para conferir o layout do cupom, e por
        // isso o DANFE impresso em modo simulado carrega "SEM VALOR FISCAL".
        var consultaUrl = "https://www.homologacao.nfce.fazenda.sp.gov.br/consulta";
        var qr = $"{consultaUrl}?p={accessKey}|2|2|1|SIMULADO";

        return Task.FromResult(new FiscalEmissionResult(
            Authorized: true,
            AccessKey: accessKey,
            ProtocolNumber: protocol,
            Xml: xml,
            RejectionReason: null,
            QrCodeData: qr,
            ConsultaUrl: consultaUrl));
    }

    public Task<bool> CancelAsync(FiscalDocument document, string reason, CancellationToken ct)
        => Task.FromResult(true);

    private static int Mod11CheckDigit(string digits)
    {
        var weights = new[] { 2, 3, 4, 5, 6, 7, 8, 9 };
        int sum = 0, w = 0;
        for (int i = digits.Length - 1; i >= 0; i--)
            sum += (digits[i] - '0') * weights[w++ % weights.Length];
        var rest = sum % 11;
        return rest < 2 ? 0 : 11 - rest;
    }

    private static string BuildDemoXml(
        FiscalDocument doc, Sale sale, Tenant tenant,
        string accessKey, string protocol, DateTime issuedAt)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"""<?xml version="1.0" encoding="UTF-8"?>""");
        sb.AppendLine($"""<!-- DOCUMENTO SIMULADO — SEM VALOR FISCAL (provider: simulated) -->""");
        sb.AppendLine($"""<nfeProc versao="4.00">""");
        sb.AppendLine($"""  <NFe><infNFe Id="NFe{accessKey}">""");
        sb.AppendLine($"""    <ide><mod>{(doc.DocumentType == "nfe" ? 55 : 65)}</mod><serie>{doc.Series}</serie><nNF>{doc.Number}</nNF><dhEmi>{issuedAt:O}</dhEmi><tpAmb>2</tpAmb></ide>""");
        sb.AppendLine($"""    <emit><CNPJ>{tenant.Cnpj}</CNPJ><xNome>{tenant.Name}</xNome></emit>""");
        foreach (var (item, idx) in sale.Items.Select((i, x) => (i, x + 1)))
        {
            sb.AppendLine($"""    <det nItem="{idx}"><prod><xProd>{item.ProductName}</xProd><qCom>{item.Quantity}</qCom><vUnCom>{item.UnitPrice}</vUnCom><vProd>{item.TotalPrice}</vProd></prod></det>""");
        }
        sb.AppendLine($"""    <total><vNF>{sale.TotalAmount}</vNF></total>""");
        sb.AppendLine($"""  </infNFe></NFe>""");
        sb.AppendLine($"""  <protNFe><infProt><chNFe>{accessKey}</chNFe><nProt>{protocol}</nProt><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e (SIMULADO)</xMotivo></infProt></protNFe>""");
        sb.AppendLine("</nfeProc>");
        return sb.ToString();
    }
}
