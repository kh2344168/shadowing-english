namespace ShadowingEnglish.Api.Models;

public sealed class LessonRecord
{
    public string Id { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Status { get; set; } = "draft";
    public int RequiredRepetitions { get; set; } = 1;
    public string MediaFileName { get; set; } = string.Empty;
    public string MediaType { get; set; } = "application/octet-stream";
    public byte[]? MediaData { get; set; }
    public string ScriptLinesJson { get; set; } = "[]";
    public string ContentProfileJson { get; set; } = "{}";
    public string VocabularyJson { get; set; } = "[]";
    public string ActivitiesJson { get; set; } = "[]";
    public DateTime CreatedAtUtc { get; set; }
    public DateTime UpdatedAtUtc { get; set; }
    public ICollection<LessonSegmentRecord> Segments { get; set; } = new List<LessonSegmentRecord>();
}
