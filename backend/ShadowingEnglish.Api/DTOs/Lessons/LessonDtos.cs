using Microsoft.AspNetCore.Http;

namespace ShadowingEnglish.Api.DTOs.Lessons;

public sealed class SaveLessonForm
{
    public string LessonJson { get; set; } = string.Empty;
    public IFormFile? Media { get; set; }
}

public sealed class SaveLessonRequest
{
    public string? Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? Status { get; set; }
    public int RequiredRepetitions { get; set; }
    public string? MediaFileName { get; set; }
    public string? MediaType { get; set; }
    public LessonContentProfileDto? ContentProfile { get; set; }
    public IReadOnlyList<SaveLessonSegmentRequest>? Segments { get; set; }
    public IReadOnlyList<string>? ScriptLines { get; set; }
    public IReadOnlyList<LessonVocabularyItemDto>? Vocabulary { get; set; }
    public IReadOnlyList<LessonActivityDto>? Activities { get; set; }
}

public sealed class SaveLessonSegmentRequest
{
    public string Text { get; set; } = string.Empty;
    public string? Translation { get; set; }
    public double Start { get; set; }
    public double End { get; set; }
}

public sealed record LessonSegmentDto(
    string Text,
    string Translation,
    double Start,
    double End);

public sealed record LessonContentProfileDto(
    string Type,
    string Topic,
    string? LearningObjective,
    string? TeacherNotes);

public sealed record LessonVocabularyItemDto(
    string? Id,
    string? Kind,
    string Term,
    string Translation,
    string Example,
    string? Explanation,
    string? ImagePrompt,
    string? ExtraExample,
    string? UsageNote,
    string? ImageAlt,
    string? ImageProvider,
    double? AiConfidence,
    string? ImageUrl,
    bool ImageApproved,
    bool IncludeForStudent,
    bool RepeatForReview,
    bool TestLater);

public sealed record LessonDictationItemDto(
    int SegmentIndex,
    bool Enabled,
    IReadOnlyList<string>? AcceptedAnswers,
    string? Hint);

public sealed record LessonQuizQuestionDto(
    string Id,
    string Type,
    string Prompt,
    IReadOnlyList<string>? Options,
    string CorrectAnswer,
    string Feedback,
    bool Enabled);

public sealed record LessonConversationConfigDto(
    string Scenario,
    string AiRole,
    string StudentRole,
    string Level,
    IReadOnlyList<string>? Goals,
    IReadOnlyList<string>? TargetPhrases,
    string OpeningMessage,
    int QuestionCount,
    string FeedbackStyle,
    bool LessonContentOnly,
    string? LessonType,
    string? Topic,
    string? Mode,
    bool? AllowRoleChoice,
    IReadOnlyList<LessonConversationRoleOptionDto>? RoleOptions,
    IReadOnlyList<LessonConversationTurnPlanDto>? TurnPlan,
    string? CorrectionMode);

public sealed record LessonConversationRoleOptionDto(
    string Id,
    string Label,
    string StudentRole,
    string AiRole,
    string OpeningMessage);

public sealed record LessonConversationTurnPlanDto(
    string Id,
    string Goal,
    string AiPrompt,
    IReadOnlyList<string>? ExpectedFunctions,
    IReadOnlyList<string>? TargetPhrases);

public sealed record LessonActivityDto(
    string Id,
    string Type,
    string Title,
    int Order,
    bool Enabled,
    string? Instructions,
    int? QuestionCount,
    string? ReviewStatus,
    bool AiGenerated,
    IReadOnlyList<int>? SegmentIndexes,
    IReadOnlyList<LessonDictationItemDto>? DictationItems,
    IReadOnlyList<LessonQuizQuestionDto>? QuizQuestions,
    LessonConversationConfigDto? ConversationConfig);

public sealed record LessonDto(
    string Id,
    string Title,
    string Description,
    LessonContentProfileDto? ContentProfile,
    string Status,
    string WeekName,
    string DayName,
    int RequiredRepetitions,
    string MediaFileName,
    string MediaType,
    string MediaUrl,
    IReadOnlyList<LessonSegmentDto> Segments,
    IReadOnlyList<string> ScriptLines,
    IReadOnlyList<LessonVocabularyItemDto> Vocabulary,
    IReadOnlyList<LessonActivityDto> Activities,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public sealed record LessonMediaResult(
    byte[] Data,
    string MediaType,
    string FileName);

public sealed record LessonUsageDto(
    string GroupId,
    string GroupName,
    string WeekName,
    string DayName);
