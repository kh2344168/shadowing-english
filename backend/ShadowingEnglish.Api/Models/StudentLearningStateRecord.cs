namespace ShadowingEnglish.Api.Models;

public sealed class StudentLearningStateRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string StudentId { get; set; } = string.Empty;
    public string StudentName { get; set; } = string.Empty;
    public string GroupId { get; set; } = string.Empty;
    public string GroupName { get; set; } = string.Empty;
    public string StateJson { get; set; } = "{}";
    public int Revision { get; set; }
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}
