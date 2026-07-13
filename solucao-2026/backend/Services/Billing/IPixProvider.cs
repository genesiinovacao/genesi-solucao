namespace Solucao.Backend.Services.Billing;

public record PixChargeResult(string ProviderChargeId, string QrCodeText, DateTime ExpiresAt);

/// <summary>
/// Abstração da cobrança PIX. O provider default é o simulado (paga sozinho
/// após alguns segundos — bom para demonstração). Para receber de verdade,
/// configurar Billing:Provider = "mercadopago" e o access token — nenhum
/// controller precisa mudar.
/// </summary>
public interface IPixProvider
{
    string Name { get; }

    /// <param name="reference">Id da cobrança no nosso banco — vai como
    /// referência externa para conciliação no provider.</param>
    Task<PixChargeResult> CreateChargeAsync(
        decimal amount, string description, string reference, string payerEmail, CancellationToken ct);

    Task<bool> IsPaidAsync(string providerChargeId, CancellationToken ct);
}
