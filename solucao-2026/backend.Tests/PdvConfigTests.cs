using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Solucao.Backend.Controllers;
using Solucao.Backend.Models.Dtos.Settings;
using Solucao.Backend.Models.Entities;
using Solucao.Backend.Services;
using Solucao.Backend.Tests.Support;
using Xunit;

namespace Solucao.Backend.Tests;

/// <summary>
/// Configuração do PDV pelo admin da loja: remapeamento de teclas (para quem
/// migra de outro sistema) e liberação de venda sem estoque.
/// </summary>
public class PdvConfigTests
{
    private static readonly Guid TenantId = Guid.NewGuid();

    private static (SettingsController controller, Data.AppDbContext db) Setup(string role = "admin")
    {
        var db = TestDb.Create();
        var ctx = new TenantContext();
        ctx.SetContext(TenantId, Guid.NewGuid(), role);

        db.Tenants.Add(new Tenant
        {
            Id = TenantId, Name = "Auto Peças Teste", Cnpj = "12345678000199",
            PlanType = "basic", TaxRegime = "simples_nacional",
        });
        db.SaveChanges();

        var config = new ConfigurationBuilder().AddInMemoryCollection().Build();
        var controller = new SettingsController(db, ctx, config);
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new Microsoft.AspNetCore.Http.DefaultHttpContext(),
        };
        return (controller, db);
    }

    private static UpdateTenantSettingsRequest Request(
        IReadOnlyDictionary<string, string>? shortcuts = null,
        bool? allowNoStock = null) => new(
            Name: "Auto Peças Teste",
            Phone: null, Email: null, Address: null,
            DailySalesTarget: 0m, MaxDiscountPercent: 0m,
            TaxRegime: "simples_nacional", LogoEmoji: null, LogoBase64: null,
            PdvShortcuts: shortcuts, AllowSaleWithoutStock: allowNoStock);

    [Fact]
    public async Task Update_StoresRemappedShortcuts()
    {
        var (controller, db) = Setup();

        var response = await controller.Update(
            Request(shortcuts: new Dictionary<string, string> { ["payment"] = "Insert" }), default);

        Assert.IsType<OkObjectResult>(response.Result);
        var saved = await db.Tenants.SingleAsync();
        Assert.Contains("Insert", saved.PdvShortcuts);
    }

    /// <summary>
    /// Letras e números são o que o leitor de código de barras "digita": virariam
    /// atalho a cada bipe. Só teclas de função e de controle entram.
    /// </summary>
    [Fact]
    public async Task Update_RejectsKeyOutsideAllowedList()
    {
        var (controller, db) = Setup();

        var response = await controller.Update(
            Request(shortcuts: new Dictionary<string, string> { ["payment"] = "A" }), default);

        Assert.IsType<BadRequestObjectResult>(response.Result);
        Assert.Null((await db.Tenants.SingleAsync()).PdvShortcuts);
    }

    /// <summary>Duas ações na mesma tecla deixariam uma delas inalcançável.</summary>
    [Fact]
    public async Task Update_RejectsDuplicateKey()
    {
        var (controller, db) = Setup();

        var response = await controller.Update(
            Request(shortcuts: new Dictionary<string, string>
            {
                ["payment"] = "F7",
                ["return"] = "F7",
            }), default);

        Assert.IsType<BadRequestObjectResult>(response.Result);
        Assert.Null((await db.Tenants.SingleAsync()).PdvShortcuts);
    }

    /// <summary>Dicionário vazio é o pedido explícito de voltar ao padrão.</summary>
    [Fact]
    public async Task Update_EmptyMapClearsCustomShortcuts()
    {
        var (controller, db) = Setup();
        await controller.Update(
            Request(shortcuts: new Dictionary<string, string> { ["payment"] = "Insert" }), default);

        await controller.Update(Request(shortcuts: new Dictionary<string, string>()), default);

        Assert.Null((await db.Tenants.SingleAsync()).PdvShortcuts);
    }

    [Fact]
    public async Task Update_TogglesSaleWithoutStock()
    {
        var (controller, db) = Setup();

        await controller.Update(Request(allowNoStock: true), default);
        Assert.True((await db.Tenants.SingleAsync()).AllowSaleWithoutStock);

        await controller.Update(Request(allowNoStock: false), default);
        Assert.False((await db.Tenants.SingleAsync()).AllowSaleWithoutStock);
    }

    /// <summary>
    /// Vender sem estoque é decisão de quem responde pela loja, não do caixa.
    /// </summary>
    [Fact]
    public async Task Update_IsRefusedForCashier()
    {
        var (controller, db) = Setup(role: "cashier");

        var response = await controller.Update(Request(allowNoStock: true), default);

        Assert.IsType<ForbidResult>(response.Result);
        Assert.False((await db.Tenants.SingleAsync()).AllowSaleWithoutStock);
    }

    /// <summary>
    /// JSON quebrado na coluna (edição manual, migração torta) não pode
    /// derrubar a tela de configurações inteira — cai no padrão.
    /// </summary>
    [Fact]
    public async Task Get_FallsBackToDefaultOnMalformedJson()
    {
        var (controller, db) = Setup();
        (await db.Tenants.SingleAsync()).PdvShortcuts = "{isto não é json";
        await db.SaveChangesAsync();

        var response = await controller.Get(default);

        var ok = Assert.IsType<OkObjectResult>(response.Result);
        Assert.Null(((TenantSettingsDto)ok.Value!).PdvShortcuts);
    }
}
