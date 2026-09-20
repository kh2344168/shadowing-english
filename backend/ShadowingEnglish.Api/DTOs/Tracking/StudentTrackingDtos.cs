namespace ShadowingEnglish.Api.DTOs.Tracking;

public sealed record UpsertLearningGroupRequest(
    string Id,
    string Name,
    string CefrLevel,
    string SupervisorId,
    string SupervisorName,
    string CurriculumId,
    string CurriculumName,
    string StartDate,
    string DraftCurriculumJson,
    bool HasDraftChanges);

public sealed record LearningGroupDto(
    string Id,
    string Name,
    string CefrLevel,
    string SupervisorId,
    string SupervisorName,
    string CurriculumId,
    string CurriculumName,
    string StartDate,
    string DraftCurriculumJson,
    bool HasDraftChanges,
    bool IsActive,
    DateTime UpdatedAtUtc);

public sealed record CreateStudentAccountRequest(
    string Name,
    string Email,
    string GroupId,
    string GroupName,
    string CefrLevel,
    string? TemporaryPassword);


public sealed record ImportLegacyStudentRequest(
    string Id,
    string Name,
    string Email,
    string GroupId,
    string CefrLevel,
    string TemporaryPassword,
    DateTime? CreatedAtUtc);

public sealed record MoveStudentRequest(string GroupId, string GroupName, string CefrLevel);
public sealed record UpdateStudentAccountRequest(string AccountStatus, string SubscriptionStatus, string CefrLevel);
public sealed record StudentLoginRequest(string Email, string Password);
public sealed record DemoRoleLoginRequest(string Email, string Password);
public sealed record RoleLoginDto(string Id, string Name, string Email, string Role, string SessionToken = "");

public sealed record AuthSessionDto(
    string Id,
    string Name,
    string Email,
    string Role,
    string? StudentId,
    string? GroupId,
    string? GroupName,
    string? CefrLevel,
    string SessionToken = "");

public sealed record StudentLoginDto(
    string StudentId,
    string Name,
    string Email,
    string GroupId,
    string GroupName,
    string CefrLevel,
    string AccountStatus,
    string SubscriptionStatus,
    string SessionToken = "");

public sealed record StudentDirectoryDto(
    string Id,
    string Name,
    string Email,
    string GroupId,
    string GroupName,
    string CefrLevel,
    string AccountStatus,
    string SubscriptionStatus,
    string EngagementStatus,
    string EngagementReason,
    int ProgressPercent,
    int CompletedLessons,
    int TotalLessons,
    int RecordingCount,
    DateTime? LastSeenAtUtc,
    DateTime CreatedAtUtc);

public sealed record CreateStudentResultDto(StudentDirectoryDto Student, string TemporaryPassword);
public sealed record ResetStudentPasswordDto(string TemporaryPassword);

public sealed record TrackStudentEventRequest(
    string StudentId,
    string StudentName,
    string GroupId,
    string GroupName,
    string CefrLevel,
    string LessonId,
    string LessonTitle,
    string CurriculumSlotId,
    string StageId,
    string EventType,
    string Status,
    string? DetailsJson,
    long? DurationMs,
    DateTime? OccurredAtUtc,
    string? CorrelationId);

public sealed record StudentActivityEventDto(
    Guid Id,
    string CorrelationId,
    string LessonId,
    string LessonTitle,
    string CurriculumSlotId,
    string StageId,
    string EventType,
    string Status,
    string DetailsJson,
    long? DurationMs,
    DateTime OccurredAtUtc);

public sealed record StudentEventPageDto(
    IReadOnlyList<StudentActivityEventDto> Items,
    int Total,
    int Skip,
    int Take);

public sealed record StudentRecordingDto(
    Guid Id,
    string ClientRecordingId,
    string LessonId,
    string LessonTitle,
    string CurriculumSlotId,
    string StageId,
    string RecordingType,
    int AttemptNumber,
    long DurationMs,
    string FileName,
    string ContentType,
    long SizeBytes,
    DateTime CreatedAtUtc);

public sealed record StudentLessonTrackingDto(
    string CurriculumSlotId,
    string LessonId,
    string LessonTitle,
    int CompletedRepetitions,
    int RequiredRepetitions,
    int RecordingCount,
    int CompletionPercent,
    string Status,
    DateTime UpdatedAtUtc);

public sealed record StudentJourneyDetailDto(
    string CurriculumSlotId,
    string LessonId,
    IReadOnlyList<string> CompletedStages,
    string CurrentStage,
    DateTime? StartedAt,
    DateTime? UpdatedAt,
    DateTime? CompletedAt,
    int? QuizScore);

public sealed record StudentReviewDetailDto(
    string Id,
    string CurriculumSlotId,
    string LessonId,
    int IntervalDays,
    DateTime? DueAt,
    string Status,
    DateTime? CompletedAt);

public sealed record StudentConversationDetailDto(
    string Id,
    string CurriculumSlotId,
    string LessonId,
    DateTime? CompletedAt,
    int TotalStudentTurns,
    int AcceptedTurns,
    int GoodAnswers,
    int CorrectionCount,
    IReadOnlyList<string> UsedTargetPhrases);

public sealed record StudentLearningSnapshotDto(
    IReadOnlyList<string> CompletedStages,
    string CurrentStage,
    DateTime? StartedAt,
    DateTime? UpdatedAt,
    DateTime? CompletedAt,
    int? QuizScore,
    int ReviewCount,
    int DueReviewCount,
    int ConversationCount,
    int ConversationCorrections,
    IReadOnlyList<StudentJourneyDetailDto> Journeys,
    IReadOnlyList<StudentReviewDetailDto> Reviews,
    IReadOnlyList<StudentConversationDetailDto> Conversations);

public sealed record StudentEngagementDto(
    string Status,
    string Reason,
    DateTime? LastActivityAtUtc,
    int ActiveDaysLast14,
    int EventsLast7Days,
    int CompletedStages,
    int DueReviews);

public sealed record AdminStudentDetailDto(
    StudentDirectoryDto Student,
    StudentEngagementDto Engagement,
    IReadOnlyList<StudentLessonTrackingDto> Lessons,
    StudentLearningSnapshotDto Learning,
    IReadOnlyList<StudentActivityEventDto> RecentEvents,
    IReadOnlyList<StudentRecordingDto> Recordings,
    int TotalEventCount);
