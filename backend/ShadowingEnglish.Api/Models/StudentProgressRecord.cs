namespace ShadowingEnglish.Api.Models;

public sealed class StudentProgressRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string StudentId { get; set; } = string.Empty;
    public string StudentName { get; set; } = string.Empty;
    public string GroupId { get; set; } = string.Empty;
    public string GroupName { get; set; } = string.Empty;
    public string CurriculumSlotId { get; set; } = string.Empty;
    public string LessonId { get; set; } = string.Empty;
    public string LessonTitle { get; set; } = string.Empty;
    public int CompletedRepetitions { get; set; }
    public int RequiredRepetitions { get; set; }
    public int RecordingCount { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}
