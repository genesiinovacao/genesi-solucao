namespace Solucao.Backend.Services.Billing;

/// <summary>
/// Regras do ciclo de assinatura: todo cliente vence no mesmo dia do mês
/// (Billing:BillingDay, padrão 25). Quem entra fora dessa data paga apenas a
/// fração de dias até o próximo vencimento (pro-rata) e, a partir daí, segue
/// no ciclo mensal cheio.
/// </summary>
public static class SubscriptionCycle
{
    /// <summary>
    /// "Hoje" no fuso de Brasília. O servidor roda em UTC: usar DateTime.Now
    /// direto viraria o dia às 21h no horário local e adiantaria vencimentos.
    /// </summary>
    public static DateOnly Today()
    {
        var tz = FindBrazilTimeZone();
        var now = tz is null
            ? DateTime.UtcNow.AddHours(-3)   // fallback: UTC-3 fixo
            : TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz);
        return DateOnly.FromDateTime(now);
    }

    private static TimeZoneInfo? FindBrazilTimeZone()
    {
        foreach (var id in new[] { "America/Sao_Paulo", "E. South America Standard Time" })
        {
            try { return TimeZoneInfo.FindSystemTimeZoneById(id); }
            catch (TimeZoneNotFoundException) { }
            catch (InvalidTimeZoneException) { }
        }
        return null;
    }

    /// <summary>Data de vencimento no mês de <paramref name="reference"/>, respeitando meses curtos (fev/30).</summary>
    public static DateOnly BillingDateIn(DateOnly reference, int billingDay)
    {
        var day = Math.Min(billingDay, DateTime.DaysInMonth(reference.Year, reference.Month));
        return new DateOnly(reference.Year, reference.Month, day);
    }

    /// <summary>Primeiro vencimento estritamente depois de <paramref name="from"/>.</summary>
    public static DateOnly NextBillingDate(DateOnly from, int billingDay)
    {
        var candidate = BillingDateIn(from, billingDay);
        return candidate > from ? candidate : BillingDateIn(from.AddMonths(1), billingDay);
    }

    /// <summary>Último vencimento em <paramref name="from"/> ou antes — início do ciclo corrente.</summary>
    public static DateOnly PreviousBillingDate(DateOnly from, int billingDay)
    {
        var candidate = BillingDateIn(from, billingDay);
        return candidate <= from ? candidate : BillingDateIn(from.AddMonths(-1), billingDay);
    }

    /// <summary>Avança N ciclos mensais mantendo o dia de vencimento.</summary>
    public static DateOnly AddCycles(DateOnly date, int months, int billingDay) =>
        months <= 0 ? date : BillingDateIn(date.AddMonths(months), billingDay);

    public record Quote(
        DateOnly PeriodStart,
        DateOnly NewExpiresAt,
        int ProRataDays,
        decimal ProRataAmount,
        int FullMonths,
        decimal FullAmount,
        decimal Total);

    /// <summary>
    /// Monta a cobrança a partir do estado atual da assinatura.
    /// Assinatura ainda válida estende a partir do vencimento vigente (o cliente
    /// não perde os dias que já pagou); vencida ou nova parte de hoje.
    /// </summary>
    public static Quote BuildQuote(
        DateOnly today, DateOnly? currentExpiry, decimal monthlyPrice, int months, int billingDay)
    {
        var start = currentExpiry is { } exp && exp > today ? exp : today;

        var alignedDue = BillingDateIn(start, billingDay) == start
            ? start                                   // já está no dia de vencimento
            : NextBillingDate(start, billingDay);

        var proRataDays = alignedDue.DayNumber - start.DayNumber;
        decimal proRataAmount = 0m;
        if (proRataDays > 0)
        {
            // Fração sobre o ciclo real em que o trecho cai (28-31 dias)
            var cycleStart = PreviousBillingDate(start, billingDay);
            var cycleDays = alignedDue.DayNumber - cycleStart.DayNumber;
            proRataAmount = decimal.Round(monthlyPrice * proRataDays / cycleDays, 2);
        }

        var newExpiry = AddCycles(alignedDue, months, billingDay);
        var fullAmount = decimal.Round(monthlyPrice * months, 2);

        return new Quote(
            start, newExpiry, proRataDays, proRataAmount, months, fullAmount,
            decimal.Round(proRataAmount + fullAmount, 2));
    }
}
