namespace ShadowingEnglish.Api.Models;

public sealed class StudentRecordingRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string ClientRecordingId { get; set; } = string.Empty;
    public string StudentId { get; set; } = string.Empty;
    public string GroupId { get; set; } = string.Empty;
    public string LessonId { get; set; } = string.Empty;
    public string LessonTitle { get; set; } = string.Empty;
    public string CurriculumSlotId { get; set; } = string.Empty;
    public string StageId { get; set; } = string.Empty;
    public string RecordingType { get; set; } = "shadowing";
    public int AttemptNumber { get; set; }
    public long DurationMs { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = "audio/webm";
    public long SizeBytes { get; set; }
    public byte[] AudioData { get; set; } = Array.Empty<byte>();
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
