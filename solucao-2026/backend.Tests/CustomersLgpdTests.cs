using Microsoft.AspNetCore.Mvc;
using Solucao.Backend.Controllers;
using Solucao.Backend.Models.Dtos.Customers;
using Solucao.Backend.Models.Entities;
using Solucao.Backend.Services;
using Solucao.Backend.Tests.Support;
using Xunit;

namespace Solucao.Backend.Tests;

public class CustomersLgpdTests
{
    private static readonly Guid TenantId = Guid.NewGuid();

    private static (CustomersController controller, Data.AppDbContext db, FakeAudit audit) Setup(string role = "admin")
    {
        var db = TestDb.Create();
        var tenantCtx = new TenantContext();
        tenantCtx.SetContext(TenantId, Guid.NewGuid(), role);
        var audit = new FakeAudit();
        return (new CustomersController(db, tenantCtx, audit), db, audit);
    }

    private static Customer AddCustomer(Data.AppDbContext db)
    {
        var c = new Customer
        {
            Id = Guid.NewGuid(), TenantId = TenantId, Name = "Maria Souza",
            TaxId = "123.456.789-00", Email = "maria@exemplo.com", Phone = "11999998888",
            Address = "Rua das Flores, 100", BirthDate = new DateOnly(1990, 5, 20),
            Notes = "Prefere entrega à tarde", LoyaltyPoints = 320, TotalSpent = 1580.50m,
        };
        db.Customers.Add(c);
        db.SaveChanges();
        return c;
    }

    [Fact]
    public async Task Anonymize_ErasesPersonalDataButKeepsSalesHistory()
    {
        var (controller, db, audit) = Setup();
        var customer = AddCustomer(db);
        db.Sales.Add(new Sale
        {
            Id = Guid.NewGuid(), TenantId = TenantId, CustomerId = customer.Id,
            SaleDate = DateTime.UtcNow.AddDays(-5), TotalAmount = 250m,
        });
        db.SaveChanges();

        var response = await controller.Anonymize(customer.Id, default);
        Assert.IsType<OkObjectResult>(response.Result);

        var after = db.Customers.Find(customer.Id)!;
        Assert.Null(after.TaxId);
        Assert.Null(after.Email);
        Assert.Null(after.Phone);
        Assert.Null(after.Address);
        Assert.Null(after.BirthDate);
        Assert.Null(after.Notes);
        Assert.DoesNotContain("Maria", after.Name);
        Assert.Equal("anonymized", after.Status);
        Assert.NotNull(after.AnonymizedAt);

        // A venda continua íntegra — guarda fiscal
        Assert.Single(db.Sales.Where(s => s.CustomerId == customer.Id));
        Assert.Equal(1580.50m, after.TotalSpent);
        Assert.True(audit.Logged("customer.anonymize"));
    }

    [Fact]
    public async Task Anonymize_IsRejectedTwice()
    {
        var (controller, db, _) = Setup();
        var customer = AddCustomer(db);

        await controller.Anonymize(customer.Id, default);
        var second = await controller.Anonymize(customer.Id, default);

        Assert.IsType<BadRequestObjectResult>(second.Result);
    }

    [Fact]
    public async Task Anonymize_ForbiddenForManager()
    {
        // Eliminação definitiva é ato do admin da loja, não do gerente
        var (controller, db, _) = Setup(role: "manager");
        var customer = AddCustomer(db);

        var response = await controller.Anonymize(customer.Id, default);
        Assert.IsType<ForbidResult>(response.Result);
        Assert.Equal("Maria Souza", db.Customers.Find(customer.Id)!.Name);
    }

    [Fact]
    public async Task ExportPersonalData_ReturnsEverythingAndIsAudited()
    {
        var (controller, db, audit) = Setup();
        var customer = AddCustomer(db);
        db.Sales.Add(new Sale
        {
            Id = Guid.NewGuid(), TenantId = TenantId, CustomerId = customer.Id,
            SaleDate = DateTime.UtcNow, TotalAmount = 99.90m,
        });
        db.SaveChanges();

        var response = await controller.ExportPersonalData(customer.Id, default);
        var export = Assert.IsType<CustomersController.PersonalDataExport>(
            Assert.IsType<OkObjectResult>(response.Result).Value);

        Assert.Single(export.Compras);
        Assert.NotNull(export.Cadastro);
        Assert.True(audit.Logged("customer.personal_data_export"));
    }

    [Fact]
    public async Task Delete_IsAuditedAsDeactivation()
    {
        var (controller, db, audit) = Setup();
        var customer = AddCustomer(db);

        await controller.Delete(customer.Id, default);

        Assert.Equal("inactive", db.Customers.Find(customer.Id)!.Status);
        Assert.True(audit.Logged("customer.deactivate"));
    }
}
