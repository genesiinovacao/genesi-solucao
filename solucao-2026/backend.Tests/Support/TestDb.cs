using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Solucao.Backend.Data;

namespace Solucao.Backend.Tests.Support;

/// <summary>
/// AppDbContext sobre o provider InMemory. Transações viram no-op
/// (TransactionIgnoredWarning suprimido) — suficiente para testar a lógica
/// dos controllers; o RLS/SQL real é coberto pelos scripts em database/.
/// </summary>
public static class TestDb
{
    public static AppDbContext Create()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"solucao-tests-{Guid.NewGuid()}")
            .ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning))
            .Options;
        return new AppDbContext(options);
    }
}
