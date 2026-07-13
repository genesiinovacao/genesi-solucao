using System.Collections.Concurrent;

namespace Solucao.Backend.Services.Billing;

/// <summary>
/// PIX de mentira para demonstração/desenvolvimento: gera um "copia e cola"
/// sintético e considera a cobrança paga depois de <see cref="_settleAfter"/>.
/// Nada sai do processo — reiniciou o backend, cobranças pendentes somem
/// (o controller marca como erro ao consultar um id desconhecido).
/// </summary>
public sealed class SimulatedPixProvider : IPixProvider
{
    private readonly TimeSpan _settleAfter;
    private readonly ConcurrentDictionary<string, DateTime> _createdAt = new();

    public SimulatedPixProvider(TimeSpan? settleAfter = null)
    {
        _settleAfter = settleAfter ?? TimeSpan.FromSeconds(20);
    }

    public string Name => "simulated";

    public Task<PixChargeResult> CreateChargeAsync(
        decimal amount, string description, string reference, string payerEmail, CancellationToken ct)
    {
        var id = $"SIM-{Guid.NewGuid():N}";
        _createdAt[id] = DateTime.UtcNow;

        // Formato apenas parecido com um BR Code real — deixa claro que é demo
        var qr = $"00020126580014BR.GOV.BCB.PIX0136{reference}5204000053039865406{amount:0.00}" +
                 $"5802BR5915SOLUCAO SIMULADO6009SAO PAULO62070503***6304DEMO";

        return Task.FromResult(new PixChargeResult(id, qr, DateTime.UtcNow.AddHours(1)));
    }

    public Task<bool> IsPaidAsync(string providerChargeId, CancellationToken ct)
    {
        if (!_createdAt.TryGetValue(providerChargeId, out var created))
            return Task.FromResult(false);
        return Task.FromResult(DateTime.UtcNow - created >= _settleAfter);
    }
}
