using BCrypt.Net;
using Xunit;

namespace Solucao.Backend.Tests;

/// <summary>
/// Hash quebrado no banco não pode virar 500 no login.
///
/// Aconteceu em produção: o cupom da tela dizia "Falha ao entrar, verifique o
/// backend" porque o BCrypt lançava e a resposta saía 500 sem corpo — mandando
/// procurar defeito na infraestrutura quando o problema era um password_hash
/// gravado errado. O teste documenta quais formatos fazem o BCrypt lançar,
/// para a proteção do AuthController não ser removida por engano.
/// </summary>
public class LoginRobustnessTests
{
    [Theory]
    [InlineData("")]                                   // coluna vazia
    [InlineData("senha-em-texto-puro")]                // senha no lugar do hash
    [InlineData("$2a$11$curtoDemais")]                 // hash truncado
    [InlineData("$9z$11$nggaPhW3fCo5V5Xd.pbxS.OjuAWNMN5MWjKzey1ZbFJVaw45gGcNm")] // versão inválida
    public void Verify_ThrowsOnMalformedHash(string stored)
    {
        Assert.ThrowsAny<Exception>(() => BCrypt.Net.BCrypt.Verify("qualquer", stored));
    }

    [Fact]
    public void Verify_WorksOnWellFormedHash()
    {
        var hash = BCrypt.Net.BCrypt.HashPassword("SenhaBoa123", 11);

        // 60 caracteres é o tamanho de um BCrypt válido — é o que o SELECT de
        // diagnóstico confere quando alguém não consegue entrar.
        Assert.Equal(60, hash.Length);
        Assert.StartsWith("$2a$11$", hash);
        Assert.True(BCrypt.Net.BCrypt.Verify("SenhaBoa123", hash));
        Assert.False(BCrypt.Net.BCrypt.Verify("SenhaErrada", hash));
    }
}
