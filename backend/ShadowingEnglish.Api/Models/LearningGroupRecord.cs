namespace ShadowingEnglish.Api.Models;

public sealed class LearningGroupRecord
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string CefrLevel { get; set; } = "A1";
    public string SupervisorId { get; set; } = string.Empty;
    public string SupervisorName { get; set; } = string.Empty;
    public string CurriculumId { get; set; } = string.Empty;
    public string CurriculumName { get; set; } = string.Empty;
    public string StartDate { get; set; } = string.Empty;
    public string DraftCurriculumJson { get; set; } = string.Empty;
    public bool HasDraftChanges { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}
