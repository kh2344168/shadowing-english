import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../../core/auth/services/auth.service';
import { StudentTrackingApiService } from '../../../../core/api/student-tracking-api.service';
import { AppDiagnosticsService } from '../../../../core/diagnostics/app-diagnostics.service';
import {
  LessonConversationDeliveryMode,
  LessonConversationFeedback,
  LessonConversationHistoryMessage,
  LessonConversationPhase,
  LessonConversationTurnResponse,
} from '../../../lessons/data-access/lesson-ai.models';
import { LessonAiApiService } from '../../../lessons/data-access/lesson-ai-api.service';
import {
  LessonActivity,
  LessonConversationConfig,
  LessonDictationItem,
  LessonQuizQuestion,
  LessonSegment,
  getLessonActivities,
} from '../../../lessons/data-access/lesson.models';
import { StageCompletionCardComponent, type StageCompletionMetric, type StageCompletionInsightSection } from '../../components/stage-completion-card/stage-completion-card.component';
import { StudentCourseFacade } from '../../data-access/student-course.facade';
import { StudentKnowledgeBankService } from '../../data-access/student-knowledge-bank.service';
import { StudentLearningRepository } from '../../data-access/student-learning.repository';
import {
  StudentLessonContentService,
  VocabularyCard,
} from '../../data-access/student-lesson-content.service';
import {
  StudentLessonView,
  StudentStageView,
} from '../../data-access/student-learning.models';

interface DictationTokenReview {
  text: string;
  status: 'correct' | 'missing' | 'extra';
}

interface ConversationFeedbackView {
  turn: number;
  answer: string;
  inputMode: LessonConversationDeliveryMode;
  feedback: LessonConversationFeedback;
}

interface ConversationVoiceNote {
  url: string;
  durationSeconds: number;
  blob: Blob;
}

@Component({
  selector: 'app-student-lesson-stage-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, StageCompletionCardComponent],
  templateUrl: './student-lesson-stage.page.html',
  styleUrl: './student-lesson-stage.page.scss',
})
export class StudentLessonStagePage implements OnInit, OnDestroy {
  @ViewChild('dictationAudio') dictationAudio?: ElementRef<HTMLAudioElement>;
  @ViewChild('conversationChat') conversationChat?: ElementRef<HTMLElement>;
  @ViewChild('conversationTextInput') conversationTextInput?: ElementRef<HTMLInputElement>;

  lessonView: StudentLessonView | null = null;
  stageId = '';
  vocabulary: VocabularyCard[] = [];
  activeIndex = 0;
  vocabularyRevealed = false;
  vocabularyAnimation: 'idle' | 'know-exit' | 'review-exit' | 'enter' = 'idle';
  mediaUrl = '';
  dictationAnswer = '';
  dictationSubmitted = false;
  dictationCorrect = false;
  wrongWords: string[] = [];
  dictationTokenReview: DictationTokenReview[] = [];
  dictationCorrectionTarget = '';
  dictationCorrectionAnswer = '';
  dictationCorrectionError = '';
  showDictationAnswer = false;
  quizQuestions: LessonQuizQuestion[] = [];
  quizSelectedOption = '';
  quizOrderedWordIndexes: number[] = [];
  quizSubmitted = false;
  quizCorrect = false;
  quizResults: Record<string, boolean> = {};
  conversationInput = '';
  readonly conversationTargetTurns = 10;
  readonly conversationMaxTurns = 10;
  conversationLearningTurns = 0;
  conversationPhase: LessonConversationPhase = 'required';
  conversationAwaitingContinueDecision = false;
  conversationHintsVisible = false;
  conversationLastInputMode: LessonConversationDeliveryMode = 'text';
  conversationComposerMode: LessonConversationDeliveryMode = 'text';
  conversationAssistantTranscriptVisible: Record<number, boolean> = {};
  conversationPlayingAssistantIndex: number | null = null;
  selectedConversationRoleId = '';
  conversationStarted = false;
  conversationBusy = false;
  conversationComplete = false;
  conversationError = '';
  conversationProvider: LessonConversationTurnResponse['provider'] | '' = '';
  conversationMessages: LessonConversationHistoryMessage[] = [];
  conversationFeedbacks: ConversationFeedbackView[] = [];
  conversationRecording = false;
  conversationRecordingSeconds = 0;
  conversationRecordingInterim = '';
  conversationMicError = '';
  conversationPlayingVoiceTurn: number | null = null;
  conversationVoiceNotes: Record<number, ConversationVoiceNote> = {};
  pendingConversationVoiceNote: ConversationVoiceNote | null = null;

  // Shared transition popup for every non-shadowing lesson stage.
  // Shadowing already has its own completion modal in lesson-player.
  stageCompletionPopupOpen = false;
  stageCompletionNextStage: StudentStageView | null = null;
  stageCompletionFinishedLabel = '';
  stageCompletionFinishedNumber = 0;
  stageCompletionScore: number | null = null;
  stageCompletionScoreLabel = 'نتيجة المرحلة';
  stageCompletionQualityLabel = '';
  stageCompletionNote = '';
  stageCompletionMetrics: StageCompletionMetric[] = [];
  stageCompletionInsightSections: StageCompletionInsightSection[] = [];

  private vocabularyKnownCount = 0;
  private vocabularyReviewCount = 0;
  private dictationFirstAttemptScores: Record<number, number> = {};
  private stageStartedAtMs = Date.now();

