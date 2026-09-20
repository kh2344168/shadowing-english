namespace ShadowingEnglish.Api.Models;

public sealed class StudentActivityEventRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string CorrelationId { get; set; } = string.Empty;
    public string StudentId { get; set; } = string.Empty;
    public string GroupId { get; set; } = string.Empty;
    public string LessonId { get; set; } = string.Empty;
    public string LessonTitle { get; set; } = string.Empty;
    public string CurriculumSlotId { get; set; } = string.Empty;
    public string StageId { get; set; } = string.Empty;
    public string EventType { get; set; } = string.Empty;
    public string Status { get; set; } = "success";
    public string DetailsJson { get; set; } = "{}";
    public long? DurationMs { get; set; }
    public DateTime OccurredAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
