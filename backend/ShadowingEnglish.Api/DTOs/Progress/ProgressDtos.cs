namespace ShadowingEnglish.Api.DTOs.Progress;

public sealed record CourseLessonProgressInput(
    string CurriculumSlotId,
    string LessonId,
    string LessonTitle,
    int CompletedRepetitions,
    int RequiredRepetitions,
    int RecordingCount);

public sealed record SyncStudentCourseRequest(
    string StudentId,
    string StudentName,
    string GroupId,
    string GroupName,
    IReadOnlyList<CourseLessonProgressInput> Lessons);

public sealed record SaveStudentProgressRequest(
    string StudentId,
    string StudentName,
    string GroupId,
    string GroupName,
    string CurriculumSlotId,
    string LessonId,
    string LessonTitle,
    int CompletedRepetitions,
    int RequiredRepetitions,
    int RecordingCount);

public sealed record StudentProgressDto(
    string StudentId,
    string StudentName,
    string GroupId,
    string GroupName,
    string CurriculumSlotId,
    string LessonId,
    string LessonTitle,
    int CompletedRepetitions,
    int RequiredRepetitions,
    int RecordingCount,
    int CompletionPercent,
    string Status,
    DateTime UpdatedAtUtc);

public sealed record TeacherStudentProgressSummaryDto(
    string StudentId,
    string StudentName,
    string GroupId,
    string GroupName,
    int CompletedLessons,
    int TotalLessons,
    int InProgressLessons,
    int ProgressPercent,
    string Status,
    IReadOnlyList<StudentProgressDto> Lessons);

public sealed record TeacherGroupProgressSummaryDto(
    string GroupId,
    string GroupName,
    int StudentsCount,
    int CompletedStudentsCount,
    int InProgressStudentsCount,
    int ProgressPercent,
    IReadOnlyList<TeacherStudentProgressSummaryDto> Students);

public sealed record StudentLearningJourneyDto(
    string StudentId,
    string GroupId,
    string CurriculumSlotId,
    string LessonId,
    IReadOnlyList<string> CompletedStages,
    string CurrentStage,
    DateTime StartedAt,
    DateTime UpdatedAt,
    DateTime? CompletedAt,
    int? QuizScore);

public sealed record StudentReviewScheduleItemDto(
    string Id,
    string StudentId,
    string GroupId,
    string CurriculumSlotId,
    string LessonId,
    int IntervalDays,
    DateTime DueAt,
    string Status,
    DateTime? CompletedAt);

public sealed record StudentConversationSummaryDto(
    string Id,
    string StudentId,
    string GroupId,
    string CurriculumSlotId,
    string LessonId,
    DateTime CompletedAt,
    int TotalStudentTurns,
    int AcceptedTurns,
    int GoodAnswers,
    int CorrectionCount,
    IReadOnlyList<string> UsedTargetPhrases,
    int TextTurns = 0,
    int VoiceTurns = 0,
    IReadOnlyList<string>? GrammarFocus = null,
    IReadOnlyList<string>? VocabularyFocus = null,
    IReadOnlyList<string>? Strengths = null);

public sealed record SaveStudentLearningStateRequest(
    int SchemaVersion,
    string StudentId,
    string StudentName,
    string GroupId,
    string GroupName,
    IReadOnlyList<StudentLearningJourneyDto> Journeys,
    IReadOnlyList<StudentReviewScheduleItemDto> Reviews,
    IReadOnlyList<StudentConversationSummaryDto> Conversations);

public sealed record StudentLearningStateDto(
    int SchemaVersion,
    string StudentId,
    string StudentName,
    string GroupId,
    string GroupName,
    IReadOnlyList<StudentLearningJourneyDto> Journeys,
    IReadOnlyList<StudentReviewScheduleItemDto> Reviews,
    IReadOnlyList<StudentConversationSummaryDto> Conversations,
    int Revision,
    DateTime UpdatedAtUtc);
