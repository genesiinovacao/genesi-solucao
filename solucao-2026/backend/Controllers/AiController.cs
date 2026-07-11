using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Solucao.Backend.Data;
using Solucao.Backend.Models.Dtos.Ai;

namespace Solucao.Backend.Controllers;

/// <summary>
/// Rule-based assistant ("SOLUÇÃO IA"). Inspects the question for keywords and
/// runs the matching analytics query against the DB. No external LLM yet —
/// keeps the v1.0 behavior and avoids per-request cost.
///
/// Future: add a /api/ai/llm endpoint that proxies to Claude/OpenAI with the
/// same data snapshot in the system prompt.
/// </summary>
[ApiController]
[Authorize]
[Route("api/ai")]
public class AiController : ControllerBase
{
    private readonly AppDbContext _db;
    public AiController(AppDbContext db) => _db = db;

    [HttpGet("quick-prompts")]
    public ActionResult<IReadOnlyList<QuickPromptDto>> QuickPrompts() => Ok(new List<QuickPromptDto>
    {
        new("Estoque crítico",         "Quais produtos estão com estoque crítico?",     "📦"),
        new("Vendas hoje",             "Qual o faturamento de hoje?",                   "💰"),
        new("Top produtos",            "Quais são os produtos mais vendidos?",          "🏆"),
        new("Top clientes",            "Quais clientes compraram mais?",                "🥇"),
        new("Margem média",            "Qual é minha margem de lucro média?",           "📊"),
        new("Contas a pagar",          "Tenho contas pendentes?",                       "⏳"),
        new("Promoções ativas",        "Quais promoções estão ativas?",                 "🏷️"),
        new("Delivery em andamento",   "Quantos pedidos de delivery estão pendentes?", "🚴"),
        new("Sugestão de reposição",   "Quais produtos eu devo repor?",                 "🔄"),
        new("Análise completa",        "Me dê a análise completa do mês.",             "📈"),
    });

    [HttpPost("ask")]
    public async Task<ActionResult<AnswerDto>> Ask([FromBody] AskRequest req, CancellationToken ct)
    {
        var q = Normalize(req.Question ?? "");
        if (q.Length == 0) return Ok(new AnswerDto(req.Question, "Faça uma pergunta sobre seu negócio.", "empty", null, null));

        // ----- Stock -----
        if (Any(q, "estoque", "critico", "baixo", "repor", "reposicao", "falta"))
            return Ok(await StockAlertAsync(req.Question, ct));

        // ----- Top (specific first — wins over the broader "vendas") -----
        if (Any(q, "mais vendid", "top produto", "produtos mais"))
            return Ok(await TopProductsAsync(req.Question, ct));
        if (All(q, "top", "client") || Any(q, "melhores clientes", "compraram mais", "clientes que compraram"))
            return Ok(await TopCustomersAsync(req.Question, ct));

        // ----- Sales week (must check BEFORE today, since "semana" is more specific) -----
        if (Any(q, "semana", "comparativ", "ultima semana"))
            return Ok(await SalesWeekAsync(req.Question, ct));

        // ----- Sales today -----
        if (Any(q, "faturamento", "vendas hoje", "vendi hoje", "venda hoje") || All(q, "hoje", "venda"))
            return Ok(await SalesTodayAsync(req.Question, ct));

        // ----- Finance -----
        if (Any(q, "margem", "lucro"))
            return Ok(await MarginAsync(req.Question, ct));
        if (Any(q, "pendent", "pagar", "contas", "vencendo"))
            return Ok(await PendingPayablesAsync(req.Question, ct));

        // ----- Promotions -----
        if (Any(q, "promoc", "desconto"))
            return Ok(await ActivePromotionsAsync(req.Question, ct));

        // ----- Delivery -----
        if (Any(q, "delivery", "entrega", "pedido"))
            return Ok(await DeliveryStatusAsync(req.Question, ct));

        // ----- Full month -----
        if (Any(q, "analise", "resumo do mes", "completa", "mes inteiro"))
            return Ok(await MonthOverviewAsync(req.Question, ct));

        // Generic "vendas" → today
        if (q.Contains("vendas") || q.Contains("vendi"))
            return Ok(await SalesTodayAsync(req.Question, ct));

        // Fallback
        return Ok(new AnswerDto(
            req.Question,
            "Hmm, não entendi exatamente. Tente perguntar sobre estoque, vendas, faturamento, margem, clientes, promoções ou delivery.",
            "unknown", null, null));
    }

