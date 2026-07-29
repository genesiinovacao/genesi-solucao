using Microsoft.AspNetCore.Mvc;
using Solucao.Backend.Controllers;
using Solucao.Backend.Models.Dtos.Cash;
using Solucao.Backend.Models.Entities;
using Solucao.Backend.Services;
using Solucao.Backend.Tests.Support;
using Xunit;

namespace Solucao.Backend.Tests;

/// <summary>
/// Sangria tira dinheiro do caixa: o operador só faz com aval de um
/// supervisor. Suprimento (entrada de troco) ele faz sozinho.
/// </summary>
public class CashWithdrawTests
{
    private static readonly Guid TenantId = Guid.NewGuid();

    private static (CashSessionsController controller, Data.AppDbContext db, CashSession session) Setup(string role)
    {
        var db = TestDb.Create();
        var ctx = new TenantContext();
        var userId = Guid.NewGuid();
        ctx.SetContext(TenantId, userId, role);

        var session = new CashSession
        {
            Id = Guid.NewGuid(), TenantId = TenantId, UserId = userId,
            OpenedAt = DateTime.UtcNow, OpeningAmount = 200m,
        };
        db.CashSessions.Add(session);
        db.Users.Add(new User
        {
            Id = Guid.NewGuid(), TenantId = TenantId, Name = "Gerente", Email = "g@loja.com",
            PasswordHash = "x", Role = "manager", IsActive = true,
            OperatorCode = "99", PinHash = BCrypt.Net.BCrypt.HashPassword("4321"),
        });
        db.SaveChanges();

        var controller = new CashSessionsController(
            db, ctx, new OperatorAuthService(db), new FakeAudit());
        return (controller, db, session);
    }

    [Fact]
    public async Task Cashier_CannotWithdrawWithoutSupervisor()
    {
        var (controller, db, session) = Setup("cashier");

        var response = await controller.AddMovement(session.Id,
            new CashMovementRequest("withdraw", 100m, "Pagamento fornecedor"), default);

        var result = Assert.IsType<ObjectResult>(response.Result);
        Assert.Equal(403, result.StatusCode);
        Assert.Empty(db.CashMovements);
    }

    [Fact]
    public async Task Cashier_WithdrawsWithValidSupervisorPin()
    {
        var (controller, db, session) = Setup("cashier");

        var response = await controller.AddMovement(session.Id,
            new CashMovementRequest("withdraw", 100m, "Pagamento fornecedor", "99", "4321"), default);

        Assert.IsType<OkObjectResult>(response.Result);
        var movement = Assert.Single(db.CashMovements);
        Assert.Equal("withdraw", movement.Type);
        Assert.Contains("Gerente", movement.Reason);   // fica registrado quem liberou
    }

    [Fact]
    public async Task Cashier_CannotWithdrawWithWrongPin()
    {
        var (controller, db, session) = Setup("cashier");

        var response = await controller.AddMovement(session.Id,
            new CashMovementRequest("withdraw", 100m, "Motivo", "99", "0000"), default);

        Assert.Equal(403, Assert.IsType<ObjectResult>(response.Result).StatusCode);
        Assert.Empty(db.CashMovements);
    }

    [Fact]
    public async Task Cashier_CanSupplyWithoutSupervisor()
    {
        var (controller, db, session) = Setup("cashier");

        var response = await controller.AddMovement(session.Id,
            new CashMovementRequest("supply", 50m, "Reforço de troco"), default);

        Assert.IsType<OkObjectResult>(response.Result);
        Assert.Single(db.CashMovements);
    }

    [Theory]
    [InlineData("admin")]
    [InlineData("manager")]
    public async Task SupervisorRoles_WithdrawDirectly(string role)
    {
        var (controller, db, session) = Setup(role);

        var response = await controller.AddMovement(session.Id,
            new CashMovementRequest("withdraw", 100m, "Depósito bancário"), default);

        Assert.IsType<OkObjectResult>(response.Result);
        Assert.Single(db.CashMovements);
    }
}
