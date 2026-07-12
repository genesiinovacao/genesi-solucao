// Executa um arquivo .sql (ou um comando -c "...") contra um Postgres.
// Útil quando não há psql/docker na máquina (ex.: aplicar migração no Neon):
//   dotnet run --project tools/SqlRun -- "<connection string>" database/10_x.sql
//   dotnet run --project tools/SqlRun -- "<connection string>" -c "SELECT 1"
using Npgsql;

if (args.Length < 2)
{
    Console.Error.WriteLine("uso: SqlRun <connection-string> <arquivo.sql | -c \"comando\">");
    return 1;
}

var sql = args[1] == "-c" && args.Length >= 3
    ? args[2]
    : File.ReadAllText(args[1]);

await using var conn = new NpgsqlConnection(args[0]);
await conn.OpenAsync();

await using var cmd = new NpgsqlCommand(sql, conn);
cmd.CommandTimeout = 120;

await using var reader = await cmd.ExecuteReaderAsync();
do
{
    while (await reader.ReadAsync())
    {
        var cols = new string[reader.FieldCount];
        for (int i = 0; i < reader.FieldCount; i++)
            cols[i] = reader.IsDBNull(i) ? "NULL" : reader.GetValue(i)?.ToString() ?? "";
        Console.WriteLine(string.Join(" | ", cols));
    }
} while (await reader.NextResultAsync());

Console.WriteLine("OK");
return 0;
