namespace ShadowingEnglish.Api.DTOs.Curriculums;

public sealed record UpsertCurriculumRequest(
    string Id,
    string Name,
    string Description,
    string Status,
    string WeeksJson,
    DateTime? CreatedAtUtc);

public sealed record CurriculumLibraryDto(
    string Id,
    string Name,
    string Description,
    string Status,
    string WeeksJson,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc);