    // Lowercase + remove acentos pra que "crítico" e "critico" batam igual.
    private static string Normalize(string s)
    {
        var lower = s.ToLowerInvariant().Trim();
        var sb = new System.Text.StringBuilder(lower.Length);
        foreach (var c in lower.Normalize(System.Text.NormalizationForm.FormD))
            if (System.Globalization.CharUnicodeInfo.GetUnicodeCategory(c) != System.Globalization.UnicodeCategory.NonSpacingMark)
                sb.Append(c);
        return sb.ToString();
    }

    private static bool Any(string q, params string[] tokens) => tokens.Any(t => q.Contains(t));
    private static bool All(string q, params string[] tokens) => tokens.All(t => q.Contains(t));

    // =====================================================================
    // Intents
    // =====================================================================

    private async Task<AnswerDto> StockAlertAsync(string question, CancellationToken ct)
    {
        var critical = await _db.Products.AsNoTracking()
            .Where(p => p.IsActive && p.StockQuantity <= p.MinStock)
            .OrderBy(p => p.StockQuantity)
            .Select(p => new { p.Id, p.Name, p.StockQuantity, p.MinStock, p.Emoji })
            .Take(20).ToListAsync(ct);

        if (critical.Count == 0)
            return new AnswerDto(question, "✅ Tudo certo! Nenhum produto está abaixo do mínimo no momento.",
                "stock-status", null, new { count = 0 });

        var bullets = critical.Select(p => $"{p.Emoji} {p.Name} — {p.StockQuantity} / mín {p.MinStock}").ToList();
        return new AnswerDto(question,
            $"⚠️ Tenho {critical.Count} produto(s) com estoque baixo. Veja a lista abaixo — comece a reposição pelos primeiros.",
            "stock-critical", bullets, critical);
    }

    private async Task<AnswerDto> SalesTodayAsync(string question, CancellationToken ct)
    {
        var today = DateTime.UtcNow.Date;
        var sales = await _db.Sales.AsNoTracking()
            .Where(s => s.Status == "completed" && s.SaleDate >= today && s.SaleDate < today.AddDays(1))
            .Select(s => s.TotalAmount).ToListAsync(ct);

        var yesterday = await _db.Sales.AsNoTracking()
            .Where(s => s.Status == "completed" && s.SaleDate >= today.AddDays(-1) && s.SaleDate < today)
            .SumAsync(s => (decimal?)s.TotalAmount, ct) ?? 0m;

        var total = sales.Sum();
        var count = sales.Count;
        var avg = count > 0 ? total / count : 0m;
        var change = yesterday > 0 ? (total - yesterday) / yesterday * 100m : 0m;

        return new AnswerDto(question,
            $"💰 Hoje foram **{count}** venda(s) somando **{Brl(total)}** · ticket médio **{Brl(avg)}**.",
            "sales-today",
            new List<string>
            {
                $"Ontem: {Brl(yesterday)}",
                yesterday > 0 ? $"Variação: {(change >= 0 ? "+" : "")}{change:0.#}%" : "Sem comparativo (ontem zerado).",
            },
            new { total, count, avg, yesterday, changePercent = change });
    }

    private async Task<AnswerDto> SalesWeekAsync(string question, CancellationToken ct)
    {
        var today = DateTime.UtcNow.Date;
        var weekStart = today.AddDays(-6);
        var prevStart = weekStart.AddDays(-7);

        var thisWeek = await _db.Sales.AsNoTracking()
            .Where(s => s.Status == "completed" && s.SaleDate >= weekStart && s.SaleDate < today.AddDays(1))
            .SumAsync(s => (decimal?)s.TotalAmount, ct) ?? 0m;
        var lastWeek = await _db.Sales.AsNoTracking()
            .Where(s => s.Status == "completed" && s.SaleDate >= prevStart && s.SaleDate < weekStart)
            .SumAsync(s => (decimal?)s.TotalAmount, ct) ?? 0m;

        var change = lastWeek > 0 ? (thisWeek - lastWeek) / lastWeek * 100m : 0m;
        return new AnswerDto(question,
            $"📊 Última semana: **{Brl(thisWeek)}**. Semana anterior: **{Brl(lastWeek)}**.",
            "sales-week",
            new List<string>
            {
                lastWeek > 0
                    ? (change >= 0 ? $"📈 Crescemos {change:0.#}%" : $"📉 Caímos {Math.Abs(change):0.#}%")
                    : "Sem comparativo (semana anterior zerada).",
            },
            new { thisWeek, lastWeek, changePercent = change });
    }

