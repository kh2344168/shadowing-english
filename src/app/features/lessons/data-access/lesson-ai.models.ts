import {
  CourseLesson,
  LessonConversationConfig,
  LessonQuizQuestion,
  LessonVocabularyItem,
} from './lesson.models';

export type LessonTextProvider = 'groq' | 'gemini' | 'mistral';

export interface LessonContentGenerationRequest {
  lessonId: string;
  lessonTitle: string;
  contentProfile: CourseLesson['contentProfile'];
  segments: Array<{
    text: string;
    translation: string;
  }>;
}

export interface LessonContentGenerationResponse {
  vocabulary: LessonVocabularyItem[];
  quizQuestions: LessonQuizQuestion[];
  conversationConfig: LessonConversationConfig;
  provider: LessonTextProvider;
}

export type LessonConversationDeliveryMode = 'text' | 'voice';
export type LessonConversationPhase = 'required' | 'extended' | 'closing';

export interface LessonConversationHistoryMessage {
  role: 'assistant' | 'student';
  text: string;
  /** How this message was delivered in the UI. Used to keep voice→voice and text→text. */
  deliveryMode?: LessonConversationDeliveryMode;
}

export interface LessonConversationVocabulary {
  kind: 'word' | 'chunk';
  term: string;
  translation: string;
  example: string;
}

export interface LessonConversationPriorKnowledge {
  knownWords: string[];
  knownChunks: string[];
  practicedSentences: string[];
  studiedLessonCount: number;
  note?: string;
}

export interface LessonConversationSpellingCorrection {
  wrong: string;
  correct: string;
}

export interface LessonConversationFeedback {
  evaluation: 'good' | 'needs-improvement' | 'incorrect';
  feedbackArabic: string;
  correctedAnswer: string;
  betterAnswer: string;
  usedTargetPhrases: string[];
  suggestedReplies: string[];
  spellingCorrections: LessonConversationSpellingCorrection[];
  grammarExplanationArabic: string;
  /** Short normalized grammar topics for the end-of-conversation report. */
  grammarTopics: string[];
  /** Words or short phrases the learner should review after this turn. */
  vocabularyFocus: string[];
  /** Concrete strengths demonstrated in this turn. */
  strengths: string[];
  /** True only when the learner should retry before the scenario advances. */
  needsRetry: boolean;
}

export interface LessonConversationTurnRequest {
  lessonId: string;
  lessonTitle: string;
  config: LessonConversationConfig;
  selectedRoleId: string;
  turnIndex: number;
  messages: LessonConversationHistoryMessage[];
  vocabulary: LessonConversationVocabulary[];
  lessonSentences: string[];
  /** Familiar language collected only from learning stages the student has already completed. */
  priorKnowledge?: LessonConversationPriorKnowledge;
  studentMessage: string;
  inputMode: LessonConversationDeliveryMode;
  phase: LessonConversationPhase;
  completedLearningTurns: number;
  requiredLearningTurns: number;
  maxLearningTurns: number;
  /** Starts a natural closing without pretending the learner said a sentence. */
  finishRequested?: boolean;
}

export interface LessonConversationTurnResponse {
  assistantMessage: string;
  feedback: LessonConversationFeedback;
  conversationComplete: boolean;
  /** In extended practice the AI may decide the conversation is becoming repetitive and begin closing. */
  shouldStartClosing: boolean;
  provider: LessonTextProvider;
}

export interface LessonImageGenerationRequest {
  lessonId: string;
  term: string;
  kind: 'word' | 'chunk';
  prompt: string;
  alt: string;
}

export interface LessonImageGenerationResponse {
  imageUrl: string;
  provider: 'pexels';
}

export type LessonAiCapabilityState =
  | 'not-configured'
  | 'configured'
  | 'available'
  | 'unavailable';

export interface LessonAiCapabilityStatus {
  state: LessonAiCapabilityState;
  model: string;
  message: string;
}

export interface LessonAiStatusResponse {
  content: LessonAiCapabilityStatus;
  conversation: LessonAiCapabilityStatus;
  images: LessonAiCapabilityStatus;
  usesDedicatedImageKey: boolean;
}
