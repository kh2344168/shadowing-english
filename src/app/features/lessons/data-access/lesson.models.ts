export type LessonStatus = 'draft' | 'ready' | 'archived';

export interface LessonSegment {
  text: string;
  translation?: string;
  start: number;
  end: number;
}

export type LessonContentType =
  | 'auto'
  | 'call-center'
  | 'youtube'
  | 'book'
  | 'general';

export interface LessonContentProfile {
  /** The teacher may select a type or leave detection to the content processor. */
  type: LessonContentType;
  topic: string;
  learningObjective?: string;
  teacherNotes?: string;
}

export type LessonVocabularyKind = 'word' | 'chunk';

export interface LessonVocabularyItem {
  id?: string;
  /** A single word or a reusable multi-word expression. */
  kind?: LessonVocabularyKind;
  term: string;
  translation: string;
  example: string;
  /** Simple English explanation generated for the learner's selected level. */
  explanation?: string;
  /** Prompt used by the image service so the admin can inspect or regenerate it. */
  imagePrompt?: string;
  /** A second natural example that is not copied verbatim from the lesson. */
  extraExample?: string;
  /** Short guidance explaining when the learner can use the item. */
  usageNote?: string;
  /** Accessible description and a review hint for the selected image. */
  imageAlt?: string;
  imageProvider?: 'ai' | 'curated' | 'teacher' | 'placeholder';
  /** Confidence of the generated word suggestion from 0 to 1. */
  aiConfidence?: number;
  imageUrl?: string;
  imageApproved?: boolean;
  /** The teacher can keep an item in the lesson bank without exposing it now. */
  includeForStudent?: boolean;
  /** Explicitly keep a repeated word because the teacher wants another review. */
  repeatForReview?: boolean;
  /** Reserve the item for a future recall test. */
  testLater?: boolean;
}

export type LessonActivityType =
  | 'shadowing'
  | 'vocabulary'
  | 'shadowing-review'
  | 'listen-write'
  | 'quiz'
  | 'ai-conversation';

export interface LessonDictationItem {
  segmentIndex: number;
  enabled: boolean;
  acceptedAnswers: string[];
  hint?: string;
}

export type LessonQuizQuestionType =
  | 'multiple-choice'
  | 'word-order'
  | 'vocabulary-card';

export interface LessonQuizQuestion {
  id: string;
  type: LessonQuizQuestionType;
  prompt: string;
  options: string[];
  correctAnswer: string;
  feedback: string;
  enabled: boolean;
}

export type LessonLevel = 'A1' | 'A2' | 'B1';

export type LessonConversationMode = 'role-play' | 'guided-discussion';

export interface LessonConversationRoleOption {
  id: string;
  label: string;
  studentRole: string;
  aiRole: string;
  openingMessage: string;
}

export interface LessonConversationTurnPlan {
  id: string;
  goal: string;
  aiPrompt: string;
  expectedFunctions: string[];
  targetPhrases: string[];
}

export interface LessonConversationConfig {
  scenario: string;
  aiRole: string;
  studentRole: string;
  level: LessonLevel;
  goals: string[];
  targetPhrases: string[];
  openingMessage: string;
  questionCount: number;
  feedbackStyle: 'supportive' | 'balanced' | 'detailed';
  lessonContentOnly: boolean;
  /** How the source should be converted into speaking practice. */
  lessonType?: Exclude<LessonContentType, 'auto'>;
  topic?: string;
  mode?: LessonConversationMode;
  allowRoleChoice?: boolean;
  roleOptions?: LessonConversationRoleOption[];
  turnPlan?: LessonConversationTurnPlan[];
  correctionMode?: 'after-each-turn' | 'end-of-conversation';
}

export interface LessonActivity {
  id: string;
  type: LessonActivityType;
  title: string;
  order: number;
  enabled: boolean;
  instructions?: string;
  questionCount?: number;
  reviewStatus?: 'pending' | 'approved';
  /** Marks the first draft created by the content-processing service. */
  aiGenerated?: boolean;
  /** Optional zero-based indexes of the lesson segments used by this activity. */
  segmentIndexes?: number[];
  dictationItems?: LessonDictationItem[];
  quizQuestions?: LessonQuizQuestion[];
  conversationConfig?: LessonConversationConfig;
  /** Controls whether shadowing speech review is learner-requested or always shown by the teacher. */
  speechReviewMode?: 'student-request' | 'teacher-required';
}

