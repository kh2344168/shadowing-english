namespace ShadowingEnglish.Api.DTOs.Curriculums;

public sealed class PublishGroupCurriculumRequest
{
    public string GroupName { get; set; } = string.Empty;
    public GroupCurriculumSnapshotDto? Snapshot { get; set; }
}

public sealed class GroupCurriculumSnapshotDto
{
    public string SourceCurriculumId { get; set; } = string.Empty;
    public string SourceCurriculumName { get; set; } = string.Empty;
    public int Version { get; set; } = 1;
    public IReadOnlyList<CurriculumWeekDto> Weeks { get; set; } = Array.Empty<CurriculumWeekDto>();
    public DateTime UpdatedAt { get; set; }
    public DateTime? PublishedAt { get; set; }
}

public sealed class CurriculumWeekDto
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int Order { get; set; }
    public IReadOnlyList<CurriculumDayDto> Days { get; set; } = Array.Empty<CurriculumDayDto>();
}

public sealed class CurriculumDayDto
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int Order { get; set; }
    public IReadOnlyList<CurriculumLessonSlotDto> LessonSlots { get; set; } = Array.Empty<CurriculumLessonSlotDto>();
}

public sealed class CurriculumLessonSlotDto
{
    public string Id { get; set; } = string.Empty;
    public string LessonId { get; set; } = string.Empty;
    public int RepetitionCount { get; set; } = 1;
    public bool Required { get; set; } = true;
    public int Order { get; set; }
}

public sealed record GroupPublicationVerificationDto(
    string GroupId,
    bool IsValid,
    int Version,
    int SlotCount,
    int DistinctLessonCount,
    IReadOnlyList<string> MissingLessonIds,
    IReadOnlyList<string> UnavailableLessonIds,
    DateTime CheckedAtUtc);