    private async Task<AnswerDto> TopProductsAsync(string question, CancellationToken ct)
    {
        var fromDt = DateTime.SpecifyKind(DateTime.UtcNow.Date.AddDays(-29), DateTimeKind.Utc);
        var saleIds = await _db.Sales.AsNoTracking()
            .Where(s => s.Status == "completed" && s.SaleDate >= fromDt)
            .Select(s => s.Id).ToListAsync(ct);

        if (saleIds.Count == 0)
            return new AnswerDto(question, "Ainda não há vendas no período pra ranquear produtos.", "top-products", null, null);

        var top = await _db.SaleItems.AsNoTracking()
            .Where(si => saleIds.Contains(si.SaleId))
            .GroupBy(si => si.ProductName)
            .Select(g => new { Name = g.Key, Qty = g.Sum(x => x.Quantity), Revenue = g.Sum(x => x.TotalPrice) })
            .OrderByDescending(x => x.Revenue).Take(5).ToListAsync(ct);

        var bullets = top.Select((p, i) => $"#{i + 1} {p.Name} — {p.Qty} un · {Brl(p.Revenue)}").ToList();
        return new AnswerDto(question, $"🏆 Top 5 produtos por faturamento (últimos 30 dias):",
            "top-products", bullets, top);
    }

    private async Task<AnswerDto> TopCustomersAsync(string question, CancellationToken ct)
    {
        var top = await _db.Customers.AsNoTracking()
            .Where(c => c.Status == "active" && c.TotalSpent > 0)
            .OrderByDescending(c => c.TotalSpent).Take(5)
            .Select(c => new { c.Name, c.TotalSpent, c.LoyaltyPoints }).ToListAsync(ct);

        if (top.Count == 0)
            return new AnswerDto(question, "Nenhum cliente com compra registrada ainda.", "top-customers", null, null);

        var bullets = top.Select((c, i) => $"#{i + 1} {c.Name} — {Brl(c.TotalSpent)} · {c.LoyaltyPoints} pts").ToList();
        return new AnswerDto(question, "🥇 Top 5 clientes por gasto total:", "top-customers", bullets, top);
    }

    private async Task<AnswerDto> MarginAsync(string question, CancellationToken ct)
    {
        var products = await _db.Products.AsNoTracking()
            .Where(p => p.IsActive && p.CostPrice > 0)
            .Select(p => new { p.CostPrice, p.SalePrice }).ToListAsync(ct);

        if (products.Count == 0)
            return new AnswerDto(question, "Sem produtos com preço de custo cadastrado.", "margin", null, null);

        var avg = products.Average(p => (p.SalePrice - p.CostPrice) / p.CostPrice * 100m);
        return new AnswerDto(question,
            $"📊 Sua margem média é de **{avg:0.##}%** sobre o preço de custo, considerando {products.Count} produto(s) ativo(s).",
            "margin", null, new { averageMargin = avg });
    }

    private async Task<AnswerDto> PendingPayablesAsync(string question, CancellationToken ct)
    {
        var items = await _db.FinancialTransactions.AsNoTracking()
            .Where(t => t.Type == "expense" && t.Status == "pending")
            .OrderBy(t => t.DueDate ?? t.TransactionDate)
            .Select(t => new { t.Description, t.Amount, t.DueDate, t.TransactionDate }).ToListAsync(ct);

        if (items.Count == 0)
            return new AnswerDto(question, "✅ Nenhuma despesa pendente. Está em dia!", "pending-payables", null, null);

        var total = items.Sum(x => x.Amount);
        var bullets = items.Take(10).Select(t =>
            $"{t.Description} — {Brl(t.Amount)} (vence {(t.DueDate ?? t.TransactionDate):dd/MM})").ToList();

        return new AnswerDto(question,
            $"⏳ Você tem {items.Count} despesa(s) pendente(s) somando **{Brl(total)}**.",
            "pending-payables", bullets, new { items, total });
    }