export const DEFAULT_LESSON_ACTIVITIES: readonly LessonActivity[] = [
  {
    id: 'shadowing',
    type: 'shadowing',
    title: 'الشادوينج الأساسي',
    order: 0,
    enabled: true,
  },
  {
    id: 'vocabulary',
    type: 'vocabulary',
    title: 'الكلمات والصور',
    order: 1,
    enabled: true,
  },
  {
    id: 'shadowing-review',
    type: 'shadowing-review',
    title: 'الشادوينج بعد فهم الكلمات',
    order: 2,
    enabled: true,
  },
  {
    id: 'listen-write',
    type: 'listen-write',
    title: 'اسمع واكتب',
    order: 3,
    enabled: true,
  },
  {
    id: 'quiz',
    type: 'quiz',
    title: 'اختبار الدرس',
    order: 4,
    enabled: true,
  },
  {
    id: 'ai-conversation',
    type: 'ai-conversation',
    title: 'محادثة الدرس',
    order: 5,
    enabled: true,
    questionCount: 10,
  },
] as const;

export function getLessonActivities(lesson: Pick<CourseLesson, 'activities'>): LessonActivity[] {
  const source = Array.isArray(lesson.activities) && lesson.activities.length
    ? lesson.activities
    : DEFAULT_LESSON_ACTIVITIES;

  return source
    .filter((activity) => activity?.enabled !== false)
    .map((activity, index) => ({
      ...activity,
      id: activity.id || `${activity.type}-${index + 1}`,
      title: activity.title || activity.type,
      order: Number.isFinite(activity.order) ? activity.order : index,
      enabled: true,
      questionCount:
        activity.type === 'ai-conversation'
          ? Math.max(10, Number(activity.questionCount) || 10)
          : activity.questionCount,
      reviewStatus: activity.reviewStatus || 'pending',
      speechReviewMode:
        activity.type === 'shadowing' || activity.type === 'shadowing-review'
          ? activity.speechReviewMode || 'student-request'
          : undefined,
      segmentIndexes: Array.isArray(activity.segmentIndexes)
        ? Array.from(
            new Set(
              activity.segmentIndexes.filter(
                (value) => Number.isInteger(value) && value >= 0,
              ),
            ),
          )
        : undefined,
      dictationItems: Array.isArray(activity.dictationItems)
        ? activity.dictationItems.map((item) => ({
            ...item,
            enabled: item.enabled !== false,
            acceptedAnswers: Array.isArray(item.acceptedAnswers)
              ? [...item.acceptedAnswers]
              : [],
          }))
        : undefined,
      quizQuestions: Array.isArray(activity.quizQuestions)
        ? activity.quizQuestions.map((question) => ({
            ...question,
            enabled: question.enabled !== false,
            options: Array.isArray(question.options) ? [...question.options] : [],
          }))
        : undefined,
      conversationConfig: activity.conversationConfig
        ? {
            ...activity.conversationConfig,
            goals: [...(activity.conversationConfig.goals || [])],
            targetPhrases: [...(activity.conversationConfig.targetPhrases || [])],
            mode:
              activity.conversationConfig.mode ||
              (activity.conversationConfig.lessonType === 'call-center' ||
              activity.conversationConfig.lessonType === 'book'
                ? 'role-play'
                : 'guided-discussion'),
            allowRoleChoice:
              (activity.conversationConfig.mode ||
                (activity.conversationConfig.lessonType === 'call-center' ||
                activity.conversationConfig.lessonType === 'book'
                  ? 'role-play'
                  : 'guided-discussion')) === 'role-play' &&
              activity.conversationConfig.allowRoleChoice !== false &&
              (activity.conversationConfig.roleOptions || []).length > 1,
            roleOptions: (activity.conversationConfig.roleOptions || []).map(
              (option) => ({ ...option }),
            ),
            turnPlan: (activity.conversationConfig.turnPlan || []).map(
              (turn) => ({
                ...turn,
                expectedFunctions: [...(turn.expectedFunctions || [])],
                targetPhrases: [...(turn.targetPhrases || [])],
              }),
            ),
            correctionMode:
              activity.conversationConfig.correctionMode || 'after-each-turn',
          }
        : undefined,
    }))
    .sort((left, right) => left.order - right.order)
    .map((activity, order) => ({ ...activity, order }));
}

export interface CourseLesson {
  id: string;
  title: string;
  description?: string;
  contentProfile?: LessonContentProfile;
  status?: LessonStatus;
  /** Legacy fields kept temporarily so old local data and the student prototype keep working. */
  weekName?: string;
  dayName?: string;
  requiredRepetitions: number;
  mediaFileName: string;
  mediaType: string;
  mediaUrl?: string;
  segments: LessonSegment[];
  /** Optional admin-reviewed cards. Old lessons continue to use segment fallback cards. */
  vocabulary?: LessonVocabularyItem[];
  /** Ordered tools that compose the student's lesson journey. */
  activities?: LessonActivity[];
  scriptLines: string[];
  createdAt: string;
  updatedAt: string;
}
