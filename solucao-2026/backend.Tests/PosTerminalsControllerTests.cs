using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using Solucao.Backend.Controllers;
using Solucao.Backend.Models.Entities;
using Solucao.Backend.Services;
using Solucao.Backend.Tests.Support;
using Xunit;

namespace Solucao.Backend.Tests;

public class PosTerminalsControllerTests
{
    private static readonly Guid TenantId = Guid.NewGuid();

    private static (PosTerminalsController controller, Data.AppDbContext db) Setup(string role = "admin", int maxTerminals = 2)
    {
        var db = TestDb.Create();
        var tenantCtx = new TenantContext();
        tenantCtx.SetContext(TenantId, Guid.NewGuid(), role);

        db.Tenants.Add(new Tenant { Id = TenantId, Name = "Loja", Cnpj = "11222333000144", MaxPosTerminals = maxTerminals });
        db.SaveChanges();

        return (new PosTerminalsController(db, tenantCtx, NullLogger<PosTerminalsController>.Instance), db);
    }

    private static PosTerminal AddTerminal(Data.AppDbContext db)
    {
        var t = new PosTerminal
        {
            Id = Guid.NewGuid(), TenantId = TenantId, TerminalKey = Guid.NewGuid().ToString("N"),
            Name = "Caixa 1", LastSeenAt = DateTime.UtcNow, CreatedAt = DateTime.UtcNow,
        };
        db.PosTerminals.Add(t);
        db.SaveChanges();
        return t;
    }

    [Fact]
    public async Task List_ReturnsUsageAgainstLimit()
    {
        var (controller, db) = Setup(maxTerminals: 3);
        AddTerminal(db);
        AddTerminal(db);

        var response = await controller.List(default);
        var dto = Assert.IsType<PosTerminalsController.TerminalListResponse>(
            Assert.IsType<OkObjectResult>(response.Result).Value);

        Assert.Equal(2, dto.Used);
        Assert.Equal(3, dto.Max);
        Assert.Equal(2, dto.Items.Count);
    }

    [Fact]
    public async Task List_ForbidsNonAdmin()
    {
        var (controller, _) = Setup(role: "cashier");
        var response = await controller.List(default);
        Assert.IsType<ForbidResult>(response.Result);
    }

    [Fact]
    public async Task Delete_FreesLicenseSlot()
    {
        var (controller, db) = Setup();
        var terminal = AddTerminal(db);

        var response = await controller.Delete(terminal.Id, default);

        Assert.IsType<NoContentResult>(response);
        Assert.Null(db.PosTerminals.Find(terminal.Id));
    }

    [Fact]
    public async Task Delete_ForbidsNonAdmin()
    {
        var (controller, db) = Setup(role: "cashier");
        var terminal = AddTerminal(db);
        var response = await controller.Delete(terminal.Id, default);
        Assert.IsType<ForbidResult>(response);
        Assert.NotNull(db.PosTerminals.Find(terminal.Id));
    }
}
