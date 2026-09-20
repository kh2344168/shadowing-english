namespace ShadowingEnglish.Api.Models;

public sealed class GroupCurriculumPublicationRecord
{
    public string GroupId { get; set; } = string.Empty;
    public string GroupName { get; set; } = string.Empty;
    public string SourceCurriculumId { get; set; } = string.Empty;
    public string SourceCurriculumName { get; set; } = string.Empty;
    public int Version { get; set; } = 1;
    public string PublishedSnapshotJson { get; set; } = "{}";
    public DateTime UpdatedAtUtc { get; set; }
    public DateTime PublishedAtUtc { get; set; }
}
