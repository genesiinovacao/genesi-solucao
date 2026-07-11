using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Solucao.Backend.Controllers;
using Solucao.Backend.Models.Dtos.Auth;
using Solucao.Backend.Services;
using Solucao.Backend.Tests.Support;
using Xunit;

namespace Solucao.Backend.Tests;

public class AuthRegisterValidationTests
{
    private static AuthController Controller()
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:Issuer"] = "solucao-backend",
            ["Jwt:Audience"] = "solucao-clients",
            ["Jwt:Key"] = "0123456789abcdef0123456789abcdef-unit-test",
        }).Build();

        return new AuthController(TestDb.Create(), new JwtService(config), config, NullLogger<AuthController>.Instance);
    }

    [Theory]
    [InlineData("123")]                    // curto demais
    [InlineData("12.345.678/0001")]        // incompleto
    [InlineData("123456780001901234")]     // longo demais
    public async Task Register_RejectsInvalidCnpj(string cnpj)
    {
        var controller = Controller();
        var req = new RegisterRequest("Mercado Novo", cnpj, "Maria", "maria@teste.com", "123456");

        var response = await controller.Register(req, default);

        Assert.IsType<BadRequestObjectResult>(response.Result);
    }
}