    private async Task<AnswerDto> ActivePromotionsAsync(string question, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var active = await _db.Promotions.AsNoTracking()
            .Where(p => p.IsActive && p.StartsAt <= today && p.EndsAt >= today)
            .OrderByDescending(p => p.DiscountPercent)
            .Select(p => new { p.Name, p.DiscountPercent, p.TargetType, p.TargetValue, p.EndsAt }).ToListAsync(ct);

        if (active.Count == 0)
            return new AnswerDto(question, "Nenhuma promoção ativa no momento. Que tal criar uma?", "promotions", null, null);

        var bullets = active.Select(p =>
            $"🏷️ {p.Name} — {p.DiscountPercent}% off ({p.TargetType}{(p.TargetValue != null ? $": {p.TargetValue}" : "")}) · até {p.EndsAt:dd/MM}").ToList();

        return new AnswerDto(question,
            $"🏷️ {active.Count} promoção(ões) ativa(s) agora:",
            "promotions-active", bullets, active);
    }

    private async Task<AnswerDto> DeliveryStatusAsync(string question, CancellationToken ct)
    {
        var orders = await _db.DeliveryOrders.AsNoTracking()
            .Where(d => d.Status == "pending" || d.Status == "preparing" || d.Status == "out_for_delivery")
            .Select(d => new { d.OrderNumber, d.CustomerName, d.Status, d.TotalAmount }).ToListAsync(ct);

        if (orders.Count == 0)
            return new AnswerDto(question, "✅ Nenhum pedido de delivery em andamento.", "delivery", null, null);

        var by = orders.GroupBy(o => o.Status).ToDictionary(g => g.Key, g => g.Count());
        var bullets = orders.Take(10).Select(o =>
            $"{o.OrderNumber} {o.CustomerName} — {Brl(o.TotalAmount)} ({o.Status})").ToList();

        return new AnswerDto(question,
            $"🚴 {orders.Count} pedido(s) em andamento: " +
            $"{by.GetValueOrDefault("pending", 0)} pendente(s), " +
            $"{by.GetValueOrDefault("preparing", 0)} no preparo, " +
            $"{by.GetValueOrDefault("out_for_delivery", 0)} em rota.",
            "delivery", bullets, new { orders, byStatus = by });
    }

    private async Task<AnswerDto> MonthOverviewAsync(string question, CancellationToken ct)
    {
        var today = DateTime.UtcNow.Date;
        var monthStart = new DateTime(today.Year, today.Month, 1, 0, 0, 0, DateTimeKind.Utc);

        var sales = await _db.Sales.AsNoTracking()
            .Where(s => s.Status == "completed" && s.SaleDate >= monthStart)
            .Select(s => s.TotalAmount).ToListAsync(ct);

        var income = await _db.FinancialTransactions.AsNoTracking()
            .Where(t => t.Type == "income" && t.Status == "paid" && t.TransactionDate >= DateOnly.FromDateTime(monthStart))
            .SumAsync(t => (decimal?)t.Amount, ct) ?? 0m;
        var expense = await _db.FinancialTransactions.AsNoTracking()
            .Where(t => t.Type == "expense" && t.Status == "paid" && t.TransactionDate >= DateOnly.FromDateTime(monthStart))
            .SumAsync(t => (decimal?)t.Amount, ct) ?? 0m;

        var totalSales = sales.Sum();
        var lowStock = await _db.Products.AsNoTracking().CountAsync(p => p.IsActive && p.StockQuantity <= p.MinStock, ct);

        return new AnswerDto(question,
            $"📈 Resumo do mês até hoje: faturamento de vendas **{Brl(totalSales)}** em {sales.Count} venda(s).",
            "month-overview",
            new List<string>
            {
                $"💵 Receitas no caixa: {Brl(income)}",
                $"💸 Despesas pagas: {Brl(expense)}",
                $"✅ Resultado: {Brl(income - expense)}",
                $"⚠️ {lowStock} produto(s) com estoque crítico — atenção!",
            },
            new { totalSales, salesCount = sales.Count, income, expense, lowStock });
    }

    private static string Brl(decimal v) => v.ToString("C2", new System.Globalization.CultureInfo("pt-BR"));
}
