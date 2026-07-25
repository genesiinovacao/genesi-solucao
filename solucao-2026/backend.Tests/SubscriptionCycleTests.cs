using Solucao.Backend.Services.Billing;
using Xunit;

namespace Solucao.Backend.Tests;

public class SubscriptionCycleTests
{
    private const int Day = 25;
    private const decimal Monthly = 149.90m;

    [Fact]
    public void NewClientMidMonth_PaysOnlyTheDaysUntilBillingDay()
    {
        // Entrou em 10/07: usa 15 dias até 25/07 (ciclo 25/06→25/07 = 30 dias)
        var quote = SubscriptionCycle.BuildQuote(
            new DateOnly(2026, 7, 10), currentExpiry: null, Monthly, months: 1, Day);

        Assert.Equal(15, quote.ProRataDays);
        Assert.Equal(74.95m, quote.ProRataAmount);          // metade de 149,90
        Assert.Equal(Monthly, quote.FullAmount);
        Assert.Equal(224.85m, quote.Total);
        Assert.Equal(new DateOnly(2026, 8, 25), quote.NewExpiresAt);
    }

    [Fact]
    public void AlreadyAlignedSubscription_HasNoProRata()
    {
        var quote = SubscriptionCycle.BuildQuote(
            new DateOnly(2026, 7, 10), new DateOnly(2026, 8, 25), Monthly, months: 1, Day);

        Assert.Equal(0, quote.ProRataDays);
        Assert.Equal(0m, quote.ProRataAmount);
        Assert.Equal(Monthly, quote.Total);
        Assert.Equal(new DateOnly(2026, 9, 25), quote.NewExpiresAt);
    }

    [Fact]
    public void ExpiredSubscription_RestartsFromToday_NotFromOldExpiry()
    {
        var quote = SubscriptionCycle.BuildQuote(
            new DateOnly(2026, 7, 10), new DateOnly(2026, 5, 25), Monthly, months: 1, Day);

        Assert.Equal(new DateOnly(2026, 7, 10), quote.PeriodStart); // não cobra o passado
        Assert.Equal(15, quote.ProRataDays);
        Assert.Equal(new DateOnly(2026, 8, 25), quote.NewExpiresAt);
    }

    [Fact]
    public void ValidSubscription_ExtendsFromCurrentExpiry_KeepingPaidDays()
    {
        var quote = SubscriptionCycle.BuildQuote(
            new DateOnly(2026, 7, 10), new DateOnly(2026, 7, 30), Monthly, months: 1, Day);

        Assert.Equal(new DateOnly(2026, 7, 30), quote.PeriodStart);
        Assert.Equal(26, quote.ProRataDays);                        // 30/07 → 25/08
        Assert.Equal(new DateOnly(2026, 9, 25), quote.NewExpiresAt);
    }

    [Fact]
    public void StartingOnBillingDay_ChargesFullMonthsOnly()
    {
        var quote = SubscriptionCycle.BuildQuote(
            new DateOnly(2026, 7, 25), currentExpiry: null, Monthly, months: 3, Day);

        Assert.Equal(0, quote.ProRataDays);
        Assert.Equal(449.70m, quote.Total);
        Assert.Equal(new DateOnly(2026, 10, 25), quote.NewExpiresAt);
    }

    [Fact]
    public void TwelveMonths_LandsOnSameDayNextYear()
    {
        var quote = SubscriptionCycle.BuildQuote(
            new DateOnly(2026, 7, 25), currentExpiry: null, Monthly, months: 12, Day);
        Assert.Equal(new DateOnly(2027, 7, 25), quote.NewExpiresAt);
    }

    [Theory]
    [InlineData(2026, 1, 31, 30, 2026, 1, 30)]  // janeiro tem dia 30
    [InlineData(2026, 2, 10, 30, 2026, 2, 28)]  // fevereiro cai no último dia
    [InlineData(2028, 2, 10, 30, 2028, 2, 29)]  // ano bissexto
    public void BillingDateIn_ClampsToShortMonths(
        int y, int m, int d, int billingDay, int ey, int em, int ed)
    {
        var result = SubscriptionCycle.BillingDateIn(new DateOnly(y, m, d), billingDay);
        Assert.Equal(new DateOnly(ey, em, ed), result);
    }

    [Fact]
    public void ProRataUsesRealCycleLength_February()
    {
        // 10/02 → 25/02 = 15 dias, ciclo 25/01→25/02 = 31 dias
        var quote = SubscriptionCycle.BuildQuote(
            new DateOnly(2026, 2, 10), currentExpiry: null, Monthly, months: 1, Day);

        Assert.Equal(15, quote.ProRataDays);
        Assert.Equal(decimal.Round(Monthly * 15 / 31, 2), quote.ProRataAmount);
    }

    [Fact]
    public void DayBeforeBillingDay_ChargesOneSingleDay()
    {
        var quote = SubscriptionCycle.BuildQuote(
            new DateOnly(2026, 7, 24), currentExpiry: null, Monthly, months: 1, Day);

        Assert.Equal(1, quote.ProRataDays);
        Assert.True(quote.ProRataAmount < 10m);
        Assert.Equal(new DateOnly(2026, 8, 25), quote.NewExpiresAt);
    }

    [Fact]
    public void Today_ReturnsBrazilDate_NotUtcRollover()
    {
        // Às 23h de Brasília o UTC já virou o dia — Today() deve seguir Brasília
        var today = SubscriptionCycle.Today();
        var utc = DateOnly.FromDateTime(DateTime.UtcNow);
        Assert.True(today == utc || today == utc.AddDays(-1));
    }
}
