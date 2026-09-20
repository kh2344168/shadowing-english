using System.Text.Json;

namespace ShadowingEnglish.Api.DTOs.Lessons;


public sealed record LessonStructuredAiRequestDto(
    string Capability,
    string Instructions,
    string UserContent,
    string SchemaName,
    JsonElement Schema);

public sealed record LessonStructuredAiResponseDto(
    string Json,
    string Provider);

public sealed record LessonContentSegmentDto(
    string Text,
    string Translation);

public sealed record LessonContentGenerationRequestDto(
    string LessonId,
    string LessonTitle,
    LessonContentProfileDto? ContentProfile,
    IReadOnlyList<LessonContentSegmentDto>? Segments);

public sealed record LessonContentGenerationResponseDto(
    IReadOnlyList<LessonVocabularyItemDto> Vocabulary,
    IReadOnlyList<LessonQuizQuestionDto> QuizQuestions,
    LessonConversationConfigDto ConversationConfig,
    string Provider);

public sealed record LessonConversationHistoryMessageDto(
    string Role,
    string Text);

public sealed record LessonConversationVocabularyDto(
    string Kind,
    string Term,
    string Translation,
    string Example);

public sealed record LessonConversationTurnRequestDto(
    string LessonId,
    string LessonTitle,
    LessonConversationConfigDto Config,
    string SelectedRoleId,
    int TurnIndex,
    IReadOnlyList<LessonConversationHistoryMessageDto>? Messages,
    IReadOnlyList<LessonConversationVocabularyDto>? Vocabulary,
    IReadOnlyList<string>? LessonSentences,
    string StudentMessage);

public sealed record LessonConversationFeedbackDto(
    string Evaluation,
    string FeedbackArabic,
    string CorrectedAnswer,
    string BetterAnswer,
    IReadOnlyList<string> UsedTargetPhrases,
    IReadOnlyList<string> SuggestedReplies);

public sealed record LessonConversationTurnResponseDto(
    string AssistantMessage,
    LessonConversationFeedbackDto Feedback,
    bool ConversationComplete,
    string Provider);

public sealed record LessonImageGenerationRequestDto(
    string LessonId,
    string Term,
    string Kind,
    string Prompt,
    string Alt);

public sealed record LessonImageGenerationResponseDto(
    string ImageUrl,
    string Provider);

public sealed record LessonAiCapabilityStatusDto(
    string State,
    string Model,
    string Message);

public sealed record LessonAiStatusResponseDto(
    LessonAiCapabilityStatusDto Content,
    LessonAiCapabilityStatusDto Conversation,
    LessonAiCapabilityStatusDto Images,
    bool UsesDedicatedImageKey);
