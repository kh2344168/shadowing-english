import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  CourseLesson,
  LessonActivity,
  LessonActivityType,
  LessonConversationConfig,
  LessonDictationItem,
  LessonQuizQuestion,
  LessonQuizQuestionType,
  LessonSegment,
  LessonVocabularyItem,
  getLessonActivities,
} from '../../../lessons/data-access/lesson.models';
import { LessonRepository } from '../../../lessons/data-access/lesson.repository';
import { LessonAiApiService } from '../../../lessons/data-access/lesson-ai-api.service';
import { LessonAiStatusResponse } from '../../../lessons/data-access/lesson-ai.models';
import { LessonContentAiService } from '../../../lessons/services/lesson-content-ai.service';

@Component({
  selector: 'app-admin-lesson-content-review-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './lesson-content-review.page.html',
  styleUrl: './lesson-content-review.page.scss',
})
export class AdminLessonContentReviewPage implements OnInit {
  lesson: CourseLesson | null = null;
  activities: LessonActivity[] = [];
  vocabulary: LessonVocabularyItem[] = [];
  selectedActivityId = '';
  vocabularyPreviewIndex = 0;
  addMenuOpen = false;
  isOverview = true;
  isStudentPreview = false;
  previewIndex = 0;
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly generatingImages = signal<Record<string, boolean>>({});
  readonly generatingAllImages = signal(false);
  readonly checkingAiStatus = signal(false);
  aiStatus: LessonAiStatusResponse | null = null;
  aiStatusError = '';
  saveMessage = '';
  saveError = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private lessonRepository: LessonRepository,
    private lessonContentAi: LessonContentAiService,
    private lessonAiApi: LessonAiApiService,
    private cdr?: ChangeDetectorRef,
  ) {}

  get contentBasePath(): '/admin' | '/teacher' {
    return this.route.snapshot.data['contentBasePath'] === '/teacher'
      ? '/teacher'
      : '/admin';
  }

  async ngOnInit(): Promise<void> {
    await this.lessonRepository.initializeFromDatabase();
    const lessonId = this.route.snapshot.paramMap.get('lessonId') || '';
    this.lesson = this.lessonRepository.getById(lessonId);

    if (this.lesson) {
      this.activities = getLessonActivities(this.lesson).map((activity) => ({
        ...activity,
        segmentIndexes: activity.segmentIndexes
          ? [...activity.segmentIndexes]
          : undefined,
      }));
      this.vocabulary = (this.lesson.vocabulary || []).map((item) => ({
        ...item,
        includeForStudent: item.includeForStudent !== false,
      }));
      this.ensureActivityContent();
      if (this.shouldCollapseUnconfiguredDefaultFlow()) {
        this.activities = this.activities.slice(0, 1);
      }

      const activityId = this.route.snapshot.paramMap.get('activityId') || '';
      const previewValue = this.route.snapshot.queryParamMap.get('preview');
      const previewDone = this.route.snapshot.queryParamMap.get('previewDone');
      this.isStudentPreview = previewValue !== null;
      this.previewIndex = Math.max(0, Number(previewValue) || 0);
      this.isOverview = !activityId && !this.isStudentPreview;
      this.selectedActivityId = this.isStudentPreview
        ? this.activities[this.previewIndex]?.id || this.activities[0]?.id || ''
        : activityId || this.activities[0]?.id || '';
      if (previewDone) {
        this.saveMessage =
          'انتهت معاينة الدرس بالكامل بنفس ترتيب الطالب. يمكنك فتح أي مرحلة للتعديل أو تغيير حالة اعتمادها.';
      }
    }

    this.loading.set(false);
    this.cdr?.detectChanges();

    if (this.lesson) void this.refreshAiStatus(false);

    if (this.isStudentPreview && this.previewActivity && this.isShadowing(this.previewActivity)) {
      void this.openPreviewAt(this.previewIndex);
    }
  }

  get selectedActivity(): LessonActivity | null {
    return (
      this.activities.find(
        (activity) => activity.id === this.selectedActivityId,
      ) || null
    );
  }

  get selectedActivityIndex(): number {
    return this.activities.findIndex(
      (activity) => activity.id === this.selectedActivityId,
    );
  }

  get previewActivity(): LessonActivity | null {
    return this.activities[this.previewIndex] || null;
  }

  get availableActivityTypes(): LessonActivityType[] {
    const candidates: LessonActivityType[] = [
      'vocabulary',
      'shadowing-review',
      'listen-write',
      'quiz',
      'ai-conversation',
    ];
    return candidates.filter(
      (type) =>
        type === 'shadowing-review' ||
        !this.activities.some((activity) => activity.type === type),
    );
  }

  get visibleVocabulary(): LessonVocabularyItem[] {
    return this.vocabulary.filter(
      (item) => item.term.trim() && item.includeForStudent !== false,
    );
  }

  get visibleWordCount(): number {
    return this.visibleVocabulary.filter((item) => item.kind !== 'chunk').length;
  }

  get visibleChunkCount(): number {
    return this.visibleVocabulary.filter((item) => item.kind === 'chunk').length;
  }

  get vocabularyPreview(): LessonVocabularyItem | null {
    return this.visibleVocabulary[this.vocabularyPreviewIndex] || null;
  }

  get selectedQuizQuestions(): LessonQuizQuestion[] {
    return (this.selectedActivity?.quizQuestions || []).filter(
      (question) => question.enabled !== false,
    );
  }

  get selectedConversationConfig(): LessonConversationConfig | null {
    return this.selectedActivity?.conversationConfig || null;
  }

  get allStagesApproved(): boolean {
    return (
      this.activities.length > 0 &&
      this.activities.every((activity) => activity.reviewStatus === 'approved')
    );
  }

  get lessonApproved(): boolean {
    return this.lesson?.status === 'ready';
  }

  get selectedSegments(): Array<{ segment: LessonSegment; index: number }> {
    if (!this.lesson || !this.selectedActivity) return [];
    return this.lesson.segments
      .map((segment, index) => ({ segment, index }))
      .filter(({ index }) => this.isSegmentIncluded(index));
  }

  selectActivity(activity: LessonActivity): void {
    this.selectedActivityId = activity.id;
    this.vocabularyPreviewIndex = 0;
    this.saveMessage = '';
    this.saveError = '';
  }

  openActivity(activity: LessonActivity): void {
    if (!this.lesson) return;
    void this.router.navigate([
      `${this.contentBasePath}/lessons`,
      this.lesson.id,
      'content-review',
      activity.id,
    ]);
  }


  async toggleActivityApproval(activity: LessonActivity): Promise<void> {
    if (!this.lesson || this.saving()) return;
    const nextApproved = activity.reviewStatus !== 'approved';
    if (nextApproved) {
      const issues = this.blockingIssues(activity);
      if (issues.length) {
        this.saveError = issues.join(' ');
        this.saveMessage = '';
        return;
      }
    }

    const previousStatus = activity.reviewStatus || 'approved';
    activity.reviewStatus = nextApproved ? 'approved' : 'pending';
    const saved = await this.saveReview();
    if (!saved) {
      activity.reviewStatus = previousStatus;
      return;
    }
    this.saveMessage = nextApproved
      ? `تم اعتماد مرحلة «${activity.title}» وحفظ القرار فورًا.`
      : `تم جعل مرحلة «${activity.title}» غير معتمدة وحفظ القرار فورًا.`;
  }

  async addActivity(type: LessonActivityType): Promise<void> {
    if (!this.lesson) return;
    const activity = this.createActivity(type);
    this.activities = [...this.activities, activity].map((item, order) => ({
      ...item,
      order,
    }));
    this.selectedActivityId = activity.id;
    this.addMenuOpen = false;
    const saved = await this.saveReview();
    if (saved) this.openActivity(activity);
  }

  async saveStageAndReturn(): Promise<void> {
    const saved = await this.saveReview();
    if (saved && this.lesson) {
      void this.router.navigate([
        `${this.contentBasePath}/lessons`,
        this.lesson.id,
        'content-review',
      ]);
    }
  }

  async moveActivity(index: number, direction: -1 | 1): Promise<void> {
    const target = index + direction;
    if (index <= 0 || target <= 0 || target >= this.activities.length) return;
    const next = [...this.activities];
    [next[index], next[target]] = [next[target], next[index]];
    this.activities = next.map((activity, order) => ({ ...activity, order }));
    await this.saveReview();
  }

  async removeActivity(index: number): Promise<void> {
    if (index === 0 || !this.lesson) return;
    const activity = this.activities[index];
    if (!window.confirm(`حذف مرحلة «${activity.title}» من هذا الدرس؟`)) return;
    this.activities = this.activities
      .filter((_, activityIndex) => activityIndex !== index)
      .map((item, order) => ({ ...item, order }));
    await this.saveReview();
  }

  startStudentPreview(): void {
    void this.openPreviewAt(0);
  }

  nextStudentPreview(): void {
    if (this.previewIndex >= this.activities.length - 1) {
      this.finishStudentPreview();
      return;
    }
    void this.openPreviewAt(this.previewIndex + 1);
  }

  previousStudentPreview(): void {
    if (this.previewIndex <= 0) return;
    void this.openPreviewAt(this.previewIndex - 1);
  }

  finishStudentPreview(): void {
    if (!this.lesson) return;
    void this.router.navigate(
      [`${this.contentBasePath}/lessons`, this.lesson.id, 'content-review'],
      { queryParams: { previewDone: 1 } },
    );
  }

  isShadowing(activity: LessonActivity): boolean {
    return activity.type === 'shadowing' || activity.type === 'shadowing-review';
  }

  activityTypeLabel(type: LessonActivityType): string {
    return {
      shadowing: 'الشادوينج الأساسي',
      vocabulary: 'الكلمات والصور',
      'shadowing-review': 'الشادوينج الثاني',
      'listen-write': 'اسمع واكتب',
      quiz: 'اختبار الدرس',
      'ai-conversation': 'محادثة الذكاء الاصطناعي',
    }[type];
  }

  activitySummary(activity: LessonActivity): string {
    if (activity.type === 'vocabulary') {
      const images = this.visibleVocabulary.filter((item) => item.imageUrl?.trim()).length;
      return `${this.visibleWordCount} كلمات · ${this.visibleChunkCount} Chunks · ${images} صور للمراجعة`;
    }
    if (activity.type === 'listen-write') {
      return `${(activity.dictationItems || []).filter((item) => item.enabled !== false).length} جمل للسمع والكتابة`;
    }
    if (activity.type === 'quiz') {
      return `${(activity.quizQuestions || []).filter((item) => item.enabled !== false).length} أسئلة قابلة للتعديل`;
    }
    if (activity.type === 'ai-conversation') {
      const config = activity.conversationConfig;
      return `${config?.topic || 'موضوع الدرس'} · ${config?.roleOptions?.length || 0} أدوار · ${config?.turnPlan?.length || config?.questionCount || 0} جولات`;
    }
    return `${this.segmentsFor(activity).length} جمل من المقطع الأصلي`;
  }

  usesSegmentSelection(activity: LessonActivity): boolean {
    return (
      activity.type === 'shadowing-review' ||
      activity.type === 'listen-write'
    );
  }

  isSegmentIncluded(index: number): boolean {
    const activity = this.selectedActivity;
    if (!activity || !this.lesson) return false;
    if (!this.usesSegmentSelection(activity)) return true;
    if (!Array.isArray(activity.segmentIndexes)) return true;
    return activity.segmentIndexes.includes(index);
  }

  toggleSegment(index: number, included: boolean): void {
    const activity = this.selectedActivity;
    if (!activity || !this.lesson || !this.usesSegmentSelection(activity)) return;

    const current = Array.isArray(activity.segmentIndexes)
      ? [...activity.segmentIndexes]
      : this.lesson.segments.map((_, segmentIndex) => segmentIndex);
    activity.segmentIndexes = included
      ? Array.from(new Set([...current, index])).sort((a, b) => a - b)
      : current.filter((segmentIndex) => segmentIndex !== index);
    if (activity.type === 'listen-write') {
      const item = this.getDictationItem(index);
      item.enabled = included;
    }
    this.markPending(activity);
  }

  getDictationItem(segmentIndex: number): LessonDictationItem {
    const activity = this.selectedActivity;
    const segment = this.lesson?.segments[segmentIndex];
    const fallback: LessonDictationItem = {
      segmentIndex,
      enabled: true,
      acceptedAnswers: segment?.text ? [segment.text] : [],
      hint: segment?.text ? this.createSentenceHint(segment.text) : '',
    };
    if (!activity || activity.type !== 'listen-write') return fallback;
    activity.dictationItems ||= [];
    const existing = activity.dictationItems.find(
      (item) => item.segmentIndex === segmentIndex,
    );
    if (existing) return existing;
    activity.dictationItems.push(fallback);
    return fallback;
  }

  acceptedAnswersText(item: LessonDictationItem): string {
    return (item.acceptedAnswers || []).join('\n');
  }

  updateAcceptedAnswers(item: LessonDictationItem, value: string): void {
    item.acceptedAnswers = value
      .split(/\r?\n/)
      .map((answer) => answer.trim())
      .filter(Boolean);
    this.markSelectedPending();
  }

  addQuizQuestion(type: LessonQuizQuestionType = 'multiple-choice'): void {
    const activity = this.selectedActivity;
    if (!activity || activity.type !== 'quiz') return;
    activity.quizQuestions ||= [];
    const number = activity.quizQuestions.length + 1;
    activity.quizQuestions.push({
      id: `quiz-${Date.now()}-${number}`,
      type,
      prompt: '',
      options: type === 'word-order' ? [] : ['', '', ''],
      correctAnswer: '',
      feedback: '',
      enabled: true,
    });
    this.markPending(activity);
  }

  removeQuizQuestion(index: number): void {
    const activity = this.selectedActivity;
    if (!activity || activity.type !== 'quiz') return;
    activity.quizQuestions = (activity.quizQuestions || []).filter(
      (_, questionIndex) => questionIndex !== index,
    );
    this.markPending(activity);
  }

  addQuizOption(question: LessonQuizQuestion): void {
    question.options = [...question.options, ''];
    this.markSelectedPending();
  }

  removeQuizOption(question: LessonQuizQuestion, optionIndex: number): void {
    question.options = question.options.filter((_, index) => index !== optionIndex);
    this.markSelectedPending();
  }

  quizTypeLabel(type: LessonQuizQuestionType): string {
    return {
      'multiple-choice': 'اختيار من متعدد',
      'word-order': 'ترتيب كلمات',
      'vocabulary-card': 'اختبار كلمة',
    }[type];
  }

  setQuizQuestionType(
    question: LessonQuizQuestion,
    type: LessonQuizQuestionType,
  ): void {
    question.type = type;
    if (type === 'word-order') {
      const source = question.correctAnswer || this.lesson?.segments[0]?.text || '';
      question.options = source.split(/\s+/).filter(Boolean);
    } else if (question.options.length < 2) {
      question.options = [question.correctAnswer || '', ''];
    }
    this.markSelectedPending();
  }

  updateConversationGoals(value: string): void {
    const config = this.selectedConversationConfig;
    if (!config) return;
    config.goals = this.lines(value);
    this.markSelectedPending();
  }

  updateConversationPhrases(value: string): void {
    const config = this.selectedConversationConfig;
    if (!config) return;
    config.targetPhrases = this.lines(value);
    this.markSelectedPending();
  }

  syncConversationPhrasesFromVocabulary(): void {
    const config = this.selectedConversationConfig;
    if (!config) return;
    const phrases = this.visibleVocabulary
      .map((item) => item.term.trim())
      .filter(Boolean)
      .slice(0, 16);
    if (!phrases.length) {
      this.saveError = 'اعتمد كلمة أو Chunk واحدة على الأقل قبل ربطها بالمحادثة.';
      return;
    }

    config.targetPhrases = phrases;
    (config.turnPlan || []).forEach((turn, index) => {
      const phrase = phrases[index % phrases.length];
      turn.targetPhrases = phrase ? [phrase] : [];
    });
    this.updateConversationConfig();
    this.saveMessage =
      `تم ربط المحادثة بـ${phrases.length} كلمة وChunk ظاهرة للطالب. راجع توزيعها على الجولات قبل الاعتماد.`;
  }

  updateConversationConfig(): void {
    const activity = this.selectedActivity;
    const config = this.selectedConversationConfig;
    if (!activity || !config) return;
    config.questionCount = 10;
    config.mode ||= config.lessonType === 'call-center' ? 'role-play' : 'guided-discussion';
    if (config.mode === 'guided-discussion') {
      config.allowRoleChoice = false;
    } else {
      config.allowRoleChoice =
        config.allowRoleChoice !== false && (config.roleOptions?.length || 0) > 1;
    }
    config.correctionMode = 'after-each-turn';
    config.roleOptions ||= [];
    config.turnPlan ||= [];
    activity.instructions = config.scenario;
    activity.questionCount = config.questionCount;
    this.markPending(activity);
  }

  addConversationRole(): void {
    const config = this.selectedConversationConfig;
    if (!config) return;
    config.roleOptions ||= [];
    const number = config.roleOptions.length + 1;
    config.roleOptions.push({
      id: `role-${Date.now()}-${number}`,
      label: `الدور ${number}`,
      studentRole: '',
      aiRole: '',
      openingMessage: '',
    });
    this.updateConversationConfig();
  }

  removeConversationRole(index: number): void {
    const config = this.selectedConversationConfig;
    if (!config) return;
    config.roleOptions = (config.roleOptions || []).filter(
      (_, roleIndex) => roleIndex !== index,
    );
    this.updateConversationConfig();
  }

  addConversationTurn(): void {
    const config = this.selectedConversationConfig;
    if (!config) return;
    config.turnPlan ||= [];
    const number = config.turnPlan.length + 1;
    config.turnPlan.push({
      id: `turn-${Date.now()}-${number}`,
      goal: '',
      aiPrompt: '',
      expectedFunctions: [],
      targetPhrases: [],
    });
    this.updateConversationConfig();
  }

  removeConversationTurn(index: number): void {
    const config = this.selectedConversationConfig;
    if (!config) return;
    config.turnPlan = (config.turnPlan || []).filter(
      (_, turnIndex) => turnIndex !== index,
    );
    this.updateConversationConfig();
  }

  updateConversationTurnFunctions(index: number, value: string): void {
    const turn = this.selectedConversationConfig?.turnPlan?.[index];
    if (!turn) return;
    turn.expectedFunctions = this.lines(value);
    this.updateConversationConfig();
  }

  updateConversationTurnPhrases(index: number, value: string): void {
    const turn = this.selectedConversationConfig?.turnPlan?.[index];
    if (!turn) return;
    turn.targetPhrases = this.lines(value);
    this.updateConversationConfig();
  }

  aiConfidencePercent(item: LessonVocabularyItem): number {
    return Math.round(Math.min(1, Math.max(0, Number(item.aiConfidence) || 0)) * 100);
  }

  linesText(values: string[]): string {
    return (values || []).join('\n');
  }

  selectAllSegments(): void {
    if (!this.lesson || !this.selectedActivity) return;
    this.selectedActivity.segmentIndexes = this.lesson.segments.map(
      (_, index) => index,
    );
    if (this.selectedActivity.type === 'listen-write') {
      this.lesson.segments.forEach((_, index) => {
        this.getDictationItem(index).enabled = true;
      });
    }
    this.markPending(this.selectedActivity);
  }

  clearSelectedSegments(): void {
    if (!this.selectedActivity) return;
    this.selectedActivity.segmentIndexes = [];
    if (this.selectedActivity.type === 'listen-write') {
      (this.selectedActivity.dictationItems || []).forEach(
        (item) => (item.enabled = false),
      );
    }
    this.markPending(this.selectedActivity);
  }

  markSelectedPending(): void {
    if (this.selectedActivity) this.markPending(this.selectedActivity);
  }

  async approveSelectedActivity(): Promise<void> {
    const activity = this.selectedActivity;
    if (!activity || this.saving()) return;
    const issues = this.blockingIssues(activity);
    if (issues.length) {
      this.saveError = issues.join(' ');
      this.saveMessage = '';
      return;
    }

    const previousStatus = activity.reviewStatus;
    activity.reviewStatus = 'approved';
    this.saveError = '';

    const saved = await this.saveReview();
    if (!saved) {
      activity.reviewStatus = previousStatus || 'pending';
      return;
    }

    if (activity.type === 'vocabulary') {
      this.saveMessage =
        'تم اعتماد وحفظ الكلمات والصور كما راجعتها. صفحة الطالب ستقرأ هذه النسخة المحفوظة فقط ولن تعيد توليد الكلمات أو الصور.';
    } else {
      this.saveMessage = `تم اعتماد وحفظ مرحلة «${activity.title}».`;
    }
  }

  async reopenSelectedActivity(): Promise<void> {
    const activity = this.selectedActivity;
    if (!activity || this.saving()) return;
    const previousStatus = activity.reviewStatus || 'approved';
    activity.reviewStatus = 'pending';
    const saved = await this.saveReview();
    if (!saved) {
      activity.reviewStatus = previousStatus;
      return;
    }
    this.saveMessage = `تم جعل مرحلة «${activity.title}» غير معتمدة وحفظ القرار فورًا.`;
  }

  blockingIssues(activity: LessonActivity): string[] {
    if (!this.lesson) return ['الدرس غير موجود.'];
    const issues: string[] = [];

    if (
      (activity.type === 'shadowing' ||
        activity.type === 'shadowing-review' ||
        activity.type === 'listen-write') &&
      this.segmentsFor(activity).length === 0
    ) {
      issues.push('اختر جملة واحدة على الأقل لهذه المرحلة.');
    }
    if (
      (activity.type === 'shadowing' ||
        activity.type === 'shadowing-review' ||
        activity.type === 'listen-write') &&
      this.segmentsFor(activity).some(
        ({ segment }) => !segment.translation?.trim(),
      )
    ) {
      issues.push('أكمل ترجمة كل الجمل المختارة.');
    }

    if (activity.type === 'vocabulary') {
      if (this.visibleVocabulary.length === 0) {
        issues.push('اعتمد كلمة واحدة على الأقل لتظهر للطالب.');
      }
      if (
        this.visibleVocabulary.some(
          (item) => !item.translation.trim() || !item.example.trim(),
        )
      ) {
        issues.push('أكمل المعنى والمثال لكل كلمة ظاهرة.');
      }
      if (
        this.visibleVocabulary.some(
          (item) => item.imageUrl?.trim() && !item.imageApproved,
        )
      ) {
        issues.push('اعتمد الصور المختارة أو احذفها.');
      }
    }

    if (activity.type === 'listen-write') {
      const selectedIndexes = new Set(activity.segmentIndexes || []);
      const selectedItems = (activity.dictationItems || []).filter(
        (item) => item.enabled !== false && selectedIndexes.has(item.segmentIndex),
      );
      if (
        selectedItems.length === 0 ||
        selectedItems.some((item) => item.acceptedAnswers.length === 0)
      ) {
        issues.push('أضف إجابة مقبولة واحدة على الأقل لكل جملة في «اسمع واكتب».');
      }
    }

    if (activity.type === 'quiz') {
      const questions = (activity.quizQuestions || []).filter(
        (question) => question.enabled !== false,
      );
      if (questions.length === 0) {
        issues.push('اعتمد سؤالًا واحدًا على الأقل داخل اختبار الدرس.');
      }
      if (
        questions.some(
          (question) =>
            !question.prompt.trim() ||
            !question.correctAnswer.trim() ||
            (question.type !== 'word-order' &&
              question.options.filter((option) => option.trim()).length < 2) ||
            (question.type === 'word-order' &&
              question.options.filter((option) => option.trim()).length < 2),
        )
      ) {
        issues.push('أكمل السؤال والإجابة الصحيحة والاختيارات المطلوبة.');
      }
    }

    if (activity.type === 'ai-conversation') {
      const config = activity.conversationConfig;
      if (!config?.scenario.trim() || !config.openingMessage.trim()) {
        issues.push('اكتب سيناريو وتعليمات المحادثة.');
      }
      if ((Number(config?.questionCount ?? activity.questionCount) || 0) < 1) {
        issues.push('حدد سؤالًا واحدًا على الأقل.');
      }
      if (!config?.targetPhrases.length) {
        issues.push('حدد جملة أو تعبيرًا واحدًا على الأقل للتدريب في المحادثة.');
      }
      if (!config?.topic?.trim()) {
        issues.push('حدد موضوع المحادثة بوضوح.');
      }
      if (config?.mode === 'role-play' && (config.roleOptions || []).length < 2) {
        issues.push('حدد طرفين للموقف حتى يختار الطالب من سيكون، ويأخذ الذكاء الاصطناعي الدور المقابل.');
      }
      if (
        config?.mode === 'role-play' &&
        (config?.roleOptions || []).some(
          (role) =>
            !role.label.trim() ||
            !role.studentRole.trim() ||
            !role.aiRole.trim() ||
            !role.openingMessage.trim(),
        )
      ) {
        issues.push('أكمل اسم كل دور ورسالة البداية الخاصة به.');
      }
      if (!(config?.turnPlan || []).length) {
        issues.push('أضف خطوة واحدة على الأقل لخطة المحادثة.');
      }
    }

    return issues;
  }

  missingTranslationCount(activity: LessonActivity): number {
    return this.segmentsFor(activity).filter(
      ({ segment }) => !segment.translation?.trim(),
    ).length;
  }

  getVocabularyHistory(item: LessonVocabularyItem): string[] {
    const term = this.normalizeTerm(item.term);
    if (!term) return [];
    return this.lessonRepository
      .getAll()
      .filter((lesson) => lesson.id !== this.lesson?.id)
      .filter((lesson) =>
        (lesson.vocabulary || []).some(
          (entry) => this.normalizeTerm(entry.term) === term,
        ),
      )
      .map((lesson) => lesson.title);
  }

  setVocabularyVisible(item: LessonVocabularyItem, visible: boolean): void {
    item.includeForStudent = visible;
    this.markVocabularyPending();
  }

  async approveImage(item: LessonVocabularyItem): Promise<void> {
    if (item.imageProvider === 'placeholder') {
      this.saveError =
        'هذه صورة تجريبية قديمة وليست ناتج خدمة الصور. ولّد صورة حقيقية أو احذف الصورة.';
      return;
    }
    const previous = item.imageApproved;
    item.imageApproved = Boolean(item.imageUrl?.trim());
    const saved = await this.saveReview();
    if (!saved) item.imageApproved = previous;
  }

  async removeImage(item: LessonVocabularyItem): Promise<void> {
    const previous = { url: item.imageUrl, approved: item.imageApproved, provider: item.imageProvider };
    item.imageUrl = '';
    item.imageApproved = false;
    item.imageProvider = undefined;
    const saved = await this.saveReview();
    if (!saved) {
      item.imageUrl = previous.url;
      item.imageApproved = previous.approved;
      item.imageProvider = previous.provider;
    }
  }

  async generateVocabularyImage(
    item: LessonVocabularyItem,
  ): Promise<'pexels' | null> {
    if (!this.lesson || !item.term.trim()) return null;
    const key = item.id || this.normalizeTerm(item.term);
    this.generatingImages.update((current) => ({ ...current, [key]: true }));
    this.saveError = '';

    try {
      const result = await this.lessonAiApi.generateImage({
        lessonId: this.lesson.id,
        term: item.term,
        kind: item.kind === 'chunk' ? 'chunk' : 'word',
        prompt:
          item.imagePrompt?.trim() ||
          `A realistic educational scene that communicates “${item.term}” without written text.`,
        alt: item.imageAlt?.trim() || `Context image for ${item.term}`,
      });
      item.imageUrl = result.imageUrl;
      item.imageProvider = 'curated';
      item.imageApproved = true;
      this.saveMessage =
        `تم توليد صورة حقيقية لـ “${item.term}” واعتمادها افتراضيًا. إذا لم تعجبك احذفها أو استبدلها.`;
      return result.provider;
    } catch (error) {
      this.saveError = this.lessonAiApi.getUserMessage(error);
      return null;
    } finally {
      this.generatingImages.update((current) => ({ ...current, [key]: false }));
      this.cdr?.detectChanges();
    }
  }

  async generateMissingVocabularyImages(): Promise<void> {
    if (this.generatingAllImages() || !this.lesson) return;
    const pending = this.visibleVocabulary.filter(
      (item) =>
        !item.imageUrl?.trim() || item.imageProvider === 'placeholder',
    );
    if (!pending.length) {
      this.saveMessage = 'كل العناصر لديها صور مولدة بالذكاء الاصطناعي بالفعل.';
      return;
    }

    this.generatingAllImages.set(true);
    let generatedCount = 0;
    let nextIndex = 0;
    try {
      const worker = async (): Promise<void> => {
        while (true) {
          const index = nextIndex++;
          if (index >= pending.length) return;
          const provider = await this.generateVocabularyImage(pending[index]);
          if (provider) generatedCount += 1;
        }
      };

      await Promise.all(
        Array.from(
          { length: Math.min(3, pending.length) },
          () => worker(),
        ),
      );

      if (generatedCount > 0) {
        await this.saveReview();
      }
      this.saveMessage = generatedCount
        ? `تم توليد ${generatedCount} صور عبر Queue بحد أقصى 3 صور بالتوازي وحفظ النتائج. الصور الناجحة معتمدة افتراضيًا ويمكنك تغييرها يدويًا.`
        : this.saveError || 'لم يتم توليد صور جديدة. اختبر اتصال مفتاح الصور ثم أعد المحاولة.';
    } finally {
      this.generatingAllImages.set(false);
      this.cdr?.detectChanges();
    }
  }

  isGeneratingImage(item: LessonVocabularyItem): boolean {
    const key = item.id || this.normalizeTerm(item.term);
    return Boolean(this.generatingImages()[key]);
  }

  async refreshAiStatus(verify = true): Promise<void> {
    if (this.checkingAiStatus()) return;
    this.checkingAiStatus.set(true);
    this.aiStatusError = '';
    try {
      this.aiStatus = await this.lessonAiApi.getStatus(verify);
    } catch (error) {
      this.aiStatus = null;
      this.aiStatusError = this.lessonAiApi.getUserMessage(error);
    } finally {
      this.checkingAiStatus.set(false);
      this.cdr?.detectChanges();
    }
  }

  searchImage(item: LessonVocabularyItem): void {
    const query = encodeURIComponent(`${item.term || 'English word'} photo`);
    window.open(`https://www.google.com/search?tbm=isch&q=${query}`, '_blank', 'noopener');
  }

  removeVocabulary(index: number): void {
    this.vocabulary = this.vocabulary.filter((_, itemIndex) => itemIndex !== index);
    this.vocabularyPreviewIndex = 0;
    this.markVocabularyPending();
  }

  addVocabulary(): void {
    this.vocabulary = [
      ...this.vocabulary,
      {
        id: `vocabulary-${Date.now()}`,
        kind: 'word',
        term: '',
        translation: '',
        example: '',
        explanation: '',
        imagePrompt: '',
        extraExample: '',
        usageNote: '',
        imageAlt: '',
        imageProvider: 'teacher',
        aiConfidence: 0,
        imageUrl: '',
        imageApproved: false,
        includeForStudent: true,
        repeatForReview: false,
        testLater: false,
      },
    ];
    this.markVocabularyPending();
  }

  prepareVocabularyFromLesson(): void {
    if (!this.lesson?.segments.length) {
      this.saveError = 'قسّم الدرس إلى جمل أولًا، ثم جهّز الكلمات.';
      return;
    }

    if (
      this.vocabulary.length > 0 &&
      !window.confirm('استبدال قائمة الكلمات الحالية باقتراح جديد من جمل الدرس؟')
    ) {
      return;
    }

    this.vocabulary = this.lessonContentAi.createVocabularyDraft(this.lesson);
    this.vocabularyPreviewIndex = 0;
    this.markVocabularyPending();
    this.saveMessage =
      `تم تجهيز ${this.visibleWordCount} كلمات و${this.visibleChunkCount} Chunks. راجع فقط ما تريد تغييره؛ الاعتماد يظل قرارًا يدويًا مستقلًا.`;
    this.saveError = '';
  }

  previousVocabularyPreview(): void {
    this.vocabularyPreviewIndex = Math.max(0, this.vocabularyPreviewIndex - 1);
  }

  nextVocabularyPreview(): void {
    this.vocabularyPreviewIndex = Math.min(
      Math.max(this.visibleVocabulary.length - 1, 0),
      this.vocabularyPreviewIndex + 1,
    );
  }

  async saveReview(): Promise<boolean> {
    if (!this.lesson || this.saving()) return false;
    this.saving.set(true);
    this.saveError = '';

    try {
      const saved = await this.lessonRepository.saveLessonToDatabaseStrict(
        {
          ...this.lesson,
          activities: this.activities.map((activity, order) => ({
            ...activity,
            order,
            questionCount:
              activity.type === 'ai-conversation'
                ? Math.max(
                    1,
                    Number(
                      activity.conversationConfig?.questionCount ??
                        activity.questionCount,
                    ) || 1,
                  )
                : undefined,
            segmentIndexes: activity.segmentIndexes
              ? [...activity.segmentIndexes]
              : undefined,
          })),
          vocabulary: this.vocabulary
            .filter((item) => item.term.trim())
            .map((item) => ({
              ...item,
              term: item.term.trim(),
              translation: item.translation.trim(),
              example: item.example.trim(),
              explanation: item.explanation?.trim() || '',
              imagePrompt: item.imagePrompt?.trim() || '',
              aiConfidence: Math.min(
                1,
                Math.max(0, Number(item.aiConfidence) || 0),
              ),
              imageUrl: item.imageUrl?.trim() || '',
              imageApproved: Boolean(
                item.imageUrl?.trim() && item.imageApproved,
              ),
            })),
          updatedAt: new Date().toISOString(),
        },
      );
      this.lesson = saved;
      this.activities = getLessonActivities(saved).map((activity) => ({
        ...activity,
        segmentIndexes: activity.segmentIndexes
          ? [...activity.segmentIndexes]
          : undefined,
      }));
      this.vocabulary = (saved.vocabulary || []).map((item) => ({ ...item }));
      this.saveMessage = this.lesson.status === 'ready'
        ? 'تم حفظ التعديلات. الدرس ما زال معتمدًا؛ إذا أردت إيقافه اجعله غير معتمد يدويًا.'
        : 'تم حفظ التعديلات. الدرس غير معتمد حاليًا، ويمكنك اعتماده يدويًا في أي وقت.';
      return true;
    } catch {
      this.saveError = 'تعذر حفظ مراجعة الدرس. تأكد من تشغيل الـAPI ثم حاول مرة أخرى.';
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  async toggleLessonApproval(): Promise<void> {
    if (!this.lesson || this.saving()) return;
    const previousStatus = this.lesson.status || 'ready';
    const nextApproved = this.lesson.status !== 'ready';
    this.lesson.status = nextApproved ? 'ready' : 'draft';
    const saved = await this.saveReview();
    if (!saved) {
      this.lesson.status = previousStatus;
      return;
    }
    this.saveMessage = nextApproved
      ? 'تم اعتماد الدرس وحفظ القرار فورًا. هذا لا ينشره للطلاب؛ النشر يظل من المنهج.'
      : 'تم جعل الدرس غير معتمد وحفظ القرار فورًا. يمكنك مراجعته ثم اعتماده مرة أخرى.';
  }

  reprocessLesson(): void {
    if (!this.lesson) return;
    if (
      !window.confirm(
        'إعادة المعالجة ستستبدل التعديلات الحالية بمسودة جديدة. هل تريد المتابعة؟',
      )
    ) {
      return;
    }
    void this.router.navigate(
      [`${this.contentBasePath}/lessons`, this.lesson.id, 'processing'],
      { queryParams: { regenerate: 1 } },
    );
  }

  private async openPreviewAt(index: number): Promise<void> {
    if (!this.lesson || index < 0 || index >= this.activities.length) return;
    const activity = this.activities[index];
    this.previewIndex = index;
    this.selectedActivityId = activity.id;
    this.isStudentPreview = true;
    this.isOverview = false;

    if (this.isShadowing(activity)) {
      const nextIndex = index + 1;
      const returnUrl =
        nextIndex < this.activities.length
          ? `${this.contentBasePath}/lessons/${this.lesson.id}/content-review?preview=${nextIndex}`
          : `${this.contentBasePath}/lessons/${this.lesson.id}/content-review?previewDone=1`;
      await this.router.navigate(
        [
          `${this.contentBasePath}/lessons`,
          this.lesson.id,
          'preview-shadowing',
          activity.id,
        ],
        { queryParams: { returnUrl } },
      );
      return;
    }

    await this.router.navigate(
      [`${this.contentBasePath}/lessons`, this.lesson.id, 'content-review'],
      { queryParams: { preview: index } },
    );
  }

  private createActivity(type: LessonActivityType): LessonActivity {
    const sameTypeCount = this.activities.filter(
      (activity) => activity.type === type,
    ).length;
    const id = sameTypeCount === 0 ? type : `${type}-${sameTypeCount + 1}`;
    return {
      id,
      type,
      title: this.activityTypeLabel(type),
      order: this.activities.length,
      enabled: true,
      reviewStatus: 'pending',
      segmentIndexes:
        type === 'shadowing-review' || type === 'listen-write'
          ? this.lesson?.segments.map((_, index) => index) || []
          : undefined,
      instructions:
        type === 'ai-conversation'
          ? 'تدرّب مع الطالب على نفس موقف الدرس واستخدم الكلمات والجمل التي تعلمها.'
          : undefined,
      questionCount: type === 'ai-conversation' ? 10 : undefined,
      dictationItems:
        type === 'listen-write'
          ? (this.lesson?.segments || []).map((segment, segmentIndex) => ({
              segmentIndex,
              enabled: true,
              acceptedAnswers: [segment.text],
              hint: this.createSentenceHint(segment.text),
            }))
          : undefined,
      quizQuestions:
        type === 'quiz' ? [this.createDefaultQuizQuestion()] : undefined,
      conversationConfig:
        type === 'ai-conversation' ? this.createConversationConfig() : undefined,
    };
  }

  private shouldCollapseUnconfiguredDefaultFlow(): boolean {
    if (this.activities.length !== 6 || this.vocabulary.length > 0) return false;
    const expected: LessonActivityType[] = [
      'shadowing',
      'vocabulary',
      'shadowing-review',
      'listen-write',
      'quiz',
      'ai-conversation',
    ];
    return this.activities.every(
      (activity, index) =>
        activity.type === expected[index] &&
        activity.reviewStatus !== 'approved' &&
        !activity.segmentIndexes?.length,
    );
  }

  private segmentsFor(
    activity: LessonActivity,
  ): Array<{ segment: LessonSegment; index: number }> {
    if (!this.lesson) return [];
    const selected = Array.isArray(activity.segmentIndexes)
      ? new Set(activity.segmentIndexes)
      : null;
    return this.lesson.segments
      .map((segment, index) => ({ segment, index }))
      .filter(({ index }) => !selected || selected.has(index));
  }

  private markPending(_activity: LessonActivity): void {
    // Editing content no longer changes approval automatically.
    // Approval is an explicit admin decision and is toggled separately.
    this.saveMessage = '';
    this.saveError = '';
  }

  private markVocabularyPending(): void {
    const vocabularyActivity = this.activities.find(
      (activity) => activity.type === 'vocabulary',
    );
    if (vocabularyActivity) this.markPending(vocabularyActivity);
  }

  private ensureActivityContent(): void {
    if (!this.lesson) return;
    const allIndexes = this.lesson.segments.map((_, index) => index);
    for (const activity of this.activities) {
      if (
        (activity.type === 'shadowing' ||
          activity.type === 'shadowing-review' ||
          activity.type === 'listen-write') &&
        !Array.isArray(activity.segmentIndexes)
      ) {
        activity.segmentIndexes = [...allIndexes];
      }
      if (activity.type === 'listen-write') {
        const existing = new Map(
          (activity.dictationItems || []).map((item) => [item.segmentIndex, item]),
        );
        activity.dictationItems = this.lesson.segments.map(
          (segment, segmentIndex) =>
            existing.get(segmentIndex) || {
              segmentIndex,
              enabled: activity.segmentIndexes?.includes(segmentIndex) !== false,
              acceptedAnswers: [segment.text],
              hint: this.createSentenceHint(segment.text),
            },
        );
      }
      if (activity.type === 'quiz' && !activity.quizQuestions?.length) {
        activity.quizQuestions = [this.createDefaultQuizQuestion()];
      }
      if (activity.type === 'ai-conversation' && !activity.conversationConfig) {
        activity.conversationConfig = this.createConversationConfig();
        activity.questionCount = activity.conversationConfig.questionCount;
      }
    }
  }

  private createDefaultQuizQuestion(): LessonQuizQuestion {
    const firstSentence = this.lesson?.segments[0]?.text || '';
    return {
      id: `quiz-${Date.now()}`,
      type: 'multiple-choice',
      prompt: 'أي جملة ظهرت في هذا الدرس؟',
      options: [
        firstSentence,
        'This sentence was not in the lesson.',
        'Try again tomorrow.',
      ],
      correctAnswer: firstSentence,
      feedback: 'الإجابة مأخوذة من محتوى الدرس الذي راجعه الأدمن.',
      enabled: true,
    };
  }

  private createConversationConfig(): LessonConversationConfig {
    const lessonTitle = this.lesson?.title || 'الدرس';
    const lessonType =
      this.lesson?.contentProfile?.type === 'call-center'
        ? 'call-center'
        : this.lesson?.contentProfile?.type === 'youtube'
          ? 'youtube'
          : this.lesson?.contentProfile?.type === 'book'
            ? 'book'
            : 'general';
    const topic = this.lesson?.contentProfile?.topic || lessonTitle;
    return {
      scenario: `تدريب قصير في نفس موقف «${lessonTitle}» عن ${topic}.`,
      aiRole: lessonType === 'call-center' ? 'Customer' : 'Conversation partner',
      studentRole: lessonType === 'call-center' ? 'Customer service agent' : 'English learner',
      level: 'A1',
      goals: ['استخدام جمل الدرس في رد كامل'],
      targetPhrases: (this.lesson?.segments || [])
        .slice(0, 3)
        .map((segment) => segment.text),
      openingMessage: lessonType === 'call-center'
        ? `Hello. I need help with ${topic}.`
        : `Let's talk about ${topic}. What do you think?`,
      questionCount: 10,
      feedbackStyle: 'balanced',
      lessonContentOnly: true,
      lessonType,
      topic,
      mode: lessonType === 'call-center' || lessonType === 'book' ? 'role-play' : 'guided-discussion',
      allowRoleChoice: lessonType === 'call-center' || lessonType === 'book',
      correctionMode: 'after-each-turn',
      roleOptions:
        lessonType === 'call-center'
          ? [
              {
                id: 'agent',
                label: 'موظف خدمة العملاء',
                studentRole: 'Customer service agent',
                aiRole: 'Customer',
                openingMessage: `Hello. I need help with ${topic}.`,
              },
              {
                id: 'customer',
                label: 'العميل',
                studentRole: 'Customer',
                aiRole: 'Customer service agent',
                openingMessage: 'Hello, how may I help you today?',
              },
            ]
          : lessonType === 'book'
            ? [
                {
                  id: 'speaker-a',
                  label: 'الطرف الأول',
                  studentRole: 'Speaker A in the lesson situation',
                  aiRole: 'Speaker B in the lesson situation',
                  openingMessage: this.lesson?.segments[0]?.text || 'Hello.',
                },
                {
                  id: 'speaker-b',
                  label: 'الطرف الثاني',
                  studentRole: 'Speaker B in the lesson situation',
                  aiRole: 'Speaker A in the lesson situation',
                  openingMessage: this.lesson?.segments[1]?.text || this.lesson?.segments[0]?.text || 'Hello.',
                },
              ]
            : [],
      turnPlan: (this.lesson?.segments || []).slice(0, 6).map((segment, index) => ({
        id: `turn-${index + 1}`,
        goal: index === 0 ? 'بدء الموقف' : `متابعة الموقف — خطوة ${index + 1}`,
        aiPrompt: `حوّل فكرة الجملة إلى سؤال أو رد طبيعي: ${segment.text}`,
        expectedFunctions: ['رد مناسب للموقف'],
        targetPhrases: [segment.text],
      })),
    };
  }

  private createSentenceHint(value: string): string {
    return value
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => `${word.charAt(0)}${'_'.repeat(Math.max(1, word.length - 1))}`)
      .join(' ');
  }

  private lines(value: string): string[] {
    return value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  private normalizeTerm(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9'\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private findVocabularyBankItem(term: string): LessonVocabularyItem | null {
    const normalized = this.normalizeTerm(term);
    for (const lesson of this.lessonRepository.getAll()) {
      if (lesson.id === this.lesson?.id) continue;
      const match = (lesson.vocabulary || []).find(
        (item) => this.normalizeTerm(item.term) === normalized,
      );
      if (match) return match;
    }
    return null;
  }
}
