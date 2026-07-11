using System.ComponentModel.DataAnnotations;

namespace Solucao.Backend.Models.Dtos.Ai;

public record AskRequest([Required] string Question);

public record AnswerDto(
    string Question,
    string Answer,
    string Intent,                // qual regra disparou (ex: "stock-status")
    IReadOnlyList<string>? Bullets, // info extra em bullets
    object? Data);                  // payload bruto, se útil para gráfico no front

public record QuickPromptDto(string Title, string Prompt, string Icon);