  private readonly failedVocabularyImages = new Set<string>();
  readonly loading = signal(true);
  private playbackTimerId: number | null = null;
  private vocabularyAnimationTimerId: number | null = null;
  private conversationRecordingTimerId: number | null = null;
  private conversationMediaRecorder: MediaRecorder | null = null;
  private conversationMediaStream: MediaStream | null = null;
  private conversationVoiceChunks: Blob[] = [];
  private conversationSpeechRecognition: any = null;
  private conversationRecognitionBaseInput = '';
  private conversationAudio: HTMLAudioElement | null = null;
  private conversationSpeechUtterance: SpeechSynthesisUtterance | null = null;
  private routeSubscription?: Subscription;
  private loadSequence = 0;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private auth: AuthService,
    private courseFacade: StudentCourseFacade,
    private knowledgeBank: StudentKnowledgeBankService,
    private learningRepository: StudentLearningRepository,
    private contentService: StudentLessonContentService,
    private lessonAiApi: LessonAiApiService,
    private trackingApi: StudentTrackingApiService,
    private diagnostics: AppDiagnosticsService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.routeSubscription = this.route.paramMap.subscribe(() => {
      void this.loadCurrentStage();
    });
  }

  ngOnDestroy(): void {
    this.loadSequence += 1;
    this.routeSubscription?.unsubscribe();
    this.stopDictationAudio();
    this.cleanupConversationAudio();
    if (this.vocabularyAnimationTimerId !== null) {
      window.clearTimeout(this.vocabularyAnimationTimerId);
    }
  }

  private async loadCurrentStage(): Promise<void> {
    const loadSequence = ++this.loadSequence;
    this.resetStageUi();
    this.loading.set(true);
    this.stageStartedAtMs = Date.now();
    this.stageId =
      this.route.snapshot.paramMap.get('stageId') ||
      String(this.route.snapshot.data['stage'] || 'vocabulary');
    await this.courseFacade.initialize();
    if (loadSequence !== this.loadSequence) return;
    this.lessonView = this.courseFacade.getLesson(
      this.route.snapshot.paramMap.get('lessonId') || '',
      this.route.snapshot.queryParamMap.get('slotId') || '',
    );

    if (!this.lessonView) {
      this.loading.set(false);
      this.cdr.detectChanges();
      return;
    }

    const stage = this.stage;
    if (!stage || stage.status === 'locked') {
      void this.router.navigate(['/student/lessons', this.lessonView.lesson.id], {
        queryParams: { slotId: this.lessonView.curriculumSlotId },
      });
      return;
    }

    void this.trackingApi.trackEvent({
      studentId: this.auth.currentUser?.studentId || '',
      studentName: this.auth.currentUser?.name || '',
      groupId: this.lessonView.groupId,
      groupName: this.auth.currentUser?.groupName || this.lessonView.groupId,
      cefrLevel: this.auth.currentUser?.cefrLevel || 'A1',
      lessonId: this.lessonView.lesson.id,
      lessonTitle: this.lessonView.lesson.title,
      curriculumSlotId: this.lessonView.curriculumSlotId,
      stageId: stage.id,
      eventType: 'stage_opened',
      status: 'success',
      detailsJson: JSON.stringify({ activityType: stage.activityType, stageTitle: stage.label }),
      occurredAtUtc: new Date().toISOString(),
      correlationId: `stage-opened-${this.auth.currentUser?.studentId}-${stage.id}-${Date.now()}`,
    });

    if (stage.activityType === 'vocabulary') {
      this.vocabulary = this.contentService.getVocabulary(this.lessonView.lesson);
    }

    if (stage.activityType === 'listen-write') {
      this.mediaUrl = this.lessonView.lesson.mediaUrl?.trim() ||
        `/api/lessons/${encodeURIComponent(this.lessonView.lesson.id)}/media`;
    }

    if (stage.activityType === 'quiz') {
      this.quizQuestions = this.contentService.getQuiz(
        this.lessonView.lesson,
        stage.id,
      );
    }

    if (stage.activityType === 'ai-conversation') {
      const activity = getLessonActivities(this.lessonView.lesson).find(
        (item) => item.id === stage.id,
      );
      // Conversation Engine Rules v1: exactly 10 accepted learner turns.
      // Retry attempts do not count toward the limit.
      const config = activity?.conversationConfig;
      const requiresRoleChoice =
        config?.mode === 'role-play' && this.conversationRoleOptions.length > 1;
      if (config && !requiresRoleChoice) {
        this.selectedConversationRoleId = config.roleOptions?.[0]?.id || 'default';
        this.startConversation();
      }
    }

    this.loading.set(false);
    this.cdr.detectChanges();
  }

  get stage(): StudentStageView | null {
    return this.lessonView?.stages.find((item) => item.id === this.stageId) || null;
  }

  get vocabularyCard(): VocabularyCard | null {
    return this.vocabulary[this.activeIndex] || null;
  }

  get vocabularyWordCount(): number {
    return this.vocabulary.filter((item) => item.kind === 'word').length;
  }

  get vocabularyChunkCount(): number {
    return this.vocabulary.filter((item) => item.kind === 'chunk').length;
  }

  get dictationSegment() {
    return this.dictationEntries[this.activeIndex]?.segment || null;
  }

  get dictationItem(): LessonDictationItem | null {
    return this.dictationEntries[this.activeIndex]?.item || null;
  }

  get activeActivity(): LessonActivity | null {
    if (!this.lessonView) return null;
    return (
      getLessonActivities(this.lessonView.lesson).find(
        (activity) => activity.id === this.stageId,
      ) || null
    );
  }

  get dictationSegments(): LessonSegment[] {
    return this.dictationEntries.map((entry) => entry.segment);
  }

  get dictationEntries(): Array<{
    segment: LessonSegment;
    segmentIndex: number;
    item: LessonDictationItem;
  }> {
    if (!this.lessonView) return [];
    const activity = this.activeActivity;
    const selected = Array.isArray(activity?.segmentIndexes)
      ? new Set(activity.segmentIndexes)
      : null;
    const configured = new Map(
      (activity?.dictationItems || []).map((item) => [item.segmentIndex, item]),
    );
    return this.lessonView.lesson.segments
      .map((segment, segmentIndex) => ({
        segment,
        segmentIndex,
        item:
          configured.get(segmentIndex) ||
          ({
            segmentIndex,
            enabled: true,
            acceptedAnswers: [segment.text],
          } satisfies LessonDictationItem),
      }))
      .filter(
        ({ segmentIndex, item }) =>
          (!selected || selected.has(segmentIndex)) && item.enabled !== false,
      );
  }

  get dictationHint(): string {
    return this.dictationItem?.hint?.trim() || '';
  }

  get quizQuestion(): LessonQuizQuestion | null {
    return this.quizQuestions[this.activeIndex] || null;
  }

  get quizOrderedAnswer(): string {
    const question = this.quizQuestion;
    if (!question) return '';
    return this.quizOrderedWordIndexes
      .map((index) => question.options[index] || '')
      .filter(Boolean)
      .join(' ');
  }

  get quizRemainingWordIndexes(): number[] {
    const question = this.quizQuestion;
    if (!question) return [];
    const used = new Set(this.quizOrderedWordIndexes);
    return question.options
      .map((_, index) => index)
      .filter((index) => !used.has(index));
  }

  get quizScore(): number {
    if (!this.quizQuestions.length) return 0;
    const correct = this.quizQuestions.filter(
      (question) => this.quizResults[question.id],
    ).length;
    return Math.round((correct / this.quizQuestions.length) * 100);
  }

  get conversationConfig(): LessonConversationConfig | null {
    return this.activeActivity?.conversationConfig || null;
  }

  get studentConversationTurns(): number {
    return this.conversationMessages.filter((message) => message.role === 'student').length;
  }

  get conversationRoleOptions() {
    const config = this.conversationConfig;
    if (!config) return [];
    const options = (config.roleOptions || []).filter(
      (role) => role?.studentRole?.trim() && role?.aiRole?.trim(),
    );
    if (config.mode !== 'role-play') return options;
    if (options.length >= 2) return options;

    const base = options[0];
    const studentRole = base?.studentRole?.trim() || config.studentRole?.trim() || 'Speaker A';
    const aiRole = base?.aiRole?.trim() || config.aiRole?.trim() || 'Speaker B';
    const opening = base?.openingMessage?.trim() || config.openingMessage?.trim() || this.lessonView?.lesson.segments[0]?.text || 'Hello.';
    if (!studentRole || !aiRole || studentRole.toLowerCase() === aiRole.toLowerCase()) return options;

    return [
      base || { id: 'role-a', label: `أكون ${studentRole}`, studentRole, aiRole, openingMessage: opening },
      {
        id: 'role-b',
        label: `أكون ${aiRole}`,
        studentRole: aiRole,
        aiRole: studentRole,
        openingMessage: config.openingMessage?.trim() || opening,
      },
    ];
  }

  get conversationSuggestedReplies(): string[] {
    const latestFeedback = this.conversationFeedbacks[this.conversationFeedbacks.length - 1];
    const fromFeedback = latestFeedback?.feedback.suggestedReplies || [];
    if (fromFeedback.length) return fromFeedback.slice(0, 3);
    return (this.conversationConfig?.targetPhrases || []).slice(0, 3);
  }

  get conversationDisplayTargetTurns(): number {
    return this.conversationTargetTurns;
  }

  get conversationCurrentTurn(): number {
    if (this.conversationComplete) return this.conversationLearningTurns;
    return Math.min(this.conversationDisplayTargetTurns, this.conversationLearningTurns + 1);
  }

  get conversationProgressPercent(): number {
    const target = this.conversationDisplayTargetTurns;
    if (!target) return 0;
    return Math.min(100, Math.max(0, (this.conversationLearningTurns / target) * 100));
  }

  get conversationGoodAnswerCount(): number {
    return this.conversationFeedbacks.filter((item) => item.feedback.evaluation === 'good').length;
  }

  get conversationCorrectionCount(): number {
    return this.conversationFeedbacks.filter(
      (item) =>
        item.feedback.spellingCorrections.length > 0 ||
        Boolean(item.feedback.grammarExplanationArabic) ||
        item.feedback.evaluation !== 'good',
    ).length;
  }

  get conversationUsedPhraseCount(): number {
    return new Set(
      this.conversationFeedbacks.flatMap((item) => item.feedback.usedTargetPhrases || []),
    ).size;
  }

  get conversationTextTurnCount(): number {
    return this.conversationFeedbacks.filter((item) => item.inputMode === 'text').length;
  }

  get conversationVoiceTurnCount(): number {
    return this.conversationFeedbacks.filter((item) => item.inputMode === 'voice').length;
  }

  get conversationGrammarFocus(): string[] {
    return this.topConversationItems(
      this.conversationFeedbacks.flatMap((item) => item.feedback.grammarTopics || []),
      3,
    );
  }

  get conversationVocabularyFocus(): string[] {
    const explicit = this.conversationFeedbacks.flatMap((item) => item.feedback.vocabularyFocus || []);
    const corrections = this.conversationFeedbacks.flatMap((item) =>
      (item.feedback.spellingCorrections || []).map((correction) => correction.correct),
    );
    return this.topConversationItems([...explicit, ...corrections], 5);
  }

  get conversationStrengths(): string[] {
    const strengths = this.conversationFeedbacks.flatMap((item) => item.feedback.strengths || []);
    const targetPhrases = Array.from(new Set(
      this.conversationFeedbacks.flatMap((item) => item.feedback.usedTargetPhrases || []),
    )).map((phrase) => `استخدمت “${phrase}” بشكل مناسب`);
    return this.topConversationItems([...strengths, ...targetPhrases], 3);
  }

  get conversationEvaluationScore(): number | null {
    if (!this.conversationFeedbacks.length) return null;
    const total = this.conversationFeedbacks.reduce((sum, item) => {
      if (item.feedback.evaluation === 'good') return sum + 100;
      if (item.feedback.evaluation === 'needs-improvement') return sum + 70;
      return sum + 40;
    }, 0);
    return Math.round(total / this.conversationFeedbacks.length);
  }

  get shouldChooseConversationRole(): boolean {
    return (
      this.conversationConfig?.mode === 'role-play' &&
      this.conversationRoleOptions.length > 1
    );
  }

  get selectedConversationRole() {
    return (
      this.conversationRoleOptions.find(
        (role) => role.id === this.selectedConversationRoleId,
      ) || this.conversationRoleOptions[0] || null
    );
  }

  get firstConversationPrompt(): string {
    const roleOpening = this.selectedConversationRole?.openingMessage?.trim();
    if (roleOpening) return roleOpening;
    const configured = this.conversationConfig?.openingMessage?.trim();
    if (configured) return configured;
    const firstSentence = this.lessonView?.lesson.segments[0]?.text;
    return firstSentence
      ? `Let's practise this situation. How would you reply to: “${firstSentence}”?`
      : 'Tell me what happened in this lesson.';
  }

  speakVocabulary(text: string): void {
    if (!text.trim() || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.85;
    window.speechSynthesis.speak(utterance);
  }

  hasVocabularyImage(card: VocabularyCard): boolean {
    return Boolean(
      card.imageUrl && !this.failedVocabularyImages.has(card.imageUrl),
    );
  }

  onVocabularyImageError(imageUrl?: string): void {
    if (imageUrl) this.failedVocabularyImages.add(imageUrl);
  }

  nextVocabularyCard(direction: 'know' | 'review' = 'know'): void {
    if (this.vocabularyAnimation !== 'idle') return;
    const card = this.vocabularyCard;
    if (direction === 'know') this.vocabularyKnownCount += 1;
    else this.vocabularyReviewCount += 1;
    this.trackStageAction('vocabulary_card_answered', {
      cardIndex: this.activeIndex,
      totalCards: this.vocabulary.length,
      itemKind: card?.kind || '',
      term: card?.term || '',
      response: direction,
    });
    this.vocabularyAnimation = direction === 'know' ? 'know-exit' : 'review-exit';

    this.vocabularyAnimationTimerId = window.setTimeout(() => {
      if (this.activeIndex >= this.vocabulary.length - 1) {
        this.vocabularyAnimation = 'idle';
        this.vocabularyAnimationTimerId = null;
        this.cdr.detectChanges();
        this.completeAndContinue();
        return;
      }

      this.activeIndex += 1;
      this.vocabularyRevealed = false;
      this.vocabularyAnimation = 'enter';

      // Angular's current zoneless change-detection does not automatically refresh
      // the template for state mutations that happen inside a raw setTimeout.
      // Without this refresh the old card keeps the exit animation's `forwards`
      // state (opacity: 0), so the next vocabulary card exists in memory but is
      // never painted. Force one refresh as soon as the index changes.
      this.cdr.detectChanges();

      this.vocabularyAnimationTimerId = window.setTimeout(() => {
        this.vocabularyAnimation = 'idle';
        this.vocabularyAnimationTimerId = null;
        this.cdr.detectChanges();
      }, 360);
    }, 300);
  }

  revealVocabularyCard(): void {
    if (this.vocabularyAnimation !== 'idle') return;
    this.vocabularyRevealed = true;
  }

  skipEmptyVocabulary(): void {
    this.completeAndContinue();
  }

  async playDictationSentence(): Promise<void> {
    const audio = this.dictationAudio?.nativeElement;
    const segment = this.dictationSegment;
    if (!audio || !segment) return;

    this.stopDictationAudio();
    audio.currentTime = segment.start;
    try {
      await audio.play();
      this.playbackTimerId = window.setTimeout(
        () => this.stopDictationAudio(),
        Math.max(300, (segment.end - segment.start) * 1000),
      );
    } catch {
      // The replay button lets the student retry after browser autoplay blocking.
    }
  }

  submitDictation(): void {
    const acceptedAnswers = [
      ...(this.dictationItem?.acceptedAnswers || []),
      this.dictationSegment?.text || '',
    ].filter(Boolean);
    const normalizedAnswer = this.normalizeAnswer(this.dictationAnswer);
    const expected = acceptedAnswers.find(
      (answer) => this.normalizeAnswer(answer) === normalizedAnswer,
    );
    const primaryAnswer = acceptedAnswers[0] || '';
    this.dictationTokenReview = this.buildTokenReview(
      primaryAnswer,
      this.dictationAnswer,
    );
    const missingWords = this.dictationTokenReview
      .filter((token) => token.status === 'missing')
      .map((token) => token.text);
    const extraWords = this.dictationTokenReview
      .filter((token) => token.status === 'extra')
      .map((token) => `+${token.text}`);
    this.wrongWords = [...missingWords, ...extraWords];
    this.dictationCorrectionTarget = missingWords.join(' ');
    this.dictationCorrectionAnswer = '';
    this.dictationCorrectionError = '';
    this.dictationCorrect = Boolean(expected);
    if (this.dictationFirstAttemptScores[this.activeIndex] === undefined) {
      const correctTokens = this.dictationTokenReview.filter((token) => token.status === 'correct').length;
      const denominator = Math.max(1, this.dictationTokenReview.length);
      this.dictationFirstAttemptScores[this.activeIndex] = Math.round((correctTokens / denominator) * 100);
    }
    this.dictationSubmitted = true;
    this.showDictationAnswer = false;
    this.trackStageAction('dictation_answer_submitted', {
      itemIndex: this.activeIndex,
      totalItems: this.dictationSegments.length,
      segmentId: this.dictationSegment ? `${this.dictationSegment.start}-${this.dictationSegment.end}` : '',
      correct: this.dictationCorrect,
      missingWordCount: missingWords.length,
      extraWordCount: extraWords.length,
    });
  }

  retryDictation(): void {
    this.dictationSubmitted = false;
    this.dictationCorrect = false;
    this.wrongWords = [];
    this.dictationTokenReview = [];
    this.dictationCorrectionTarget = '';
    this.dictationCorrectionAnswer = '';
    this.dictationCorrectionError = '';
    this.showDictationAnswer = false;
  }

  submitDictationCorrection(): void {
    const answer = this.normalizeAnswer(this.dictationCorrectionAnswer);
    const expected = this.normalizeAnswer(this.dictationCorrectionTarget);
    if (!answer || !expected) return;
    if (answer !== expected) {
      this.dictationCorrectionError = 'اكتب فقط الكلمات الناقصة أو المختلفة بالترتيب الظاهر.';
      this.trackStageAction('dictation_correction_submitted', {
        itemIndex: this.activeIndex,
        correct: false,
      }, 'failed');
      return;
    }
    this.dictationCorrect = true;
    this.dictationCorrectionError = '';
    this.trackStageAction('dictation_correction_submitted', {
      itemIndex: this.activeIndex,
      correct: true,
    });
  }

  nextDictation(): void {
    const total = this.dictationSegments.length;
    if (this.activeIndex < total - 1) {
      this.activeIndex += 1;
      this.dictationAnswer = '';
      this.retryDictation();
      return;
    }
    this.completeAndContinue();
  }

  revealDictationAnswer(): void {
    this.showDictationAnswer = true;
  }

  skipEmptyDictation(): void {
    this.completeAndContinue();
  }

  selectQuizOption(option: string): void {
    if (this.quizSubmitted) return;
    this.quizSelectedOption = option;
  }

  addQuizWord(optionIndex: number): void {
    if (this.quizSubmitted || this.quizOrderedWordIndexes.includes(optionIndex)) return;
    this.quizOrderedWordIndexes = [...this.quizOrderedWordIndexes, optionIndex];
  }

  removeQuizWord(position: number): void {
    if (this.quizSubmitted) return;
    this.quizOrderedWordIndexes = this.quizOrderedWordIndexes.filter(
      (_, index) => index !== position,
    );
  }

  submitQuizAnswer(): void {
    const question = this.quizQuestion;
    if (!question) return;
    const answer =
      question.type === 'word-order'
        ? this.quizOrderedAnswer
        : this.quizSelectedOption;
    if (!answer.trim()) return;
    this.quizCorrect =
      this.normalizeAnswer(answer) === this.normalizeAnswer(question.correctAnswer);
    this.quizResults = {
      ...this.quizResults,
      [question.id]: this.quizCorrect,
    };
    this.quizSubmitted = true;
    this.trackStageAction('quiz_answer_submitted', {
      questionId: question.id,
      questionIndex: this.activeIndex,
      totalQuestions: this.quizQuestions.length,
      questionType: question.type,
      correct: this.quizCorrect,
    });
  }

  retryQuizAnswer(): void {
    this.quizSubmitted = false;
    this.quizCorrect = false;
    this.quizSelectedOption = '';
    this.quizOrderedWordIndexes = [];
  }

  nextQuizQuestion(): void {
    if (!this.quizSubmitted) return;
    if (this.activeIndex < this.quizQuestions.length - 1) {
      this.activeIndex += 1;
      this.quizSelectedOption = '';
      this.quizOrderedWordIndexes = [];
      this.quizSubmitted = false;
      this.quizCorrect = false;
      return;
    }
    this.completeAndContinue(this.quizScore);
  }

  skipEmptyQuiz(): void {
    this.completeAndContinue(0);
  }

  selectConversationRole(roleId: string): void {
    if (this.conversationStarted) return;
    this.selectedConversationRoleId = roleId;
  }

  startConversation(): void {
    if (this.conversationStarted) return;
    if (this.shouldChooseConversationRole && !this.selectedConversationRoleId) return;
    if (!this.selectedConversationRoleId) {
      this.selectedConversationRoleId = this.conversationRoleOptions[0]?.id || 'default';
    }
    this.conversationError = '';
    this.conversationStarted = true;
    this.conversationPhase = 'required';
    this.conversationLearningTurns = 0;
    this.conversationAwaitingContinueDecision = false;
    this.conversationMessages = [
      { role: 'assistant', text: this.firstConversationPrompt, deliveryMode: 'text' },
    ];
    this.trackStageAction('conversation_started', {
      roleId: this.selectedConversationRoleId,
      targetTurns: this.conversationTargetTurns,
      maxTurns: this.conversationTargetTurns,
      rule: 'exact-accepted-turn-limit',
    });
    this.scrollConversationToBottom();
  }

  async sendConversationMessage(): Promise<void> {
    const text = this.conversationInput.trim();
    const config = this.conversationConfig;
    if (
      !text ||
      !config ||
      !this.lessonView ||
      !this.conversationStarted ||
      this.conversationBusy ||
      this.conversationComplete ||
      this.conversationAwaitingContinueDecision
    ) {
      return;
    }

    const inputMode: LessonConversationDeliveryMode = this.conversationComposerMode;
    const pendingVoiceNote = inputMode === 'voice' ? this.pendingConversationVoiceNote : null;
    if (inputMode === 'voice' && !pendingVoiceNote) {
      this.conversationMicError = 'سجّل إجابتك أولًا ثم اضغط إرسال التسجيل.';
      return;
    }

    if (inputMode === 'voice' && this.isConversationUnderstandingRequest(text)) {
      this.handleConversationUnderstandingRequest(text, pendingVoiceNote);
      return;
    }

    const learningTurnIndex = this.conversationLearningTurns;
    const previousMessages = [...this.conversationMessages];
    const messages: LessonConversationHistoryMessage[] = [
      ...previousMessages,
      { role: 'student', text, deliveryMode: inputMode },
    ];
    this.conversationMessages = messages;
    const rawStudentTurn = this.studentConversationTurns;
    if (pendingVoiceNote) {
      this.conversationVoiceNotes[rawStudentTurn] = pendingVoiceNote;
      this.pendingConversationVoiceNote = null;
      const clientRecordingId = `conversation-${this.auth.currentUser?.studentId}-${this.lessonView.lesson.id}-${Date.now()}`;
      void this.trackingApi.uploadRecording({
        studentId: this.auth.currentUser?.studentId || '',
        groupId: this.lessonView.groupId,
        lessonId: this.lessonView.lesson.id,
        lessonTitle: this.lessonView.lesson.title,
        curriculumSlotId: this.lessonView.curriculumSlotId,
        stageId: this.stageId,
        recordingType: 'conversation',
        clientRecordingId,
        attemptNumber: rawStudentTurn,
        durationMs: pendingVoiceNote.durationSeconds * 1000,
      }, pendingVoiceNote.blob).then((saved) => {
        if (!saved) return;
        return this.trackingApi.trackEvent({
          studentId: this.auth.currentUser?.studentId || '',
          studentName: this.auth.currentUser?.name || '',
          groupId: this.lessonView?.groupId || '',
          groupName: this.auth.currentUser?.groupName || this.lessonView?.groupId || '',
          cefrLevel: this.auth.currentUser?.cefrLevel || 'A1',
          lessonId: this.lessonView?.lesson.id || '',
          lessonTitle: this.lessonView?.lesson.title || '',
          curriculumSlotId: this.lessonView?.curriculumSlotId || '',
          stageId: this.stageId,
          eventType: 'conversation_recording_uploaded',
          status: 'success',
          detailsJson: JSON.stringify({ recordingId: saved.id, turn: rawStudentTurn, sizeBytes: pendingVoiceNote.blob.size }),
          durationMs: pendingVoiceNote.durationSeconds * 1000,
          occurredAtUtc: new Date().toISOString(),
          correlationId: `conversation-recording-${saved.id}`,
        });
      });
    }
    this.conversationLastInputMode = inputMode;
    this.conversationInput = '';
    this.conversationBusy = true;
    this.conversationError = '';
    this.conversationHintsVisible = false;
    this.scrollConversationToBottom();

    try {
      const response = await this.lessonAiApi.sendConversationTurn({
        lessonId: this.lessonView.lesson.id,
        lessonTitle: this.lessonView.lesson.title,
        config,
        selectedRoleId: this.selectedConversationRoleId || 'default',
        turnIndex: learningTurnIndex,
        messages,
        vocabulary: (this.lessonView.lesson.vocabulary || [])
          .filter((item) => item.includeForStudent !== false && item.term.trim())
          .map((item) => ({
            kind: item.kind === 'chunk' ? 'chunk' : 'word',
            term: item.term,
            translation: item.translation,
            example: item.example,
          })),
        lessonSentences: this.lessonView.lesson.segments
          .map((segment) => segment.text.trim())
          .filter(Boolean),
        priorKnowledge: this.knowledgeBank.buildAiSnapshot(
          this.courseFacade.getCourse(),
          this.lessonView.lesson.id,
        ),
        studentMessage: text,
        inputMode,
        phase: this.conversationPhase,
        completedLearningTurns: this.conversationLearningTurns,
        requiredLearningTurns: this.conversationTargetTurns,
        maxLearningTurns: this.conversationMaxTurns,
        finishRequested: learningTurnIndex + 1 >= this.conversationTargetTurns,
      });

      const assistantMessageIndex = messages.length;
      this.conversationMessages = [
        ...messages,
        { role: 'assistant', text: response.assistantMessage, deliveryMode: inputMode },
      ];
      this.conversationFeedbacks = [
        ...this.conversationFeedbacks,
        {
          turn: rawStudentTurn,
          answer: text,
          inputMode,
          feedback: response.feedback,
        },
      ];
      this.conversationProvider = response.provider;
      this.trackStageAction('conversation_turn_evaluated', {
        turn: rawStudentTurn,
        inputMode,
        provider: response.provider,
        needsRetry: response.feedback.needsRetry,
        correctionCount: response.feedback.spellingCorrections?.length || 0,
        usedTargetPhraseCount: response.feedback.usedTargetPhrases?.length || 0,
      }, response.feedback.needsRetry ? 'retry-required' : 'success');

      if (!response.feedback.needsRetry && this.conversationPhase !== 'closing') {
        this.conversationLearningTurns += 1;
      }

      if (inputMode === 'voice') {
        this.autoPlayConversationAssistantVoice(assistantMessageIndex, response.assistantMessage);
      }

      if (
        !response.feedback.needsRetry &&
        this.conversationLearningTurns >= this.conversationTargetTurns
      ) {
        this.diagnostics.check('StudentStage', 'conversation-turn-limit-reached', true, {
          acceptedTurns: this.conversationLearningTurns,
          targetTurns: this.conversationTargetTurns,
          textTurns: this.conversationTextTurnCount,
          voiceTurns: this.conversationVoiceTurnCount,
        });
        this.finishConversationStageAndShowTransition();
      }

      this.scrollConversationToBottom();
    } catch (error) {
      this.conversationMessages = previousMessages;
      this.conversationInput = text;
      if (pendingVoiceNote) {
        delete this.conversationVoiceNotes[rawStudentTurn];
        this.pendingConversationVoiceNote = pendingVoiceNote;
      }
      this.conversationError = this.lessonAiApi.getUserMessage(error);
      this.trackStageAction('conversation_turn_failed', {
        turn: rawStudentTurn,
        inputMode,
        message: this.conversationError,
      }, 'failed');
    } finally {
      this.conversationBusy = false;
      this.cdr.detectChanges();
    }
  }

  setConversationComposerMode(mode: LessonConversationDeliveryMode): void {
    if (this.conversationBusy || this.conversationRecording) return;
    if (mode === this.conversationComposerMode) return;
    if (this.pendingConversationVoiceNote) this.cancelPendingConversationVoiceNote();
    this.conversationInput = '';
    this.conversationHintsVisible = false;
    this.conversationComposerMode = mode;
    this.conversationMicError = '';
    this.diagnostics.check('StudentStage', 'conversation-input-mode', true, { mode });
    this.cdr.detectChanges();
  }

  toggleConversationHints(): void {
    if (this.conversationBusy || this.conversationComplete || this.conversationRecording) return;
    this.conversationHintsVisible = !this.conversationHintsVisible;
  }

  useSuggestedReply(text: string): void {
    if (this.conversationBusy || this.conversationComplete) return;
    this.conversationInput = text.replace(/[“”"]/g, '').trim();
    this.conversationHintsVisible = false;
    window.setTimeout(() => this.conversationTextInput?.nativeElement.focus(), 0);
  }

  retryConversationAnswer(): void {
    if (this.conversationBusy || this.conversationComplete) return;
    this.conversationInput = '';
    this.conversationHintsVisible = false;
    window.setTimeout(() => this.conversationTextInput?.nativeElement.focus(), 0);
  }

  continueConversationAfterTarget(): void {
    if (!this.conversationAwaitingContinueDecision || this.conversationBusy) return;
    this.conversationAwaitingContinueDecision = false;
    this.conversationPhase = 'extended';
    this.conversationHintsVisible = false;
    window.setTimeout(() => this.conversationTextInput?.nativeElement.focus(), 0);
  }

  async requestConversationFinish(): Promise<void> {
    if (this.conversationBusy || this.conversationComplete) return;
    await this.beginConversationClosing(false);
  }

  insertConversationEmoji(): void {
    if (this.conversationBusy || this.conversationComplete) return;
    this.conversationInput = `${this.conversationInput}${this.conversationInput ? ' ' : ''}🙂`;
    window.setTimeout(() => this.conversationTextInput?.nativeElement.focus(), 0);
  }

  async toggleConversationRecording(): Promise<void> {
    if (
      this.conversationBusy ||
      this.conversationComplete ||
      this.conversationAwaitingContinueDecision
    ) return;
    if (this.conversationRecording) {
      this.stopConversationRecording();
      return;
    }
    await this.startConversationRecording();
  }

  cancelPendingConversationVoiceNote(): void {
    const note = this.pendingConversationVoiceNote;
    if (!note) return;
    if (this.conversationAudio?.src === note.url) {
      this.conversationAudio.pause();
      this.conversationAudio = null;
      this.conversationPlayingVoiceTurn = null;
    }
    URL.revokeObjectURL(note.url);
    this.pendingConversationVoiceNote = null;
  }

  playConversationVoiceNote(turn: number): void {
    const note = this.conversationVoiceNotes[turn];
    if (!note) return;

    if (this.conversationPlayingVoiceTurn === turn && this.conversationAudio) {
      this.conversationAudio.pause();
      this.conversationAudio.currentTime = 0;
      this.conversationAudio = null;
      this.conversationPlayingVoiceTurn = null;
      this.cdr.detectChanges();
      return;
    }

    this.conversationAudio?.pause();
    const audio = new Audio(note.url);
    this.conversationAudio = audio;
    this.conversationPlayingVoiceTurn = turn;
    audio.onended = () => {
      if (this.conversationAudio === audio) {
        this.conversationAudio = null;
        this.conversationPlayingVoiceTurn = null;
        this.cdr.detectChanges();
      }
    };
    audio.onerror = () => {
      if (this.conversationAudio === audio) {
        this.conversationAudio = null;
        this.conversationPlayingVoiceTurn = null;
        this.cdr.detectChanges();
      }
    };
    void audio.play().catch(() => {
      this.conversationAudio = null;
      this.conversationPlayingVoiceTurn = null;
      this.cdr.detectChanges();
    });
    this.cdr.detectChanges();
  }

  playConversationAssistantVoice(messageIndex: number, text: string, slow = false): void {
    if (!text.trim() || !('speechSynthesis' in window)) return;
    if (this.conversationPlayingAssistantIndex === messageIndex && this.conversationSpeechUtterance) {
      window.speechSynthesis.cancel();
      this.conversationSpeechUtterance = null;
      this.conversationPlayingAssistantIndex = null;
      this.cdr.detectChanges();
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = slow ? 0.72 : 0.94;
    utterance.pitch = 1;
    const voice = this.getPreferredConversationVoice();
    if (voice) utterance.voice = voice;
    this.conversationSpeechUtterance = utterance;
    this.conversationPlayingAssistantIndex = messageIndex;
    utterance.onend = () => this.clearConversationAssistantVoice(messageIndex, utterance);
    utterance.onerror = () => this.clearConversationAssistantVoice(messageIndex, utterance);
    window.speechSynthesis.speak(utterance);
    this.cdr.detectChanges();
  }

  revealConversationAssistantTranscript(messageIndex: number, replaySlow = false): void {
    const message = this.conversationMessages[messageIndex];
    if (!message || message.role !== 'assistant') return;
    this.conversationAssistantTranscriptVisible[messageIndex] = true;
    if (replaySlow) this.playConversationAssistantVoice(messageIndex, message.text, true);
    this.cdr.detectChanges();
  }

  isConversationAssistantTranscriptVisible(messageIndex: number): boolean {
    return this.conversationAssistantTranscriptVisible[messageIndex] === true;
  }

  conversationStudentTurnForMessage(messageIndex: number): number {
    if (this.conversationMessages[messageIndex]?.role !== 'student') return 0;
    let turn = 0;
    for (let index = 0; index <= messageIndex; index += 1) {
      if (this.conversationMessages[index]?.role === 'student') turn += 1;
    }
    return turn;
  }

  conversationVoiceNoteForMessage(messageIndex: number): ConversationVoiceNote | null {
    const turn = this.conversationStudentTurnForMessage(messageIndex);
    return turn ? this.conversationVoiceNotes[turn] || null : null;
  }

  conversationFeedbackForMessage(messageIndex: number): ConversationFeedbackView | null {
    const turn = this.conversationStudentTurnForMessage(messageIndex);
    return turn
      ? this.conversationFeedbacks.find((item) => item.turn === turn) || null
      : null;
  }

  conversationFeedbackLabel(feedback: LessonConversationFeedback): string {
    if (feedback.needsRetry) return 'جرّب الإجابة مرة أخرى';
    if (feedback.evaluation === 'good') return 'صياغة رائعة!';
    if (feedback.evaluation === 'incorrect') return 'راجع معنى الرد';
    return 'ملاحظة صغيرة';
  }

  formatConversationDuration(totalSeconds: number): string {
    const seconds = Math.max(0, Math.round(totalSeconds));
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
  }

  async endConversationEarly(): Promise<void> {
    if (this.conversationBusy || this.conversationComplete) return;
    const confirmed = window.confirm('هل تريد بدء إنهاء المحادثة بشكل طبيعي؟');
    if (!confirmed) return;
    await this.beginConversationClosing(false);
  }

  finishConversation(): void {
    if (!this.conversationComplete) return;
    this.completeAndContinue();
  }

  skipEmptyConversation(): void {
    this.completeAndContinue();
  }

  private async beginConversationClosing(skipConfirmation: boolean): Promise<void> {
    void skipConfirmation;
    const config = this.conversationConfig;
    if (!config || !this.lessonView || this.conversationBusy || this.conversationComplete) return;

    this.stopConversationRecording();
    this.conversationAwaitingContinueDecision = false;
    this.conversationHintsVisible = false;
    this.conversationBusy = true;
    this.conversationError = '';
    const inputMode = this.conversationLastInputMode;

    try {
      const response = await this.lessonAiApi.sendConversationTurn({
        lessonId: this.lessonView.lesson.id,
        lessonTitle: this.lessonView.lesson.title,
        config,
        selectedRoleId: this.selectedConversationRoleId || 'default',
        turnIndex: this.conversationLearningTurns,
        messages: this.conversationMessages,
        vocabulary: (this.lessonView.lesson.vocabulary || [])
          .filter((item) => item.includeForStudent !== false && item.term.trim())
          .map((item) => ({
            kind: item.kind === 'chunk' ? 'chunk' : 'word',
            term: item.term,
            translation: item.translation,
            example: item.example,
          })),
        lessonSentences: this.lessonView.lesson.segments
          .map((segment) => segment.text.trim())
          .filter(Boolean),
        priorKnowledge: this.knowledgeBank.buildAiSnapshot(
          this.courseFacade.getCourse(),
          this.lessonView.lesson.id,
        ),
        studentMessage: this.conversationMessages.filter((message) => message.role === 'student').at(-1)?.text || '',
        inputMode,
        phase: 'closing',
        completedLearningTurns: this.conversationLearningTurns,
        requiredLearningTurns: this.conversationTargetTurns,
        maxLearningTurns: this.conversationMaxTurns,
        finishRequested: true,
      });
      const assistantIndex = this.conversationMessages.length;
      this.conversationMessages = [
        ...this.conversationMessages,
        { role: 'assistant', text: response.assistantMessage, deliveryMode: inputMode },
      ];
      this.conversationProvider = response.provider;
      this.conversationPhase = 'closing';
      if (inputMode === 'voice') {
        this.autoPlayConversationAssistantVoice(assistantIndex, response.assistantMessage);
      }
      this.scrollConversationToBottom();
    } catch (error) {
      this.conversationError = this.lessonAiApi.getUserMessage(error);
      this.trackStageAction('conversation_finish_failed', {
        turn: this.studentConversationTurns,
        inputMode,
        message: this.conversationError,
      }, 'failed');
    } finally {
      this.conversationBusy = false;
      this.cdr.detectChanges();
    }
  }

  private isConversationUnderstandingRequest(text: string): boolean {
    const normalized = text.toLowerCase().replace(/[^a-z\s']/g, ' ').replace(/\s+/g, ' ').trim();
    return [
      "i don't understand",
      'i do not understand',
      "i didn't understand",
      'i did not understand',
      'can you say that again',
      'say that again',
      'please repeat',
      'repeat please',
      'what did you say',
    ].some((phrase) => normalized.includes(phrase));
  }

  private handleConversationUnderstandingRequest(
    text: string,
    pendingVoiceNote: ConversationVoiceNote | null,
  ): void {
    const lastAssistantIndex = [...this.conversationMessages]
      .map((message, index) => ({ message, index }))
      .reverse()
      .find(({ message }) => message.role === 'assistant' && message.deliveryMode === 'voice')?.index;

    const messages: LessonConversationHistoryMessage[] = [
      ...this.conversationMessages,
      { role: 'student', text, deliveryMode: 'voice' },
    ];
    this.conversationMessages = messages;
    const rawStudentTurn = this.studentConversationTurns;
    if (pendingVoiceNote) {
      this.conversationVoiceNotes[rawStudentTurn] = pendingVoiceNote;
      this.pendingConversationVoiceNote = null;
    }
    this.conversationInput = '';
    if (lastAssistantIndex !== undefined) {
      this.revealConversationAssistantTranscript(lastAssistantIndex, true);
    } else {
      this.conversationMicError = 'لا توجد رسالة صوتية سابقة لعرض نصها.';
    }
    this.scrollConversationToBottom();
    this.cdr.detectChanges();
  }

  private autoPlayConversationAssistantVoice(messageIndex: number, text: string): void {
    window.setTimeout(() => this.playConversationAssistantVoice(messageIndex, text), 120);
  }

  private getPreferredConversationVoice(): SpeechSynthesisVoice | null {
    if (!('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    const english = voices.filter((voice) => /^en([-_]|$)/i.test(voice.lang));
    if (!english.length) return null;

    const score = (voice: SpeechSynthesisVoice): number => {
      const name = `${voice.name} ${voice.voiceURI}`.toLowerCase();
      let value = 0;
      if (name.includes('natural') || name.includes('neural') || name.includes('online')) value += 100;
      if (name.includes('microsoft')) value += 35;
      if (/(aria|jenny|guy|sonia|ryan|ava|andrew|emma|brian)/.test(name)) value += 45;
      if (/en-us/i.test(voice.lang)) value += 20;
      // The learner explicitly prefers a natural voice rather than a Google-style TTS voice.
      if (name.includes('google')) value -= 100;
      if (voice.default) value += 5;
      return value;
    };

    return [...english].sort((a, b) => score(b) - score(a))[0] || null;
  }

  private clearConversationAssistantVoice(
    messageIndex: number,
    utterance: SpeechSynthesisUtterance,
  ): void {
    if (this.conversationSpeechUtterance !== utterance) return;
    this.conversationSpeechUtterance = null;
    if (this.conversationPlayingAssistantIndex === messageIndex) {
      this.conversationPlayingAssistantIndex = null;
    }
    this.cdr.detectChanges();
  }

  private completeAndContinue(quizScore?: number): void {
    if (!this.lessonView || !this.stage) return;

    const lessonBeforeSave = this.lessonView;
    const finishedStage = this.stage;
    const currentIndex = lessonBeforeSave.stages.findIndex(
      (stage) => stage.id === this.stageId,
    );

    const updated = this.courseFacade.completeStage(
      lessonBeforeSave,
      this.stageId,
      quizScore,
    );

    // Keep the freshly saved progress in the current view, but do NOT navigate yet.
    // The learner should always see a clear transition popup after completing a stage.
    if (updated) this.lessonView = updated;
    this.stageCompletionNextStage = updated?.stages[currentIndex + 1] || null;
    this.stageCompletionFinishedLabel = finishedStage.label;
    this.stageCompletionFinishedNumber = currentIndex + 1;
    this.applyStageCompletionEvaluation(finishedStage.activityType, quizScore);
    this.stageCompletionPopupOpen = true;
    const stageDurationMs = Math.max(0, Date.now() - this.stageStartedAtMs);
    this.diagnostics.check('StudentStage', 'completion-summary-ready', true, {
      stageId: finishedStage.id,
      activityType: finishedStage.activityType,
      score: this.stageCompletionScore,
      scoreLabel: this.stageCompletionScoreLabel,
      nextStage: this.stageCompletionNextStage?.label || 'lesson-complete',
      durationMs: stageDurationMs,
    });
    this.trackStageAction('stage_evaluated', {
      activityType: finishedStage.activityType,
      score: this.stageCompletionScore,
      scoreLabel: this.stageCompletionScoreLabel,
      qualityLabel: this.stageCompletionQualityLabel,
      metrics: this.stageCompletionMetrics,
      insightSections: this.stageCompletionInsightSections,
      durationMs: stageDurationMs,
    });
    this.cdr.detectChanges();
  }

  private applyStageCompletionEvaluation(activityType: LessonActivity['type'], quizScore?: number): void {
    const duration = this.formatStageDuration(Math.max(0, Date.now() - this.stageStartedAtMs));
    this.stageCompletionNote = '';
    this.stageCompletionMetrics = [];
    this.stageCompletionInsightSections = [];

    if (activityType === 'vocabulary') {
      const total = this.vocabulary.length;
      const score = total ? Math.round((this.vocabularyKnownCount / total) * 100) : null;
      this.stageCompletionScore = score;
      this.stageCompletionScoreLabel = 'ثبات الكلمات من أول مرور';
      this.stageCompletionQualityLabel = score === null ? 'تمت المرحلة' : this.qualityLabelForScore(score);
      this.stageCompletionMetrics = [
        { label: 'عرفتها', value: `${this.vocabularyKnownCount}` },
        { label: 'تحتاج مراجعة', value: `${this.vocabularyReviewCount}` },
        { label: 'وقت المرحلة', value: duration },
      ];
      this.stageCompletionNote = 'هذه النتيجة تقيس اختيارك «عارفها» في المرور الحالي، وليست حكمًا نهائيًا على إتقان الكلمة.';
      return;
    }

    if (activityType === 'listen-write') {
      const scores = Object.values(this.dictationFirstAttemptScores);
      const score = scores.length
        ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length)
        : null;
      this.stageCompletionScore = score;
      this.stageCompletionScoreLabel = 'دقة الاستماع والكتابة';
      this.stageCompletionQualityLabel = score === null ? 'تمت المرحلة' : this.qualityLabelForScore(score);
      this.stageCompletionMetrics = [
        { label: 'جمل تم حلها', value: `${scores.length}/${this.dictationSegments.length}` },
        { label: 'من أول محاولة', value: score === null ? '—' : `${score}%` },
        { label: 'وقت المرحلة', value: duration },
      ];
      this.stageCompletionNote = 'الدقة مبنية على الكلمات الصحيحة في أول محاولة لكل جملة؛ التصحيح بعد ذلك يساعدك على التعلم لكنه لا يغيّر نتيجة أول محاولة.';
      return;
    }

    if (activityType === 'quiz') {
      const score = this.quizQuestions.length ? (quizScore ?? this.quizScore) : null;
      const correct = this.quizQuestions.filter((question) => this.quizResults[question.id]).length;
      this.stageCompletionScore = score;
      this.stageCompletionScoreLabel = 'نتيجة الاختبار';
      this.stageCompletionQualityLabel = score === null ? 'تمت المرحلة' : this.qualityLabelForScore(score);
      this.stageCompletionMetrics = [
        { label: 'إجابات صحيحة', value: `${correct}/${this.quizQuestions.length}` },
        { label: 'النتيجة', value: score === null ? '—' : `${score}%` },
        { label: 'وقت المرحلة', value: duration },
      ];
      return;
    }

    if (activityType === 'ai-conversation') {
      const evaluated = this.conversationFeedbacks.length;
      const score = this.conversationEvaluationScore;
      this.stageCompletionScore = score;
      this.stageCompletionScoreLabel = 'جودة إجابات المحادثة';
      this.stageCompletionQualityLabel = score === null ? 'تمت المحادثة' : this.qualityLabelForScore(score);
      this.stageCompletionMetrics = [
        { label: 'جولات مكتملة', value: `${this.conversationLearningTurns}/${this.conversationTargetTurns}` },
        { label: 'شات / ريكورد', value: `${this.conversationTextTurnCount} / ${this.conversationVoiceTurnCount}` },
        { label: 'وقت المرحلة', value: duration },
      ];
      this.stageCompletionInsightSections = [
        {
          title: 'ركز على القواعد',
          items: this.conversationGrammarFocus.length ? this.conversationGrammarFocus : ['لا توجد قاعدة متكررة تحتاج تركيزًا واضحًا في هذه المحادثة.'],
          tone: 'focus',
        },
        {
          title: 'راجع الكلمات',
          items: this.conversationVocabularyFocus.length ? this.conversationVocabularyFocus : ['لم تظهر كلمات متكررة تحتاج مراجعة خاصة.'],
          tone: 'review',
        },
        {
          title: 'كنت كويس في',
          items: this.conversationStrengths.length ? this.conversationStrengths : ['إكمال المحادثة حتى النهاية داخل نفس الموقف.'],
          tone: 'success',
        },
      ];
      this.stageCompletionNote = `التقييم مبني على ${evaluated} ردود داخل هذه المحادثة. إجابات الريكورد تُقيَّم من النص الذي التقطه Speech Recognition، وليس كحكم على الـaccent أو النطق.`;
      return;
    }

    this.stageCompletionScore = null;
    this.stageCompletionScoreLabel = 'حالة المرحلة';
    this.stageCompletionQualityLabel = 'تمت المرحلة بنجاح';
    this.stageCompletionMetrics = [
      { label: 'وقت المرحلة', value: duration },
    ];
  }

  private topConversationItems(items: string[], limit: number): string[] {
    const counts = new Map<string, { label: string; count: number }>();
    for (const raw of items) {
      const label = String(raw || '').trim();
      if (!label) continue;
      const key = label.toLowerCase();
      const current = counts.get(key);
      counts.set(key, { label: current?.label || label, count: (current?.count || 0) + 1 });
    }
    return [...counts.values()]
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
      .slice(0, limit)
      .map((item) => item.label);
  }

  private qualityLabelForScore(score: number): string {
    if (score >= 90) return 'ممتاز';
    if (score >= 80) return 'جيد جدًا';
    if (score >= 65) return 'جيد';
    if (score >= 50) return 'مقبول ويحتاج مراجعة';
    return 'يحتاج مراجعة';
  }

  private formatStageDuration(durationMs: number): string {
    const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    return `${String(minutes).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
  }

  continueFromStageCompletion(): void {
    if (!this.lessonView) return;
    const destination =
      this.stageCompletionNextStage?.path ||
      `/student/lessons/${this.lessonView.lesson.id}/complete`;
    const slotId = this.lessonView.curriculumSlotId;
    this.stageCompletionPopupOpen = false;
    void this.router.navigateByUrl(
      `${destination}?slotId=${encodeURIComponent(slotId)}`,
    );
  }

  stayOnCompletedStage(): void {
    this.stageCompletionPopupOpen = false;
    this.cdr.detectChanges();
  }

  private finishConversationStageAndShowTransition(): void {
    if (this.conversationComplete) return;
    this.conversationComplete = true;
    this.persistConversationSummary();
    this.completeAndContinue();
  }

  private persistConversationSummary(): void {
    if (!this.lessonView) return;
    this.learningRepository.saveConversationSummary({
      id: `conversation-${this.lessonView.curriculumSlotId}`,
      studentId: this.lessonView.progress?.studentId || this.auth.currentUser?.studentId || '',
      groupId: this.lessonView.groupId,
      curriculumSlotId: this.lessonView.curriculumSlotId,
      lessonId: this.lessonView.lesson.id,
      totalStudentTurns: this.studentConversationTurns,
      acceptedTurns: this.conversationLearningTurns,
      goodAnswers: this.conversationGoodAnswerCount,
      correctionCount: this.conversationCorrectionCount,
      usedTargetPhrases: Array.from(
        new Set(
          this.conversationFeedbacks.flatMap(
            (item) => item.feedback.usedTargetPhrases || [],
          ),
        ),
      ),
      textTurns: this.conversationTextTurnCount,
      voiceTurns: this.conversationVoiceTurnCount,
      grammarFocus: this.conversationGrammarFocus,
      vocabularyFocus: this.conversationVocabularyFocus,
      strengths: this.conversationStrengths,
    });
  }

  private trackStageAction(
    eventType: string,
    details: Record<string, unknown>,
    status = 'success',
  ): void {
    const view = this.lessonView;
    const stage = this.stage;
    const studentId = this.auth.currentUser?.studentId || '';
    const elapsed = this.diagnostics.start('StudentStage', eventType, {
      studentId,
      lessonId: view?.lesson.id || '',
      stageId: stage?.id || this.stageId,
    });
    const valid = !!view && !!stage && !!studentId;
    this.diagnostics.check('StudentStage', `${eventType}-identity`, valid, {
      studentId,
      lessonId: view?.lesson.id || '',
      stageId: stage?.id || this.stageId,
    });
    if (!valid || !view || !stage) return;

    void this.trackingApi.trackEvent({
      studentId,
      studentName: this.auth.currentUser?.name || studentId,
      groupId: view.groupId,
      groupName: this.auth.currentUser?.groupName || view.groupId,
      cefrLevel: this.auth.currentUser?.cefrLevel || 'A1',
      lessonId: view.lesson.id,
      lessonTitle: view.lesson.title,
      curriculumSlotId: view.curriculumSlotId,
      stageId: stage.id,
      eventType,
      status,
      detailsJson: JSON.stringify(details),
      occurredAtUtc: new Date().toISOString(),
      correlationId: `${eventType}-${studentId}-${Date.now()}`,
    }).then((saved) => {
      this.diagnostics.success('StudentStage', eventType, elapsed(), {
        studentId,
        lessonId: view.lesson.id,
        stageId: stage.id,
        remoteSaved: !!saved,
      });
    });
  }

  private stopDictationAudio(): void {
    if (this.playbackTimerId !== null) {
      window.clearTimeout(this.playbackTimerId);
      this.playbackTimerId = null;
    }
    this.dictationAudio?.nativeElement.pause();
  }

  private resetStageUi(): void {
    this.stopDictationAudio();
    this.lessonView = null;
    this.vocabulary = [];
    this.quizQuestions = [];
    this.activeIndex = 0;
    this.vocabularyRevealed = false;
    this.vocabularyAnimation = 'idle';
    if (this.vocabularyAnimationTimerId !== null) {
      window.clearTimeout(this.vocabularyAnimationTimerId);
      this.vocabularyAnimationTimerId = null;
    }
    this.mediaUrl = '';
    this.dictationAnswer = '';
    this.dictationSubmitted = false;
    this.dictationCorrect = false;
    this.wrongWords = [];
    this.dictationTokenReview = [];
    this.dictationCorrectionTarget = '';
    this.dictationCorrectionAnswer = '';
    this.dictationCorrectionError = '';
    this.showDictationAnswer = false;
    this.quizSelectedOption = '';
    this.quizOrderedWordIndexes = [];
    this.quizSubmitted = false;
    this.quizCorrect = false;
    this.quizResults = {};
    this.cleanupConversationAudio();
    this.conversationInput = '';
    this.conversationLearningTurns = 0;
    this.conversationPhase = 'required';
    this.conversationAwaitingContinueDecision = false;
    this.conversationHintsVisible = false;
    this.conversationLastInputMode = 'text';
    this.conversationComposerMode = 'text';
    this.conversationAssistantTranscriptVisible = {};
    this.conversationPlayingAssistantIndex = null;
    this.selectedConversationRoleId = '';
    this.conversationStarted = false;
    this.conversationBusy = false;
    this.conversationComplete = false;
    this.conversationError = '';
    this.conversationProvider = '';
    this.conversationMessages = [];
    this.conversationFeedbacks = [];
    this.conversationRecording = false;
    this.conversationRecordingSeconds = 0;
    this.conversationRecordingInterim = '';
    this.conversationMicError = '';
    this.conversationPlayingVoiceTurn = null;
    this.conversationVoiceNotes = {};
    this.pendingConversationVoiceNote = null;
    this.stageCompletionPopupOpen = false;
    this.stageCompletionNextStage = null;
    this.stageCompletionFinishedLabel = '';
    this.stageCompletionFinishedNumber = 0;
    this.stageCompletionScore = null;
    this.stageCompletionScoreLabel = 'نتيجة المرحلة';
    this.stageCompletionQualityLabel = '';
    this.stageCompletionNote = '';
    this.stageCompletionMetrics = [];
    this.stageCompletionInsightSections = [];
    this.vocabularyKnownCount = 0;
    this.vocabularyReviewCount = 0;
    this.dictationFirstAttemptScores = {};
    this.stageStartedAtMs = Date.now();
    this.failedVocabularyImages.clear();
  }

  private async startConversationRecording(): Promise<void> {
    this.conversationMicError = '';
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      this.conversationMicError = 'المتصفح الحالي لا يدعم تسجيل الصوت. استخدم Chrome أو Edge.';
      return;
    }

    try {
      this.cancelPendingConversationVoiceNote();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.conversationMediaStream = stream;
      this.conversationVoiceChunks = [];
      this.conversationRecordingSeconds = 0;
      this.conversationRecordingInterim = '';
      this.conversationRecognitionBaseInput = this.conversationInput.trim();

      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(
        (type) => MediaRecorder.isTypeSupported(type),
      );
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      this.conversationMediaRecorder = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.conversationVoiceChunks.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(this.conversationVoiceChunks, {
          type: recorder.mimeType || mimeType || 'audio/webm',
        });
        this.conversationVoiceChunks = [];
        if (blob.size > 0) {
          this.pendingConversationVoiceNote = {
            url: URL.createObjectURL(blob),
            durationSeconds: Math.max(1, this.conversationRecordingSeconds),
            blob,
          };
        }
        this.cdr.detectChanges();
      };

      recorder.start(250);
      this.conversationRecording = true;
      this.conversationRecordingTimerId = window.setInterval(() => {
        this.conversationRecordingSeconds += 1;
        this.cdr.detectChanges();
      }, 1000);
      this.startConversationSpeechRecognition();
      this.cdr.detectChanges();
    } catch (error) {
      this.conversationMicError =
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'اسمح للموقع باستخدام الميكروفون ثم جرّب مرة أخرى.'
          : 'تعذر تشغيل الميكروفون. تأكد أنه غير مستخدم في برنامج آخر.';
      this.cleanupConversationRecorderOnly();
      this.cdr.detectChanges();
    }
  }

  stopConversationRecording(): void {
    if (!this.conversationRecording && !this.conversationMediaRecorder) return;
    this.conversationRecording = false;
    if (this.conversationRecordingTimerId !== null) {
      window.clearInterval(this.conversationRecordingTimerId);
      this.conversationRecordingTimerId = null;
    }

    try {
      if (this.conversationSpeechRecognition) this.conversationSpeechRecognition.stop();
    } catch {}
    this.conversationSpeechRecognition = null;

    const recorder = this.conversationMediaRecorder;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {}
    }
    this.conversationMediaRecorder = null;
    this.conversationMediaStream?.getTracks().forEach((track) => track.stop());
    this.conversationMediaStream = null;
    this.conversationRecordingInterim = '';
    this.cdr.detectChanges();
  }

  private startConversationSpeechRecognition(): void {
    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      this.conversationMicError =
        'الصوت سيتسجل، لكن التحويل الفوري إلى نص غير مدعوم في هذا المتصفح.';
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event: any) => {
      let finalText = '';
      let interimText = '';
      for (let index = 0; index < event.results.length; index += 1) {
        const transcript = String(event.results[index]?.[0]?.transcript || '').trim();
        if (!transcript) continue;
        if (event.results[index].isFinal) finalText += ` ${transcript}`;
        else interimText += ` ${transcript}`;
      }
      const combined = [
        this.conversationRecognitionBaseInput,
        finalText.trim(),
        interimText.trim(),
      ]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      this.conversationInput = combined;
      this.conversationRecordingInterim = interimText.trim();
      this.cdr.detectChanges();
    };
    recognition.onerror = (event: any) => {
      const code = String(event?.error || '');
      if (code && code !== 'aborted' && code !== 'no-speech') {
        this.conversationMicError = `تعذر تحويل الصوت إلى نص (${code}). يمكنك كتابة الرد وإرسال التسجيل كما هو.`;
        this.cdr.detectChanges();
      }
    };
    recognition.onend = () => {
      if (this.conversationSpeechRecognition === recognition) {
        this.conversationSpeechRecognition = null;
      }
    };
    this.conversationSpeechRecognition = recognition;
    try {
      recognition.start();
    } catch {
      this.conversationSpeechRecognition = null;
    }
  }

  private cleanupConversationRecorderOnly(): void {
    if (this.conversationRecordingTimerId !== null) {
      window.clearInterval(this.conversationRecordingTimerId);
      this.conversationRecordingTimerId = null;
    }
    try {
      if (this.conversationSpeechRecognition) this.conversationSpeechRecognition.abort();
    } catch {}
    this.conversationSpeechRecognition = null;
    try {
      if (this.conversationMediaRecorder) {
        this.conversationMediaRecorder.ondataavailable = null;
        this.conversationMediaRecorder.onstop = null;
        if (this.conversationMediaRecorder.state !== 'inactive') this.conversationMediaRecorder.stop();
      }
    } catch {}
    this.conversationMediaRecorder = null;
    this.conversationMediaStream?.getTracks().forEach((track) => track.stop());
    this.conversationMediaStream = null;
    this.conversationRecording = false;
  }

  private cleanupConversationAudio(): void {
    this.cleanupConversationRecorderOnly();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    this.conversationSpeechUtterance = null;
    this.conversationPlayingAssistantIndex = null;
    this.conversationAudio?.pause();
    this.conversationAudio = null;
    this.conversationPlayingVoiceTurn = null;
    if (this.pendingConversationVoiceNote) {
      URL.revokeObjectURL(this.pendingConversationVoiceNote.url);
    }
    Object.values(this.conversationVoiceNotes).forEach((note) => URL.revokeObjectURL(note.url));
    this.pendingConversationVoiceNote = null;
    this.conversationVoiceNotes = {};
  }

  private scrollConversationToBottom(): void {
    window.setTimeout(() => {
      const element = this.conversationChat?.nativeElement;
      if (element) element.scrollTop = element.scrollHeight;
    }, 0);
  }

  private tokenize(value: string): string[] {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9'\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean);
  }

  private buildTokenReview(
    expectedSentence: string,
    actualSentence: string,
  ): DictationTokenReview[] {
    const expected = this.tokenize(expectedSentence);
    const actual = this.tokenize(actualSentence);
    const rows = expected.length + 1;
    const columns = actual.length + 1;
    const lcs = Array.from({ length: rows }, () =>
      Array<number>(columns).fill(0),
    );

    for (let expectedIndex = expected.length - 1; expectedIndex >= 0; expectedIndex -= 1) {
      for (let actualIndex = actual.length - 1; actualIndex >= 0; actualIndex -= 1) {
        lcs[expectedIndex][actualIndex] =
          expected[expectedIndex] === actual[actualIndex]
            ? 1 + lcs[expectedIndex + 1][actualIndex + 1]
            : Math.max(
                lcs[expectedIndex + 1][actualIndex],
                lcs[expectedIndex][actualIndex + 1],
              );
      }
    }

    const review: DictationTokenReview[] = [];
    let expectedIndex = 0;
    let actualIndex = 0;
    while (expectedIndex < expected.length && actualIndex < actual.length) {
      if (expected[expectedIndex] === actual[actualIndex]) {
        review.push({ text: expected[expectedIndex], status: 'correct' });
        expectedIndex += 1;
        actualIndex += 1;
      } else if (
        lcs[expectedIndex + 1][actualIndex] >=
        lcs[expectedIndex][actualIndex + 1]
      ) {
        review.push({ text: expected[expectedIndex], status: 'missing' });
        expectedIndex += 1;
      } else {
        review.push({ text: actual[actualIndex], status: 'extra' });
        actualIndex += 1;
      }
    }
    while (expectedIndex < expected.length) {
      review.push({ text: expected[expectedIndex], status: 'missing' });
      expectedIndex += 1;
    }
    while (actualIndex < actual.length) {
      review.push({ text: actual[actualIndex], status: 'extra' });
      actualIndex += 1;
    }
    return review;
  }

  private normalizeAnswer(value: string): string {
    return this.tokenize(value).join(' ');
  }
}
