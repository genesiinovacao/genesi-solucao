using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using Solucao.Backend.Controllers;
using Solucao.Backend.Models.Dtos.Users;
using Solucao.Backend.Models.Entities;
using Solucao.Backend.Services;
using Solucao.Backend.Tests.Support;
using Xunit;

namespace Solucao.Backend.Tests;

public class UsersControllerTests
{
    private static readonly Guid TenantId = Guid.NewGuid();
    private static readonly Guid AdminId = Guid.NewGuid();

    private static (UsersController controller, Data.AppDbContext db) Setup(string role = "admin")
    {
        var db = TestDb.Create();
        var tenantCtx = new TenantContext();
        tenantCtx.SetContext(TenantId, AdminId, role);

        db.Users.Add(new User
        {
            Id = AdminId, TenantId = TenantId, Name = "Admin da Loja",
            Email = "admin@loja.com", PasswordHash = "x", Role = "admin", IsActive = true,
        });
        db.SaveChanges();

        return (new UsersController(db, tenantCtx, NullLogger<UsersController>.Instance), db);
    }

    private static User AddUser(Data.AppDbContext db, string role = "cashier", bool active = true)
    {
        var u = new User
        {
            Id = Guid.NewGuid(), TenantId = TenantId, Name = "Fulano",
            Email = $"{Guid.NewGuid():N}@loja.com", PasswordHash = "x", Role = role, IsActive = active,
        };
        db.Users.Add(u);
        db.SaveChanges();
        return u;
    }

    [Fact]
    public async Task List_ForbidsNonAdmin()
    {
        var (controller, _) = Setup(role: "cashier");
        var response = await controller.List(default);
        Assert.IsType<ForbidResult>(response.Result);
    }

    [Fact]
    public async Task Create_RejectsUnknownRole()
    {
        var (controller, _) = Setup();
        var response = await controller.Create(
            new CreateUserRequest("Novo", "novo@loja.com", "123456", "superadmin"), default);
        Assert.IsType<BadRequestObjectResult>(response.Result);
    }

    [Fact]
    public async Task Update_BlocksSelfDeactivation()
    {
        var (controller, db) = Setup();
        var response = await controller.Update(AdminId,
            new UpdateUserRequest("Admin da Loja", "admin", IsActive: false), default);

        Assert.IsType<BadRequestObjectResult>(response.Result);
        Assert.True(db.Users.Find(AdminId)!.IsActive);
    }

    [Fact]
    public async Task Update_BlocksSelfDemotion()
    {
        var (controller, _) = Setup();
        var response = await controller.Update(AdminId,
            new UpdateUserRequest("Admin da Loja", "cashier", IsActive: true), default);
        Assert.IsType<BadRequestObjectResult>(response.Result);
    }

    [Fact]
    public async Task Update_BlocksDeactivatingLastActiveAdmin()
    {
        var (controller, db) = Setup();
        // O único outro admin está inativo — o alvo é o último admin ativo.
        var target = AddUser(db, role: "admin");
        db.Users.Find(AdminId)!.IsActive = false;
        db.SaveChanges();

        var response = await controller.Update(target.Id,
            new UpdateUserRequest("Fulano", "admin", IsActive: false), default);
        Assert.IsType<BadRequestObjectResult>(response.Result);
    }

    [Fact]
    public async Task Update_DeactivationRevokesRefreshTokens()
    {
        var (controller, db) = Setup();
        var target = AddUser(db);
        db.RefreshTokens.Add(new RefreshToken
        {
            Id = Guid.NewGuid(), UserId = target.Id, TenantId = TenantId,
            TokenHash = "h", ExpiresAt = DateTime.UtcNow.AddDays(7),
        });
        db.SaveChanges();

        var response = await controller.Update(target.Id,
            new UpdateUserRequest("Fulano", "cashier", IsActive: false), default);

        var dto = Assert.IsType<TeamUserDto>(Assert.IsType<OkObjectResult>(response.Result).Value);
        Assert.False(dto.IsActive);
        Assert.All(db.RefreshTokens.Where(t => t.UserId == target.Id), t => Assert.NotNull(t.RevokedAt));
    }

    [Fact]
    public async Task ResetPassword_ChangesHashAndRevokesSessions()
    {
        var (controller, db) = Setup();
        var target = AddUser(db);
        var oldHash = target.PasswordHash;
        db.RefreshTokens.Add(new RefreshToken
        {
            Id = Guid.NewGuid(), UserId = target.Id, TenantId = TenantId,
            TokenHash = "h", ExpiresAt = DateTime.UtcNow.AddDays(7),
        });
        db.SaveChanges();

        var response = await controller.ResetPassword(target.Id, new ResetPasswordRequest("novaSenha123"), default);

        Assert.IsType<OkObjectResult>(response.Result);
        var updated = db.Users.Find(target.Id)!;
        Assert.NotEqual(oldHash, updated.PasswordHash);
        Assert.True(BCrypt.Net.BCrypt.Verify("novaSenha123", updated.PasswordHash));
        Assert.All(db.RefreshTokens.Where(t => t.UserId == target.Id), t => Assert.NotNull(t.RevokedAt));
    }

    [Fact]
    public async Task ResetPassword_ForbidsNonAdmin()
    {
        var (controller, db) = Setup(role: "manager");
        var target = AddUser(db);
        var response = await controller.ResetPassword(target.Id, new ResetPasswordRequest("novaSenha123"), default);
        Assert.IsType<ForbidResult>(response.Result);
    }
}
