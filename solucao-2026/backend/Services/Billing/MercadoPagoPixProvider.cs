using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Solucao.Backend.Services.Billing;

/// <summary>
/// PIX real via Mercado Pago (API /v1/payments, payment_method_id=pix).
/// Requer Billing:Provider = "mercadopago" e Billing:MercadoPago:AccessToken
/// (token de produção da conta Mercado Pago — via variável de ambiente
/// Billing__MercadoPago__AccessToken no Render; nunca commitar).
/// A detecção de pagamento é por consulta (GET /v1/payments/{id}) enquanto o
/// modal de renovação está aberto — sem necessidade de webhook público.
/// </summary>
public sealed class MercadoPagoPixProvider : IPixProvider
{
    private readonly HttpClient _http;

    public MercadoPagoPixProvider(HttpClient http, string accessToken)
    {
        _http = http;
        _http.BaseAddress ??= new Uri("https://api.mercadopago.com");
        _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
    }

    public string Name => "mercadopago";

    public async Task<PixChargeResult> CreateChargeAsync(
        decimal amount, string description, string reference, string payerEmail, CancellationToken ct)
    {
        var expiresAt = DateTime.UtcNow.AddHours(1);
        var body = new
        {
            transaction_amount = decimal.Round(amount, 2),
            description,
            payment_method_id = "pix",
            external_reference = reference,
            date_of_expiration = expiresAt.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'+00:00'"),
            payer = new { email = string.IsNullOrWhiteSpace(payerEmail) ? "pagador@solucao2026.com" : payerEmail },
        };

        using var req = new HttpRequestMessage(HttpMethod.Post, "/v1/payments") { Content = JsonContent.Create(body) };
        // Idempotência: repetir a mesma referência não cria pagamento duplicado
        req.Headers.Add("X-Idempotency-Key", reference);

        var resp = await _http.SendAsync(req, ct);
        var payload = await resp.Content.ReadFromJsonAsync<MpPayment>(cancellationToken: ct);

        if (!resp.IsSuccessStatusCode || payload?.Id is null)
            throw new InvalidOperationException(
                $"Mercado Pago recusou a cobrança (HTTP {(int)resp.StatusCode}): {payload?.Message ?? "sem detalhe"}");

        var qr = payload.PointOfInteraction?.TransactionData?.QrCode;
        if (string.IsNullOrWhiteSpace(qr))
            throw new InvalidOperationException("Mercado Pago não retornou o QR Code do PIX.");

        return new PixChargeResult(payload.Id.Value.ToString(), qr, expiresAt);
    }

    public async Task<bool> IsPaidAsync(string providerChargeId, CancellationToken ct)
    {
        var resp = await _http.GetAsync($"/v1/payments/{providerChargeId}", ct);
        if (!resp.IsSuccessStatusCode) return false;
        var payload = await resp.Content.ReadFromJsonAsync<MpPayment>(cancellationToken: ct);
        return payload?.Status == "approved";
    }

    private sealed record MpPayment
    {
        [JsonPropertyName("id")] public long? Id { get; init; }
        [JsonPropertyName("status")] public string? Status { get; init; }
        [JsonPropertyName("message")] public string? Message { get; init; }
        [JsonPropertyName("point_of_interaction")] public MpPoi? PointOfInteraction { get; init; }
    }

    private sealed record MpPoi
    {
        [JsonPropertyName("transaction_data")] public MpTxData? TransactionData { get; init; }
    }

    private sealed record MpTxData
    {
        [JsonPropertyName("qr_code")] public string? QrCode { get; init; }
    }
}
