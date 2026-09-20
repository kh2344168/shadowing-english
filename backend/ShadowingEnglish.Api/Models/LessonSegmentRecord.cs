namespace ShadowingEnglish.Api.Models;

public sealed class LessonSegmentRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string LessonId { get; set; } = string.Empty;
    public LessonRecord Lesson { get; set; } = null!;
    public int SortOrder { get; set; }
    public double StartSeconds { get; set; }
    public double EndSeconds { get; set; }
    public string EnglishText { get; set; } = string.Empty;
    public string ArabicTranslation { get; set; } = string.Empty;
}
