import { CommonModule } from '@angular/common';
import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import {
  faArrowLeft,
  faBookOpen,
  faCheck,
  faChevronLeft,
  faChevronRight,
  faCircleCheck,
  faClock,
  faHeadphones,
  faMicrophone,
  faPause,
  faPlay,
  faRepeat,
  faRotateRight,
  faStop,
  faTrash,
  faVolumeHigh,
  faVolumeOff,
} from '@fortawesome/free-solid-svg-icons';
import { firstValueFrom, timeout } from 'rxjs';
import { API_BASE_URL } from '../../../../core/api/api.config';
import { ProgressApiService } from '../../../../core/api/progress-api.service';
import { StudentTrackingApiService } from '../../../../core/api/student-tracking-api.service';
import { AuthService } from '../../../../core/auth/services/auth.service';
import { AppDiagnosticsService } from '../../../../core/diagnostics/app-diagnostics.service';
import {
  CourseLesson,
  LessonActivityType,
  LessonSegment,
  getLessonActivities,
} from '../../../lessons/data-access/lesson.models';
import { LessonRepository } from '../../../lessons/data-access/lesson.repository';
import { RecordingMeta } from '../../../recordings/data-access/recording.models';
import { RecordingRepository } from '../../../recordings/data-access/recording.repository';
import { StudentRepository } from '../../../teacher/data-access/student.repository';
import { StudentProgress } from '../../../teacher/data-access/student.models';
import { TeacherGroupRepository } from '../../../teacher/data-access/teacher-group.repository';
import { StudentCourseFacade } from '../../data-access/student-course.facade';

type PlayerState =
  | 'loading'
  | 'ready'
  | 'teacher'
  | 'student'
  | 'paused'
  | 'saving'
  | 'between'
  | 'finished'
  | 'stopped'
  | 'error';

type PausablePhase = 'teacher' | 'student';
type AudioCaptureMode = 'auto' | 'headset' | 'phone';
type StudentKaraokeWordState = 'pending' | 'matched' | 'wrong';

interface BrowserSpeechRecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
  length: number;
}

interface BrowserSpeechRecognitionEvent {
  results: ArrayLike<BrowserSpeechRecognitionResult>;
}

interface BrowserSpeechRecognitionErrorEvent {
  error?: string;
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface RecordingView {
  meta: RecordingMeta;
  url: string | null;
}

@Component({
  selector: 'app-student-lesson-player-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, FontAwesomeModule],
  templateUrl: './lesson-player.html',
  styleUrl: './lesson-player.scss',
})
export class StudentLessonPlayerPage implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('mediaPlayer') mediaPlayer?: ElementRef<HTMLVideoElement>;

  faArrowLeft = faArrowLeft;
  faBookOpen = faBookOpen;
  faCheck = faCheck;
  faChevronLeft = faChevronLeft;
  faChevronRight = faChevronRight;
  faCircleCheck = faCircleCheck;
  faClock = faClock;
  faHeadphones = faHeadphones;
  faMicrophone = faMicrophone;
  faPause = faPause;
  faPlay = faPlay;
  faRepeat = faRepeat;
  faRotateRight = faRotateRight;
  faStop = faStop;
  faTrash = faTrash;
  faVolumeHigh = faVolumeHigh;
  faVolumeOff = faVolumeOff;

  lesson: CourseLesson | null = null;
  mediaUrl = '';
  state: PlayerState = 'loading';
  error = '';

  currentSegmentIndex = 0;
  currentSegment: LessonSegment | null = null;
  currentKaraokeIndex = -1;
  studentKaraokeWordStates: StudentKaraokeWordState[] = [];
  studentSpeechRecognitionSupported = true;
  currentRepetitionNumber = 0;

  sessionTargetRepetitions = 1;
  private readonly sessionOptionCandidates = [1, 2, 3, 5, 7];
  sessionStarted = false;
  sessionCompletedInThisRun = 0;
  reviewSession = false;
  private sessionTargetForThisRun = 1;
  private stopAfterCurrentRepetition = false;

  teacherPlaybackRate = 1;
  teacherMuted = false;
  studentDurationRatio = 1.0;
  studentDurationOffsetSeconds = 3.5;
  audioCaptureMode: AudioCaptureMode = 'auto';
  microphoneTestActive = false;
  microphoneTestStarting = false;
  microphoneSettingsLabel = 'سيتم فحص إعدادات الميكروفون عند بدء التدريب.';
  microphoneTestMessage = '';
  sentenceTranslationVisible = true;
  manualPreviewActive = false;
  sentenceDrawerOpen = false;
  settingsDrawerOpen = false;
  autoAdvanceEnabled = true;
  studentTurnTimeLimitEnabled = true;
  countdownPauseSeconds = 3;
  isCompletionModalOpen = false;
  showMicPermissionBanner = false;

  voiceBars: number[] = Array.from({ length: 42 }, (_, index) => this.createSilentBar(index, 42));
  teacherWaveBars: number[] = Array.from({ length: 72 }, (_, index) => this.createTeacherBar(index));
  teacherSegmentProgress = 0;
  hasMicSignal = false;
  voiceLevel = 0;
  studentTurnElapsedSeconds = 0;
  recordings: RecordingView[] = [];
  lastSavedMessage = '';
  speechReviewVisible = false;
  private currentRepetitionSegmentScores: number[] = [];
  private shadowingRepetitionScores: number[] = [];
  private sessionTrainingStartedAtMs = 0;

  mediaReady = false;
  private mediaLoadStartedAt = 0;
  private micStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private mixedRecordingStream: MediaStream | null = null;
  private capturedTeacherStream: MediaStream | null = null;
  private recordingAudioContext: AudioContext | null = null;
  private recordingDestination: MediaStreamAudioDestinationNode | null = null;
  private recordingSources: MediaStreamAudioSourceNode[] = [];
  private activeTurnChunks: BlobPart[] = [];
  private activeTimerId: number | null = null;
  private activeTimerCallback: (() => void) | null = null;
  private activeTimerRemainingMs = 0;
  private activeTimerStartedAt = 0;
  private pausedPhase: PausablePhase | null = null;
  private startedAt = 0;
  private totalRecordedMs = 0;
  private recordingAccumulatedMs = 0;
  private recordingActiveSliceStartedAt = 0;
  private studentTurnStartedAt = 0;
  private studentTurnElapsedBeforePauseMs = 0;
  private studentTurnDurationMs = 0;
  private recordingMimeType = 'audio/webm';

  private studentSpeechRecognition: BrowserSpeechRecognition | null = null;
  private studentSpeechRecognitionShouldRun = false;
  private studentSpeechRecognitionRestartId: number | null = null;
  private studentSpeechCompletionTimerId: number | null = null;
  private studentRecognitionCommittedTokens: string[] = [];
  private studentRecognitionSessionTranscript = '';
  private studentLatestRecognizedTokens: string[] = [];
  private studentRecognitionGeneration = 0;

  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private visualizerFrameId: number | null = null;
  private teacherProgressFrameId: number | null = null;
  private microphoneTestTimerId: number | null = null;
  private readonly debugPlayer = true;
  private destroyed = false;
  private lastMicDebugAt = 0;
  private recorderChunkCount = 0;
  private readonly micNoiseGateLevel = 8;
  private readonly micLevelSmoothing = 0.78;
  private readonly visualRenderIntervalMs = 70;
  private lastVisualRenderAt = 0;
  curriculumSlotId = '';
  activeStageId = 'shadowing';
  activeStageType: LessonActivityType = 'shadowing';
  activeStageTitle = 'الشادوينج الأساسي';
  activeStageCompleted = false;
  teacherPreview = false;
  previewReturnUrl = '';
  private activeGroupId = '';
  private readonly teacherPlaybackRateStorageKey =
    'shadowing-main-teacher-playback-rate-v1';
  private readonly studentDurationRatioStorageKey =
    'shadowing-student-duration-ratio-v2';
  private readonly studentDurationStorageKey =
    'shadowing-main-student-duration-offset-v1';
  private readonly studentTurnTimeLimitStorageKey =
    'shadowing-student-turn-time-limit-enabled-v1';
  private readonly audioCaptureModeStorageKey =
    'shadowing-main-audio-capture-mode-v1';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    public auth: AuthService,
    public studentRepository: StudentRepository,
    private lessonRepository: LessonRepository,
    private recordingRepository: RecordingRepository,
    private groupRepository: TeacherGroupRepository,
    private courseFacade: StudentCourseFacade,
    private progressApi: ProgressApiService,
    private trackingApi: StudentTrackingApiService,
    private diagnostics: AppDiagnosticsService,
    private cdr: ChangeDetectorRef,
  ) {}

  get previewOwnerBasePath(): '/admin' | '/teacher' {
    return this.auth.isAdmin() ? '/admin' : '/teacher';
  }

  async ngOnInit(): Promise<void> {
    this.restorePlayerSettings();
    this.teacherPreview = Boolean(this.route.snapshot.data['teacherPreview']);
    const lessonId = this.route.snapshot.paramMap.get('lessonId') || '';
    const pageElapsed = this.diagnostics.start('StudentShadowing', 'page-init', {
      lessonId,
      teacherPreview: this.teacherPreview,
    });
    if (!this.teacherPreview) {
      const courseElapsed = this.diagnostics.start('StudentShadowing', 'course-init', {
        lessonId,
      });
      await this.courseFacade.initialize();
      this.diagnostics.success('StudentShadowing', 'course-init', courseElapsed(), {
        lessonId,
      });
    }
    this.previewReturnUrl =
      this.route.snapshot.queryParamMap.get('returnUrl') || '';
    this.activeStageId =
      this.route.snapshot.paramMap.get('stageId') || 'shadowing';
    this.curriculumSlotId =
      this.route.snapshot.queryParamMap.get('slotId') || '';
    this.activeGroupId =
      this.studentRepository.findById(this.studentId)?.groupId || '';
    const sourceLesson = this.lessonRepository.getById(lessonId);

    if (sourceLesson) {
      this.lesson = this.createLessonForCurriculumSlot(sourceLesson);
    }

    if (!this.lesson) {
      this.state = 'error';
      this.error = 'Lesson not found.';
      return;
    }

    const activity = getLessonActivities(this.lesson).find(
      (item) => item.id === this.activeStageId,
    ) || getLessonActivities(this.lesson).find((item) => item.type === 'shadowing');
    if (activity) {
      this.activeStageId = activity.id;
      this.activeStageType = activity.type;
      this.activeStageTitle = activity.title;
      if (Array.isArray(activity.segmentIndexes)) {
        const selectedIndexes = new Set(activity.segmentIndexes);
        this.lesson = {
          ...this.lesson,
          segments: this.lesson.segments.filter((_, index) =>
            selectedIndexes.has(index),
          ),
        };
      }
    }

    if (this.teacherPreview) {
      // Teacher preview must never create or advance a real student's progress row.
    } else if (this.curriculumSlotId) {
      this.studentRepository.ensureProgressRowForCurriculumSlot(
        this.studentId,
        this.activeGroupId,
        this.lesson.id,
        this.curriculumSlotId,
        this.lesson.requiredRepetitions,
      );
    } else {
      this.studentRepository.ensureProgressRowsForLesson(
        this.lesson.id,
        this.lesson.requiredRepetitions,
      );
    }

    this.mediaLoadStartedAt = performance.now();
    this.mediaUrl = this.resolveMediaUrl(
      this.lesson.mediaUrl?.trim() ||
        `/api/lessons/${encodeURIComponent(this.lesson.id)}/media`,
    );
    this.currentSegment = this.lesson.segments[0] || null;
    this.state = 'ready';
    this.renderView();
    this.diagnostics.success('StudentShadowing', 'page-init', pageElapsed(), {
      lessonId: this.lesson.id,
      stageId: this.activeStageId,
      segments: this.lesson.segments.length,
      mediaMode: 'direct-url',
    });
    if (!this.teacherPreview) {
      void this.trackingApi.trackEvent({
        studentId: this.studentId,
        studentName: this.auth.currentUser?.name || this.studentId,
        groupId: this.activeGroupId,
        groupName: this.auth.currentUser?.groupName || this.activeGroupId,
        cefrLevel: this.auth.currentUser?.cefrLevel || 'A1',
        lessonId: this.lesson.id,
        lessonTitle: this.lesson.title,
        curriculumSlotId: this.curriculumSlotId,
        stageId: this.activeStageId,
        eventType: 'lesson_opened',
        status: 'success',
        detailsJson: JSON.stringify({ activityType: this.activeStageType, requiredRepetitions: this.lesson.requiredRepetitions }),
        occurredAtUtc: new Date().toISOString(),
        correlationId: `lesson-opened-${this.studentId}-${this.lesson.id}-${Date.now()}`,
      });
    }
    this.debug('lesson-ready', {
      lessonId: this.lesson.id,
      title: this.lesson.title,
      segments: this.lesson.segments.length,
      requiredRepetitions: this.lesson.requiredRepetitions,
      mediaMode: 'direct-url',
    });
    void this.loadRecordings().catch((error) =>
      this.diagnostics.error('StudentShadowing', 'recordings-load:error', error, {
        lessonId: this.lesson?.id || lessonId,
      }),
    );
    if (!this.teacherPreview) {
      const lessonView = this.courseFacade.getLesson(
        this.lesson.id,
        this.curriculumSlotId,
      );
      this.activeStageCompleted =
        lessonView?.stages.some(
          (stage) => stage.id === this.activeStageId && stage.status === 'completed',
        ) || false;
    }
    this.renderView();
  }

  ngAfterViewInit(): void {}

  ngOnDestroy(): void {
    this.destroyed = true;
    this.clearTimer();
    this.stopStudentSpeechRecognition(true);
    this.stopMicrophoneTest(false);
    this.stopTeacherProgress();
    this.stopVisualizer();
    this.cleanupRecordingGraph();
    this.stopTracks();
    for (const recording of this.recordings) {
      if (recording.url) URL.revokeObjectURL(recording.url);
    }
  }

  get studentId(): string {
    return this.teacherPreview
      ? 'teacher-preview'
      : this.auth.currentUser?.studentId || '';
  }

  get progress(): StudentProgress | null {
    if (!this.lesson || !this.studentId) return null;
    return this.studentRepository.getProgress(
      this.studentId,
      this.lesson.id,
      this.curriculumSlotId,
      this.activeGroupId,
    );
  }

  get progressPercent(): number {
    return this.studentRepository.getCompletionPercent(this.progress);
  }

  get completedRepetitions(): number {
    return this.progress?.completedRepetitions || 0;
  }

  get remainingRepetitions(): number {
    if (!this.lesson) return 0;
    return Math.max(0, this.lesson.requiredRepetitions - this.completedRepetitions);
  }

  get sessionOptions(): number[] {
    const maximum = this.remainingRepetitions > 0 ? this.remainingRepetitions : 5;
    return Array.from(
      new Set(
        [...this.sessionOptionCandidates, maximum].filter(
          (value) => value <= maximum,
        ),
      ),
    ).sort((left, right) => left - right);
  }

  get isRunning(): boolean {
    return (
      this.state === 'teacher' ||
      this.state === 'student' ||
      this.state === 'paused' ||
      this.state === 'saving' ||
      this.state === 'between'
    );
  }

  get canPauseOrResume(): boolean {
    return (
      this.state === 'teacher' ||
      this.state === 'student' ||
      this.state === 'paused'
    );
  }

  get primaryActionLabel(): string {
    if (!this.mediaReady) return 'جاري تجهيز الصوت...';
    if (this.state === 'paused') return 'كمّل نفس التسجيل';
    if (this.state === 'teacher' || this.state === 'student') return 'إيقاف مؤقت';
    if (this.state === 'saving') return 'جاري الحفظ...';
    if (this.state === 'between') return 'نجهّز التكرار التالي...';
    return this.remainingRepetitions === 0
      ? 'ابدأ مراجعة الشادوينج'
      : 'ابدأ التدريب';
  }

  get primaryActionDisabled(): boolean {
    if (this.canPauseOrResume) return false;
    if (this.state === 'saving' || this.state === 'between') return true;
    return !this.canStart;
  }

  get teacherPlaybackRateLabel(): string {
    return `${this.teacherPlaybackRate.toFixed(2)}×`;
  }

  get studentTargetDurationLabel(): string {
    if (!this.studentTurnTimeLimitEnabled) return 'بدون حد زمني';
    if (!this.currentSegment) return '00:00';
    return this.formatDurationSeconds(
      this.getStudentTurnDuration(this.currentSegment) / 1000,
    );
  }

  get teacherSentenceDurationLabel(): string {
    if (!this.currentSegment) return '00:00';
    return this.formatDurationSeconds(
      Math.max(0, this.currentSegment.end - this.currentSegment.start),
    );
  }

  get studentDurationRatioPercent(): number {
    return Math.round(this.studentDurationRatio * 100);
  }

  get studentDurationRatioLabel(): string {
    const diff = Math.round((this.studentDurationRatio - 1.0) * 100);
    if (diff === 0) return '100% (مطابق)';
    if (diff < 0) return `${this.studentDurationRatioPercent}% (${diff}%)`;
    return `${this.studentDurationRatioPercent}% (+${diff}%)`;
  }

  get audioCaptureModeLabel(): string {
    if (this.audioCaptureMode === 'headset') return 'سماعة خارجية';
    if (this.audioCaptureMode === 'phone') return 'مكبر وميكروفون الهاتف';
    return 'تلقائي';
  }

  get microphoneLevelLabel(): string {
    if (!this.microphoneTestActive) return 'الاختبار متوقف';
    if (this.voiceLevel >= 75) return 'صوتك مرتفع جدًا';
    if (this.voiceLevel >= 25) return 'صوتك واضح ومناسب';
    if (this.voiceLevel >= this.micNoiseGateLevel) return 'صوتك منخفض';
    return 'لا يصل صوت واضح';
  }

  get hasSentenceTranslation(): boolean {
    return Boolean(this.currentSegment?.translation?.trim());
  }

  get canStart(): boolean {
    return (
      !!this.lesson &&
      this.mediaReady &&
      !this.isRunning &&
      this.lesson.segments.length > 0 &&
      (this.remainingRepetitions > 0 || this.completedRepetitions > 0)
    );
  }

  get statusLabel(): string {
    if (!this.mediaReady) return 'جاري تجهيز صوت الدرس في الخلفية...';
    if (this.manualPreviewActive) return `تشغيل الجملة الحالية بسرعة ${this.teacherPlaybackRateLabel}.`;
    if (this.state === 'teacher') return 'المدرس يتكلم الآن. بعد انتهاء الجملة، يبدأ تسجيل صوتك تلقائيًا.';
    if (this.state === 'student') {
      return this.studentTurnTimeLimitEnabled
        ? 'دورك الآن. كرر نفس الجملة قبل انتهاء الوقت، والتسجيل يعمل تلقائيًا.'
        : 'دورك الآن. قل الجملة كاملة؛ لن ننتقل للجملة التالية حتى تتعرف عليها المنظومة، ويمكنك استخدام زر الجملة التالية يدويًا عند الحاجة.';
    }
    if (this.state === 'paused') return 'التدريب متوقف مؤقتًا. اضغط «كمّل نفس التسجيل» للمتابعة من نفس الجملة.';
    if (this.state === 'saving') return 'جاري حفظ تسجيلك...';
    if (this.state === 'between') return this.lastSavedMessage || 'تم حفظ التكرار. نبدأ التكرار التالي تلقائيًا.';
    if (this.state === 'finished') return this.lastSavedMessage || 'تم حفظ التسجيل. يمكنك بدء جلسة جديدة.';
    if (this.state === 'stopped') return 'تم إيقاف التدريب.';
    if (this.state === 'error') return this.error;
    return 'اضغط ابدأ التدريب مرة واحدة، وبعدها النظام يمشي تلقائيًا: المدرس ثم أنت ثم الجملة التالية.';
  }

  get phaseTitle(): string {
    if (this.manualPreviewActive) return 'معاينة الجملة';
    if (this.state === 'teacher') return 'المدرس يتكلم';
    if (this.state === 'student') return 'دورك الآن';
    if (this.state === 'paused') return 'متوقف مؤقتًا';
    if (this.state === 'saving') return 'حفظ التسجيل';
    if (this.state === 'between') return 'تم حفظ التكرار';
    if (this.state === 'finished') return 'تم الإكمال';
    if (this.state === 'stopped') return 'متوقف';
    return 'جاهز';
  }

  get sessionLabel(): string {
    if (this.state === 'finished' && this.lastSavedMessage) return this.lastSavedMessage;
    if (!this.sessionStarted) return 'لا توجد جلسة نشطة';
    return `${this.sessionCompletedInThisRun} / ${this.sessionTargetForThisRun} تكرارات في هذه الجلسة`;
  }

  get lessonTitle(): string {
    return this.lesson?.title || 'Lesson Player';
  }

  get currentSentenceLabel(): string {
    if (!this.lesson || this.lesson.segments.length === 0) return '0 من 0';
    return `${this.currentSegmentIndex + 1} من ${this.lesson.segments.length}`;
  }

  get karaokeWords(): string[] {
    const text = this.currentSegment?.text || '';
    if (!text) return [];
    // split by spaces but keep punctuation attached to words
    return text.split(/\s+/).filter(Boolean);
  }

  studentKaraokeState(index: number): StudentKaraokeWordState {
    return this.studentKaraokeWordStates[index] || 'pending';
  }

  get currentRepetitionLabel(): string {
    if (!this.lesson) return '0 / 0';
    if (this.reviewSession) return 'مراجعة';
    const current = this.currentRepetitionNumber || Math.min(this.completedRepetitions + 1, this.lesson.requiredRepetitions);
    return `${current} / ${this.lesson.requiredRepetitions}`;
  }

  get sessionTargetLabel(): string {
    return `${this.sessionCompletedInThisRun} / ${this.sessionTargetForThisRun}`;
  }

  get currentSegmentDurationLabel(): string {
    if (!this.currentSegment) return '0:00';
    return this.formatDurationSeconds(Math.max(0, this.currentSegment.end - this.currentSegment.start));
  }

  get studentTurnTimerLabel(): string {
    return this.formatDurationSeconds(this.studentTurnElapsedSeconds);
  }

  get progressSegments(): number[] {
    return Array.from({ length: this.lesson?.segments.length || 0 }, (_, index) => index);
  }

  get segmentProgressPercent(): number {
    if (!this.lesson || this.lesson.segments.length === 0) return 0;
    return Math.round(((this.currentSegmentIndex + 1) / this.lesson.segments.length) * 100);
  }


  get liveWaveBars(): number[] {
    return this.manualPreviewActive || this.state === 'teacher' || (this.state === 'paused' && this.pausedPhase === 'teacher')
      ? this.teacherWaveBars
      : this.voiceBars;
  }

  barSegmentFor(barIndex: number): 'teacher' | 'student' | 'upcoming' {
    const bars = this.liveWaveBars;
    const len = bars.length || 1;
    const firstCut = Math.floor(len / 3);
    const secondCut = Math.floor((len * 2) / 3);
    if (barIndex < firstCut) return 'teacher';
    if (barIndex < secondCut) return 'student';
    return 'upcoming';
  }

  get hasPreviousSegment(): boolean {
    return this.currentSegmentIndex > 0;
  }

  get hasNextSegment(): boolean {
    return Boolean(this.lesson && this.currentSegmentIndex < this.lesson.segments.length - 1);
  }

  get teacherWaveBarsSlice(): number[] {
    if (this.state === 'teacher' || this.manualPreviewActive) {
      return this.teacherWaveBars.slice(0, 11);
    }
    return [16, 28, 44, 52, 34, 40, 26, 38, 46, 30, 22];
  }

  get studentWaveBarsSlice(): number[] {
    if (this.state === 'student') {
      return this.voiceBars.slice(0, 11);
    }
    return [22, 38, 52, 44, 30, 42, 26, 38, 48, 22, 14];
  }

  get upcomingWaveBarsSlice(): number[] {
    return [14, 26, 36, 30, 18, 34, 40, 26, 14];
  }

  get audioCurrentTimeLabel(): string {
    if (this.state === 'teacher' || this.manualPreviewActive) {
      if (!this.currentSegment) return '00:00';
      const duration = Math.max(0, this.currentSegment.end - this.currentSegment.start);
      const current = (this.teacherSegmentProgress / 100) * duration;
      return this.formatDurationSeconds(current);
    }
    if (this.state === 'student') {
      return this.formatDurationSeconds(this.studentTurnElapsedSeconds);
    }
    return '00:00';
  }

  get audioTotalTimeLabel(): string {
    if (this.state === 'student') {
      return this.studentTurnTimeLimitEnabled
        ? this.studentTargetDurationLabel
        : '∞';
    }
    return this.currentSegmentDurationLabel;
  }

  get currentSegmentPhoneticHint(): { ipa: string; tip: string } | null {
    if (!this.currentSegment) return null;
    const vocabList = this.lesson?.vocabulary || [];
    const textLower = this.currentSegment.text.toLowerCase();
    for (const v of vocabList) {
      if (textLower.includes(v.term.toLowerCase())) {
        return {
          ipa: `/${v.term.toLowerCase()}/`,
          tip: v.explanation || v.usageNote || `التشديد على مقطع: ${v.term}`,
        };
      }
    }
    const words = this.karaokeWords;
    if (words.length >= 3) {
      const targetWord = words[Math.min(3, words.length - 1)].replace(/[^a-zA-Z]/g, '');
      if (targetWord) {
        return {
          ipa: `/${targetWord.toLowerCase()}/`,
          tip: `التشديد على المقطع الرئيسي: ${targetWord}`,
        };
      }
    }
    return null;
  }

  get scrubCursorLeft(): string {
    if (this.state === 'teacher' || this.manualPreviewActive) {
      const p = Math.min(100, Math.max(0, this.teacherSegmentProgress));
      return `${Math.round((p / 100) * 38)}%`;
    }
    if (this.state === 'student' && !this.studentTurnTimeLimitEnabled) {
      const total = this.studentKaraokeWordStates.length || 1;
      const matched = this.studentKaraokeWordStates.filter((state) => state === 'matched').length;
      const p = Math.min(100, Math.max(0, (matched / total) * 100));
      return `${38 + Math.round((p / 100) * 36)}%`;
    }
    if (this.state === 'student' && this.studentTurnDurationMs > 0) {
      const p = Math.min(100, Math.max(0, (this.studentTurnElapsedSeconds * 1000 / this.studentTurnDurationMs) * 100));
      return `${38 + Math.round((p / 100) * 36)}%`;
    }
    return '38%';
  }

  get liveWaveLabel(): string {
    if (this.manualPreviewActive) return 'إعادة سماع الجملة';
    if (this.state === 'teacher') return 'استمع للمدرس';
    if (this.state === 'student') return 'تكلم الآن';
    if (this.state === 'paused') return 'التدريب متوقف مؤقتًا';
    if (this.state === 'saving') return 'جاري الحفظ';
    if (this.state === 'between' || this.state === 'finished') return 'تم التسجيل';
    return 'جاهز للتدريب';
  }

  get liveSignalLabel(): string {
    if (this.manualPreviewActive) return `صوت المدرس · ${this.teacherPlaybackRateLabel}`;
    if (this.state === 'teacher') return 'صوت المدرس يعمل';
    if (this.state === 'student') return this.hasMicSignal ? 'صوتك واضح' : 'لا يوجد صوت واضح';
    if (this.state === 'paused') return 'التسجيل محفوظ مؤقتًا وسيكمل من نفس المكان';
    if (this.state === 'saving') return 'يتم حفظ الصوتين معًا';
    if (this.state === 'between' || this.state === 'finished') return this.lastSavedMessage || 'تم التسجيل';
    return 'اضغط ابدأ التدريب';
  }

  get completionCircleStyle(): string {
    return `conic-gradient(#17B3A6 ${this.progressPercent}%, #E6F6F4 0)`;
  }

  get repetitionCircleStyle(): string {
    const percent = this.sessionTargetForThisRun <= 0 ? 0 : Math.round((this.sessionCompletedInThisRun / this.sessionTargetForThisRun) * 100);
    return `conic-gradient(#17B3A6 ${percent}%, #E6F6F4 0)`;
  }

  get speechReviewRequiredByTeacher(): boolean {
    if (!this.lesson) return false;
    const activity = getLessonActivities(this.lesson).find((item) => item.id === this.activeStageId);
    return activity?.speechReviewMode === 'teacher-required';
  }

  get shouldShowSpeechReview(): boolean {
    return this.speechReviewRequiredByTeacher || this.speechReviewVisible;
  }

  get currentSpeechMatchScore(): number {
    const states = this.studentKaraokeWordStates;
    if (!states.length) return 0;
    const matched = states.filter((state) => state === 'matched').length;
    return Math.round((matched / states.length) * 100);
  }

  get currentRecognizedSpeechText(): string {
    return this.studentRecognitionSessionTranscript.trim();
  }

  get currentSpeechReviewLabel(): string {
    const score = this.currentSpeechMatchScore;
    if (score >= 90) return 'ممتاز';
    if (score >= 80) return 'جيد جدًا';
    if (score >= 65) return 'جيد';
    return 'يحتاج مراجعة';
  }

  get completionMatchScore(): number {
    if (!this.shadowingRepetitionScores.length) return 0;
    return Math.round(
      this.shadowingRepetitionScores.reduce((sum, value) => sum + value, 0) /
        this.shadowingRepetitionScores.length,
    );
  }

  get completionBestRepetitionScore(): number {
    return this.shadowingRepetitionScores.length
      ? Math.max(...this.shadowingRepetitionScores)
      : 0;
  }

  get completionQualityLabel(): string {
    const score = this.completionMatchScore;
    if (score >= 90) return 'ممتاز';
    if (score >= 80) return 'جيد جدًا';
    if (score >= 65) return 'جيد';
    return 'يحتاج مراجعة';
  }

  get completionTrainingTimeLabel(): string {
    if (!this.sessionTrainingStartedAtMs) return '00:00';
    return this.formatDurationSeconds(
      Math.max(0, Math.round((Date.now() - this.sessionTrainingStartedAtMs) / 1000)),
    );
  }

  requestSpeechReview(): void {
    this.speechReviewVisible = !this.speechReviewVisible;
    this.debug('speech-review-toggle', {
      visible: this.speechReviewVisible,
      requiredByTeacher: this.speechReviewRequiredByTeacher,
      segmentIndex: this.currentSegmentIndex,
      score: this.currentSpeechMatchScore,
      transcript: this.studentRecognitionSessionTranscript,
    });
    this.renderView();
  }

  setSessionTarget(value: number): void {
    if (this.isRunning) return;
    this.sessionTargetRepetitions = value;
    this.renderView();
  }

  async startSession(): Promise<void> {
    this.debug('start-click', { canStart: this.canStart, state: this.state, remainingRepetitions: this.remainingRepetitions });

    if (!this.lesson || !this.mediaPlayer?.nativeElement || !this.canStart) {
      this.debug('start-blocked', { hasLesson: !!this.lesson, hasMediaPlayer: !!this.mediaPlayer?.nativeElement, canStart: this.canStart });
      return;
    }

    this.stopMicrophoneTest(false);
    this.manualPreviewActive = false;
    this.pausedPhase = null;
    this.lastSavedMessage = '';
    const microphoneReady = await this.ensureMicStream();
    if (!microphoneReady) return;

    this.reviewSession =
      this.teacherPreview ||
      this.activeStageType === 'shadowing-review' ||
      this.remainingRepetitions === 0;
    this.sessionTargetForThisRun = this.reviewSession
      ? Math.min(5, Math.max(1, Number(this.sessionTargetRepetitions) || 1))
      : Math.max(
          1,
          Math.min(
            Number(this.sessionTargetRepetitions) || 1,
            this.remainingRepetitions,
          ),
        );
    this.sessionTargetRepetitions = this.sessionTargetForThisRun;
    this.sessionCompletedInThisRun = 0;
    this.currentRepetitionSegmentScores = [];
    this.shadowingRepetitionScores = [];
    this.sessionTrainingStartedAtMs = Date.now();
    this.speechReviewVisible = this.speechReviewRequiredByTeacher;
    this.sessionStarted = true;
    this.stopAfterCurrentRepetition = false;
    this.renderView();

    this.debug('session-started', { target: this.sessionTargetForThisRun, remaining: this.remainingRepetitions });
    await this.startNextRepetitionInSession();
  }

  async stopTraining(): Promise<void> {
    this.debug('stop-click', { state: this.state });
    this.stopAfterCurrentRepetition = true;
    this.sessionStarted = false;
    this.pausedPhase = null;
    this.clearTimer();
    this.stopTeacherProgress();
    this.stopStudentSpeechRecognition(true);

    const media = this.mediaPlayer?.nativeElement;
    if (media) media.pause();

    await this.stopRepetitionRecording(false);
    this.stopVisualizer();
    this.cleanupRecordingGraph();
    this.stopTracks();
    this.activeTurnChunks = [];
    this.studentTurnElapsedBeforePauseMs = 0;
    this.lastSavedMessage = '';
    this.state = 'stopped';
    this.resetToFirstSegment();
    this.renderView();
  }

  async deleteRecording(recording: RecordingView): Promise<void> {
    this.debug('delete-recording-click', { recordingId: recording.meta.id });
    const confirmed = window.confirm('هل تريد حذف هذا التسجيل؟');
    if (!confirmed) return;

    if (recording.url) URL.revokeObjectURL(recording.url);

    const repository = this.recordingRepository as unknown as {
      deleteRecording?: (id: string) => Promise<void> | void;
      removeRecording?: (id: string) => Promise<void> | void;
      delete?: (id: string) => Promise<void> | void;
      remove?: (id: string) => Promise<void> | void;
    };

    if (typeof repository.deleteRecording === 'function') {
      await repository.deleteRecording(recording.meta.id);
    } else if (typeof repository.removeRecording === 'function') {
      await repository.removeRecording(recording.meta.id);
    } else if (typeof repository.delete === 'function') {
      await repository.delete(recording.meta.id);
    } else if (typeof repository.remove === 'function') {
      await repository.remove(recording.meta.id);
    } else {
      await this.deleteRecordingFallback(recording.meta.id);
    }

    await this.loadRecordings();
    await this.syncProgressToBackend();
    this.renderView();
  }

  async handlePrimaryAction(): Promise<void> {
    if (this.state === 'paused') {
      await this.resumeTraining();
      return;
    }

    if (this.state === 'teacher' || this.state === 'student') {
      await this.pauseTraining();
      return;
    }

    await this.startSession();
  }

  async pauseTraining(): Promise<void> {
    if (this.state !== 'teacher' && this.state !== 'student') return;

    this.pausedPhase = this.state;
    this.pauseActiveTimer();

    const media = this.mediaPlayer?.nativeElement;
    if (this.pausedPhase === 'teacher') {
      media?.pause();
      this.stopTeacherProgress();
    } else {
      this.stopStudentSpeechRecognition(false);
      if (this.studentTurnStartedAt > 0) {
        this.studentTurnElapsedBeforePauseMs += Math.max(
          0,
          Date.now() - this.studentTurnStartedAt,
        );
      }
      this.studentTurnStartedAt = 0;
      this.stopVisualizer(false);
    }

    if (this.mediaRecorder?.state === 'recording') {
      try {
        this.accumulateActiveRecordingSlice();
        this.mediaRecorder.requestData();
        this.mediaRecorder.pause();
      } catch (error) {
        this.debug('recorder-pause-error', error);
      }
    }

    this.state = 'paused';
    this.renderView();
  }

  async resumeTraining(): Promise<void> {
    if (this.state !== 'paused' || !this.pausedPhase) return;

    if (this.mediaRecorder?.state === 'paused') {
      try {
        this.mediaRecorder.resume();
        this.recordingActiveSliceStartedAt = Date.now();
      } catch (error) {
        this.debug('recorder-resume-error', error);
      }
    }

    const phase = this.pausedPhase;
    this.state = phase;

    if (phase === 'teacher') {
      const media = this.mediaPlayer?.nativeElement;
      if (media && this.currentSegment) {
        this.applyTeacherPlaybackRate(media);
        try {
          await media.play();
          this.startTeacherProgress(this.currentSegment);
        } catch (error) {
          this.debug('teacher-resume-error', error);
          this.state = 'paused';
          this.renderView();
          return;
        }
      }
    } else if (this.micStream) {
      this.studentTurnStartedAt = Date.now();
      await this.startMicVisualizer(this.micStream, false);
      this.startStudentSpeechRecognition(false);
    }

    this.pausedPhase = null;
    this.resumeActiveTimer();
    this.renderView();
  }

  async previousSegment(): Promise<void> {
    await this.selectSegment(Math.max(0, this.currentSegmentIndex - 1));
  }

  async nextSegment(): Promise<void> {
    if (!this.lesson) return;
    await this.selectSegment(
      Math.min(this.lesson.segments.length - 1, this.currentSegmentIndex + 1),
    );
  }

  async replayCurrentSegment(): Promise<void> {
    if (!this.currentSegment) return;

    if (this.state === 'teacher' || this.state === 'student') {
      await this.selectSegment(this.currentSegmentIndex, true);
      return;
    }

    if (this.state === 'paused' || this.state === 'saving' || this.state === 'between') {
      return;
    }

    await this.previewSelectedSegment();
  }

  toggleSentenceTranslation(): void {
    if (!this.hasSentenceTranslation) return;
    this.sentenceTranslationVisible = !this.sentenceTranslationVisible;
    this.renderView();
  }

  adjustTeacherPlaybackRate(delta: number): void {
    const next = Math.min(2.0, Math.max(0.5, this.teacherPlaybackRate + delta));
    this.setTeacherPlaybackRate(Math.round(next * 20) / 20);
  }

  setTeacherPlaybackRate(value: number): void {
    const next = Math.min(2.0, Math.max(0.5, value));
    this.teacherPlaybackRate = Math.round(next * 100) / 100;
    localStorage.setItem(
      this.teacherPlaybackRateStorageKey,
      String(this.teacherPlaybackRate),
    );
    const media = this.mediaPlayer?.nativeElement;
    if (media) {
      this.applyTeacherPlaybackRate(media);
    }
    // If currently playing teacher audio, dynamically recalibrate remaining duration timer
    if ((this.state === 'teacher' || this.manualPreviewActive) && this.currentSegment && media) {
      const remainingSeconds = Math.max(0.1, (this.currentSegment.end - media.currentTime) / this.teacherPlaybackRate);
      const remainingMs = Math.round(remainingSeconds * 1000);
      const callback = this.activeTimerCallback;
      if (callback) {
        this.scheduleActiveTimer(remainingMs, callback);
      }
    }
    this.renderView();
  }

  setStudentTurnTimeLimitEnabled(enabled: boolean): void {
    this.studentTurnTimeLimitEnabled = enabled;
    localStorage.setItem(
      this.studentTurnTimeLimitStorageKey,
      enabled ? 'true' : 'false',
    );

    if (this.state === 'student' && this.currentSegment) {
      this.clearTimer();
      if (enabled) {
        const totalMs = this.getStudentTurnDuration(this.currentSegment);
        const elapsedMs =
          (this.studentTurnStartedAt > 0
            ? Date.now() - this.studentTurnStartedAt
            : 0) + this.studentTurnElapsedBeforePauseMs;
        const remainingMs = Math.max(200, totalMs - elapsedMs);
        this.studentTurnDurationMs = totalMs;
        this.scheduleActiveTimer(remainingMs, () => {
          this.debug('student-turn-timeout', {
            segmentIndex: this.currentSegmentIndex,
            elapsedSeconds: this.studentTurnElapsedSeconds,
          });
          void this.goToNextSegmentOrFinish();
        });
      } else {
        this.studentTurnDurationMs = 0;
        this.clearStudentSpeechCompletionTimer();
      }
    }

    this.renderView();
  }

  setStudentDurationRatio(ratio: number): void {
    const next = Math.min(3.0, Math.max(0.4, ratio));
    this.studentDurationRatio = Math.round(next * 100) / 100;
    localStorage.setItem(
      this.studentDurationRatioStorageKey,
      String(this.studentDurationRatio),
    );
    // If currently in student turn, dynamically recalculate remaining time
    if (this.studentTurnTimeLimitEnabled && this.state === 'student' && this.currentSegment) {
      const newTotalMs = this.getStudentTurnDuration(this.currentSegment);
      const elapsedMs = (Date.now() - this.studentTurnStartedAt) + this.studentTurnElapsedBeforePauseMs;
      const remainingMs = Math.max(200, newTotalMs - elapsedMs);
      this.studentTurnDurationMs = newTotalMs;
      const callback = this.activeTimerCallback;
      if (callback) {
        this.scheduleActiveTimer(remainingMs, callback);
      }
    }
    this.renderView();
  }

  adjustStudentDurationRatio(delta: number): void {
    const next = Math.min(3.0, Math.max(0.4, this.studentDurationRatio + delta));
    this.setStudentDurationRatio(Math.round(next * 20) / 20);
  }

  toggleSentenceDrawer(): void {
    this.sentenceDrawerOpen = !this.sentenceDrawerOpen;
    if (this.sentenceDrawerOpen) this.settingsDrawerOpen = false;
  }

  toggleSettingsDrawer(): void {
    this.settingsDrawerOpen = !this.settingsDrawerOpen;
    if (this.settingsDrawerOpen) this.sentenceDrawerOpen = false;
  }

  closePlayerDrawers(): void {
    this.sentenceDrawerOpen = false;
    this.settingsDrawerOpen = false;
  }

  async selectSegmentFromDrawer(index: number): Promise<void> {
    await this.selectSegment(index);
    this.closePlayerDrawers();
  }

  resetTeacherPlaybackRate(): void {
    if (this.isRunning) return;
    this.teacherPlaybackRate = 1;
    localStorage.setItem(this.teacherPlaybackRateStorageKey, '1');
    const media = this.mediaPlayer?.nativeElement;
    if (media) this.applyTeacherPlaybackRate(media);
    this.renderView();
  }

  adjustStudentDuration(deltaSeconds: number): void {
    if (this.isRunning) return;
    const next = Math.min(
      8,
      Math.max(0, this.studentDurationOffsetSeconds + deltaSeconds),
    );
    this.studentDurationOffsetSeconds = Math.round(next * 2) / 2;
    localStorage.setItem(
      this.studentDurationStorageKey,
      String(this.studentDurationOffsetSeconds),
    );
    this.renderView();
  }

  resetStudentDuration(): void {
    if (this.isRunning) return;
    this.studentDurationOffsetSeconds = 3.5;
    localStorage.setItem(this.studentDurationStorageKey, '3.5');
    this.renderView();
  }

  setAudioCaptureMode(value: string): void {
    if (this.isRunning || this.microphoneTestStarting) return;
    if (value !== 'auto' && value !== 'headset' && value !== 'phone') return;
    if (value === this.audioCaptureMode) return;

    this.stopMicrophoneTest(false);
    this.audioCaptureMode = value;
    localStorage.setItem(this.audioCaptureModeStorageKey, value);
    this.stopVisualizer();
    this.stopTracks();
    this.microphoneSettingsLabel =
      `تم اختيار وضع ${this.audioCaptureModeLabel}. سيُطبّق عند بدء التدريب.`;
    this.renderView();
  }

  toggleSlowAudio(): void {
    if (this.teacherPlaybackRate === 0.75) {
      this.setTeacherPlaybackRate(1.0);
    } else {
      this.setTeacherPlaybackRate(0.75);
    }
  }

  setCountdownPause(seconds: number): void {
    this.countdownPauseSeconds = seconds;
    this.renderView();
  }

  openCompletionModal(): void {
    this.isCompletionModalOpen = true;
    this.renderView();
  }

  closeCompletionModal(): void {
    this.isCompletionModalOpen = false;
    this.renderView();
  }

  restartCurrentStage(): void {
    this.closeCompletionModal();
    this.resetToFirstSegment();
    void this.startSession();
  }

  async requestMicPermission(): Promise<void> {
    this.showMicPermissionBanner = false;
    const ok = await this.ensureMicStream();
    if (!ok) {
      this.showMicPermissionBanner = true;
    }
    this.renderView();
  }

  async toggleMicrophoneTest(): Promise<void> {
    if (this.microphoneTestActive) {
      this.stopMicrophoneTest(true);
      return;
    }

    if (this.isRunning || this.microphoneTestStarting) return;

    this.microphoneTestStarting = true;
    this.microphoneTestActive = true;
    this.microphoneTestMessage = '';
    this.renderView();

    const ready = await this.ensureMicStream(false);
    this.microphoneTestStarting = false;

    if (!ready || !this.micStream) {
      this.microphoneTestActive = false;
      this.renderView();
      return;
    }

    await this.startMicVisualizer(this.micStream);
    this.microphoneTestTimerId = window.setTimeout(() => {
      this.stopMicrophoneTest(true);
      this.microphoneTestMessage =
        'انتهى الاختبار بعد 30 ثانية، ولم يتم حفظ أي صوت.';
      this.renderView();
    }, 30_000);
    this.renderView();
  }

  get canContinueToNextStage(): boolean {
    return !this.teacherPreview && this.activeStageCompleted;
  }

  get nextStageLabel(): string {
    if (!this.lesson) return 'المرحلة التالية';
    const activities = getLessonActivities(this.lesson);
    const index = activities.findIndex((activity) => activity.id === this.activeStageId);
    return activities[index + 1]?.title || 'إنهاء الدرس';
  }

  async continueToNextStage(): Promise<void> {
    if (!this.lesson || this.teacherPreview) return;
    this.markActiveShadowingStageComplete();
    const lessonView = this.courseFacade.getLesson(this.lesson.id, this.curriculumSlotId);
    const currentIndex = lessonView?.stages.findIndex(
      (stage) => stage.id === this.activeStageId,
    ) ?? -1;
    const nextStage = currentIndex >= 0 ? lessonView?.stages[currentIndex + 1] : null;
    const destination = nextStage?.path ||
      `/student/lessons/${this.lesson.id}/complete`;
    await this.router.navigateByUrl(
      `${destination}?slotId=${encodeURIComponent(this.curriculumSlotId)}`,
    );
  }

  private async selectSegment(index: number, forceReplay = false): Promise<void> {
    if (!this.lesson || index < 0 || index >= this.lesson.segments.length) return;
    if (this.state === 'saving' || this.state === 'between' || this.state === 'paused') return;

    const trainingActive = this.state === 'teacher' || this.state === 'student';
    if (!forceReplay && index === this.currentSegmentIndex) return;

    this.clearTimer();
    this.stopTeacherProgress();
    this.stopStudentSpeechRecognition(true);
    this.stopVisualizer(false);
    this.mediaPlayer?.nativeElement.pause();
    this.currentSegmentIndex = index;
    this.currentSegment = this.lesson.segments[index];
    this.sentenceTranslationVisible = false;
    this.teacherSegmentProgress = 0;
    this.studentTurnElapsedSeconds = 0;
    this.studentTurnElapsedBeforePauseMs = 0;
    this.renderView();

    if (trainingActive) {
      await this.playCurrentTeacherSegment();
    }
  }

  private async previewSelectedSegment(): Promise<void> {
    const media = this.mediaPlayer?.nativeElement;
    const segment = this.currentSegment;
    if (!media || !segment) return;

    this.clearTimer();
    this.stopTeacherProgress();
    this.stopMicrophoneTest(false);
    this.manualPreviewActive = true;
    this.teacherSegmentProgress = 0;
    media.currentTime = segment.start;
    this.applyTeacherPlaybackRate(media);
    this.renderView();

    try {
      await media.play();
      this.startTeacherProgress(segment);
    } catch (error) {
      this.manualPreviewActive = false;
      this.error = 'المتصفح منع تشغيل الجملة. اضغط إعادة الجملة مرة أخرى.';
      this.renderView();
      return;
    }

    const durationMs = this.getTeacherPlaybackDurationMs(segment);
    this.scheduleActiveTimer(durationMs, () => {
      media.pause();
      this.stopTeacherProgress();
      this.manualPreviewActive = false;
      this.teacherSegmentProgress = 100;
      this.renderView();
    });
  }

  private async startNextRepetitionInSession(): Promise<void> {
    if (!this.lesson || this.stopAfterCurrentRepetition) {
      this.sessionStarted = false;
      this.state = 'ready';
      this.resetToFirstSegment();
      this.renderView();
      return;
    }

    if (
      this.sessionCompletedInThisRun >= this.sessionTargetForThisRun ||
      (!this.reviewSession && this.remainingRepetitions <= 0)
    ) {
      this.sessionStarted = false;
      this.state = 'finished';
      this.isCompletionModalOpen = true;
      this.resetToFirstSegment();
      this.renderView();
      return;
    }

    this.currentRepetitionSegmentScores = [];
    this.currentRepetitionNumber = this.reviewSession
      ? Math.max(1, this.lesson.requiredRepetitions)
      : this.completedRepetitions + 1;
    this.currentSegmentIndex = 0;
    this.currentSegment = this.lesson.segments[0];
    this.renderView();
    this.debug('repetition-start', { repetition: this.currentRepetitionNumber, segmentIndex: this.currentSegmentIndex, segment: this.currentSegment });
    this.activeTurnChunks = [];
    this.totalRecordedMs = 0;
    this.studentTurnElapsedSeconds = 0;
    this.studentTurnElapsedBeforePauseMs = 0;
    this.startedAt = Date.now();

    const recorderReady = await this.startRepetitionRecording();
    if (!recorderReady) return;

    await this.playCurrentTeacherSegment();
  }

  private async playCurrentTeacherSegment(): Promise<void> {
    if (!this.lesson || !this.currentSegment || !this.mediaPlayer?.nativeElement) {
      this.debug('teacher-segment-blocked', { hasLesson: !!this.lesson, hasSegment: !!this.currentSegment, hasMediaPlayer: !!this.mediaPlayer?.nativeElement });
      return;
    }

    this.clearTimer();
    this.stopVisualizer();
    this.stopStudentSpeechRecognition(true);

    const media = this.mediaPlayer.nativeElement;
    const segment = this.currentSegment;

    this.state = 'teacher';
    this.teacherSegmentProgress = 0;
    media.currentTime = segment.start;
    this.applyTeacherPlaybackRate(media);
    this.renderView();
    this.debug('teacher-play-start', { segmentIndex: this.currentSegmentIndex, text: segment.text, start: segment.start, end: segment.end });

    try {
      await media.play();
      this.startTeacherProgress(segment);
    } catch (error) {
      this.debug('teacher-play-error', error);
      this.state = 'error';
      this.error = 'The browser blocked playback. Press Start again.';
      this.renderView();
      return;
    }

    const durationMs = this.getTeacherPlaybackDurationMs(segment);

    this.scheduleActiveTimer(durationMs, () => {
      media.pause();
      this.stopTeacherProgress();
      this.debug('teacher-play-end', { segmentIndex: this.currentSegmentIndex, durationMs });
      void this.startStudentTurn(segment);
    });
  }

  private async startStudentTurn(segment: LessonSegment): Promise<void> {
    this.debug('student-turn-start', { segmentIndex: this.currentSegmentIndex, text: segment.text });
    this.clearTimer();
    this.stopTeacherProgress();
    this.state = 'student';
    this.studentTurnElapsedSeconds = 0;
    this.studentTurnElapsedBeforePauseMs = 0;
    this.studentTurnStartedAt = Date.now();
    this.studentTurnDurationMs = this.studentTurnTimeLimitEnabled
      ? this.getStudentTurnDuration(segment)
      : 0;
    this.renderView();

    const microphoneReady = await this.ensureMicStream();
    if (!microphoneReady || !this.micStream) return;

    await this.startMicVisualizer(this.micStream);
    this.startStudentSpeechRecognition(true);
    this.debug('student-visualizer-started', {
      segmentIndex: this.currentSegmentIndex,
      durationMs: this.studentTurnDurationMs,
      timeLimitEnabled: this.studentTurnTimeLimitEnabled,
    });

    if (this.studentTurnTimeLimitEnabled) {
      this.scheduleActiveTimer(this.studentTurnDurationMs, () => {
        this.debug('student-turn-timeout', {
          segmentIndex: this.currentSegmentIndex,
          elapsedSeconds: this.studentTurnElapsedSeconds,
        });
        void this.goToNextSegmentOrFinish();
      });
    }
  }

  private startStudentSpeechRecognition(resetProgress: boolean): void {
    if (!this.currentSegment || this.state !== 'student') return;

    if (resetProgress) {
      this.resetStudentKaraokeState();
      this.studentRecognitionCommittedTokens = [];
      this.studentRecognitionSessionTranscript = '';
      this.studentLatestRecognizedTokens = [];
      this.clearStudentSpeechCompletionTimer();
    }

    this.clearStudentSpeechRecognitionRestart();

    const RecognitionConstructor =
      (window as unknown as { SpeechRecognition?: new () => BrowserSpeechRecognition }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => BrowserSpeechRecognition }).webkitSpeechRecognition;

    if (!RecognitionConstructor) {
      this.studentSpeechRecognitionSupported = false;
      this.studentSpeechRecognitionShouldRun = false;
      this.debug('student-speech-recognition-unavailable');
      this.renderView();
      return;
    }

    this.studentSpeechRecognitionSupported = true;
    this.studentSpeechRecognitionShouldRun = true;
    const generation = ++this.studentRecognitionGeneration;
    const recognition = new RecognitionConstructor();
    this.studentSpeechRecognition = recognition;

    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      if (
        generation !== this.studentRecognitionGeneration ||
        !this.studentSpeechRecognitionShouldRun ||
        this.state !== 'student'
      ) {
        return;
      }

      let transcript = '';
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const alternative = result?.[0];
        if (alternative?.transcript) transcript += ` ${alternative.transcript}`;
      }

      this.studentRecognitionSessionTranscript = transcript.trim();
      const liveTokens = [
        ...this.studentRecognitionCommittedTokens,
        ...this.normalizeSpeechTokens(this.studentRecognitionSessionTranscript),
      ];
      this.studentLatestRecognizedTokens = liveTokens;
      this.updateStudentKaraokeFromRecognizedTokens(liveTokens);
      const latestResult = event.results[event.results.length - 1];
      if (latestResult?.isFinal) {
        this.maybeScheduleStudentSpeechCompletion(liveTokens, true);
      }
    };

    recognition.onerror = (event) => {
      if (generation !== this.studentRecognitionGeneration) return;

      const error = event?.error || 'unknown';
      this.debug('student-speech-recognition-error', { error });

      if (
        error === 'not-allowed' ||
        error === 'service-not-allowed' ||
        error === 'audio-capture'
      ) {
        this.studentSpeechRecognitionShouldRun = false;
      }
    };

    recognition.onend = () => {
      if (generation !== this.studentRecognitionGeneration) return;

      this.commitStudentRecognitionSession();
      if (this.studentSpeechRecognition === recognition) {
        this.studentSpeechRecognition = null;
      }

      if (!this.studentSpeechRecognitionShouldRun || this.state !== 'student') return;

      this.studentSpeechRecognitionRestartId = window.setTimeout(() => {
        this.studentSpeechRecognitionRestartId = null;
        if (this.studentSpeechRecognitionShouldRun && this.state === 'student') {
          this.startStudentSpeechRecognition(false);
        }
      }, 120);
    };

    try {
      recognition.start();
      this.debug('student-speech-recognition-start', {
        segmentIndex: this.currentSegmentIndex,
        expectedText: this.currentSegment.text,
      });
    } catch (error) {
      this.debug('student-speech-recognition-start-error', error);
      if (this.studentSpeechRecognition === recognition) {
        this.studentSpeechRecognition = null;
      }
      this.studentSpeechRecognitionRestartId = window.setTimeout(() => {
        this.studentSpeechRecognitionRestartId = null;
        if (this.studentSpeechRecognitionShouldRun && this.state === 'student') {
          this.startStudentSpeechRecognition(false);
        }
      }, 250);
    }
  }

  private stopStudentSpeechRecognition(resetProgress: boolean): void {
    this.studentSpeechRecognitionShouldRun = false;
    this.clearStudentSpeechRecognitionRestart();
    this.clearStudentSpeechCompletionTimer();
    this.commitStudentRecognitionSession();
    this.studentRecognitionGeneration += 1;

    const recognition = this.studentSpeechRecognition;
    this.studentSpeechRecognition = null;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.abort();
      } catch {
        // Recognition may already be stopped by the browser.
      }
    }

    if (resetProgress) {
      this.studentRecognitionCommittedTokens = [];
      this.studentRecognitionSessionTranscript = '';
      this.studentLatestRecognizedTokens = [];
      this.resetStudentKaraokeState();
    }
  }

  private clearStudentSpeechRecognitionRestart(): void {
    if (this.studentSpeechRecognitionRestartId !== null) {
      window.clearTimeout(this.studentSpeechRecognitionRestartId);
      this.studentSpeechRecognitionRestartId = null;
    }
  }

  private commitStudentRecognitionSession(): void {
    if (!this.studentRecognitionSessionTranscript.trim()) return;
    this.studentRecognitionCommittedTokens.push(
      ...this.normalizeSpeechTokens(this.studentRecognitionSessionTranscript),
    );
    this.studentRecognitionSessionTranscript = '';
  }

  private resetStudentKaraokeState(): void {
    this.studentKaraokeWordStates = this.karaokeWords.map(() => 'pending');
    this.currentKaraokeIndex = -1;
  }

  private updateStudentKaraokeFromRecognizedTokens(spokenTokens: string[]): void {
    const expectedUnits = this.buildExpectedSpeechUnits();
    if (expectedUnits.length === 0) {
      this.studentKaraokeWordStates = [];
      this.currentKaraokeIndex = -1;
      this.renderView();
      return;
    }

    if (spokenTokens.length === 0) {
      this.resetStudentKaraokeState();
      this.renderView();
      return;
    }

    const expectedTokens = expectedUnits.map((unit) => unit.token);
    const rows = expectedTokens.length + 1;
    const columns = spokenTokens.length + 1;
    const score = Array.from({ length: rows }, () => Array<number>(columns).fill(0));
    const move = Array.from({ length: rows }, () => Array<'match' | 'substitute' | 'delete' | 'insert' | null>(columns).fill(null));

    for (let expectedIndex = 1; expectedIndex < rows; expectedIndex += 1) {
      score[expectedIndex][0] = expectedIndex;
      move[expectedIndex][0] = 'delete';
    }
    for (let spokenIndex = 1; spokenIndex < columns; spokenIndex += 1) {
      score[0][spokenIndex] = spokenIndex;
      move[0][spokenIndex] = 'insert';
    }

    for (let expectedIndex = 1; expectedIndex < rows; expectedIndex += 1) {
      for (let spokenIndex = 1; spokenIndex < columns; spokenIndex += 1) {
        const same = expectedTokens[expectedIndex - 1] === spokenTokens[spokenIndex - 1];
        const diagonal = score[expectedIndex - 1][spokenIndex - 1] + (same ? 0 : 1);
        const deletion = score[expectedIndex - 1][spokenIndex] + 1;
        const insertion = score[expectedIndex][spokenIndex - 1] + 1;
        const best = Math.min(diagonal, deletion, insertion);

        score[expectedIndex][spokenIndex] = best;
        if (best === diagonal) {
          move[expectedIndex][spokenIndex] = same ? 'match' : 'substitute';
        } else if (best === deletion) {
          move[expectedIndex][spokenIndex] = 'delete';
        } else {
          move[expectedIndex][spokenIndex] = 'insert';
        }
      }
    }

    const operations: Array<{
      type: 'match' | 'substitute' | 'delete' | 'insert';
      expectedUnitIndex: number | null;
      spokenIndex: number | null;
    }> = [];

    let expectedCursor = expectedTokens.length;
    let spokenCursor = spokenTokens.length;
    while (expectedCursor > 0 || spokenCursor > 0) {
      const direction = move[expectedCursor][spokenCursor];
      if ((direction === 'match' || direction === 'substitute') && expectedCursor > 0 && spokenCursor > 0) {
        operations.push({
          type: direction,
          expectedUnitIndex: expectedCursor - 1,
          spokenIndex: spokenCursor - 1,
        });
        expectedCursor -= 1;
        spokenCursor -= 1;
      } else if (direction === 'delete' && expectedCursor > 0) {
        operations.push({
          type: 'delete',
          expectedUnitIndex: expectedCursor - 1,
          spokenIndex: null,
        });
        expectedCursor -= 1;
      } else if (spokenCursor > 0) {
        operations.push({
          type: 'insert',
          expectedUnitIndex: null,
          spokenIndex: spokenCursor - 1,
        });
        spokenCursor -= 1;
      } else {
        break;
      }
    }
    operations.reverse();

    const unitStates: StudentKaraokeWordState[] = expectedUnits.map(() => 'pending');
    let consumedSpokenTokens = 0;
    let activeVisualIndex = -1;

    for (const operation of operations) {
      if (operation.type === 'insert') {
        consumedSpokenTokens += 1;
        continue;
      }

      const unitIndex = operation.expectedUnitIndex;
      if (unitIndex === null) continue;
      const visualIndex = expectedUnits[unitIndex].visualIndex;

      if (operation.type === 'match') {
        unitStates[unitIndex] = 'matched';
        consumedSpokenTokens += 1;
        activeVisualIndex = visualIndex;
      } else if (operation.type === 'substitute') {
        unitStates[unitIndex] = 'wrong';
        consumedSpokenTokens += 1;
        activeVisualIndex = visualIndex;
      } else if (operation.type === 'delete') {
        unitStates[unitIndex] =
          consumedSpokenTokens < spokenTokens.length ? 'wrong' : 'pending';
      }
    }

    const visualStates = this.karaokeWords.map<StudentKaraokeWordState>((_, visualIndex) => {
      const relevantStates = expectedUnits
        .map((unit, unitIndex) => ({ unit, state: unitStates[unitIndex] }))
        .filter((item) => item.unit.visualIndex === visualIndex)
        .map((item) => item.state);

      if (relevantStates.length === 0) return 'pending';
      if (relevantStates.every((state) => state === 'matched')) return 'matched';
      if (relevantStates.some((state) => state === 'wrong')) return 'wrong';
      return 'pending';
    });

    this.studentKaraokeWordStates = visualStates;
    this.currentKaraokeIndex = activeVisualIndex;
    this.renderView();
  }

  private maybeScheduleStudentSpeechCompletion(
    spokenTokens: string[],
    finalResult = false,
  ): void {
    const expectedCount = this.buildExpectedSpeechUnits().length;
    const minimumCaptured = Math.max(1, Math.ceil(expectedCount * 0.7));
    if (
      this.studentTurnTimeLimitEnabled ||
      !this.autoAdvanceEnabled ||
      this.state !== 'student' ||
      !finalResult ||
      spokenTokens.length < minimumCaptured
    ) {
      this.clearStudentSpeechCompletionTimer();
      return;
    }

    if (this.studentSpeechCompletionTimerId !== null) return;

    this.studentSpeechCompletionTimerId = window.setTimeout(() => {
      this.studentSpeechCompletionTimerId = null;
      if (
        this.state !== 'student' ||
        this.studentTurnTimeLimitEnabled ||
        !this.autoAdvanceEnabled
      ) {
        return;
      }

      this.debug('student-speech-finished-auto-advance', {
        segmentIndex: this.currentSegmentIndex,
        capturedTokens: this.studentLatestRecognizedTokens.length,
        expectedTokens: expectedCount,
        matchScore: this.currentSpeechMatchScore,
        reviewVisible: this.shouldShowSpeechReview,
      });
      void this.goToNextSegmentOrFinish();
    }, 900);
  }

  private hasExactExpectedSentenceWindow(spokenTokens: string[]): boolean {
    const expectedTokens = this.buildExpectedSpeechUnits().map((unit) => unit.token);
    if (expectedTokens.length === 0 || spokenTokens.length < expectedTokens.length) {
      return false;
    }

    const lastStart = spokenTokens.length - expectedTokens.length;
    for (let start = 0; start <= lastStart; start += 1) {
      let matches = true;
      for (let offset = 0; offset < expectedTokens.length; offset += 1) {
        if (spokenTokens[start + offset] !== expectedTokens[offset]) {
          matches = false;
          break;
        }
      }
      if (matches) return true;
    }

    return false;
  }

  private captureCurrentSegmentQuality(): void {
    if (this.state !== 'student') return;
    const score = this.currentSpeechMatchScore;
    this.currentRepetitionSegmentScores.push(score);
    this.debug('shadowing-segment-quality-captured', {
      segmentIndex: this.currentSegmentIndex,
      score,
      expectedText: this.currentSegment?.text || '',
      recognizedText: this.studentRecognitionSessionTranscript,
      reviewVisible: this.shouldShowSpeechReview,
    });
  }

  private clearStudentSpeechCompletionTimer(): void {
    if (this.studentSpeechCompletionTimerId !== null) {
      window.clearTimeout(this.studentSpeechCompletionTimerId);
      this.studentSpeechCompletionTimerId = null;
    }
  }

  private buildExpectedSpeechUnits(): Array<{ token: string; visualIndex: number }> {
    const units: Array<{ token: string; visualIndex: number }> = [];
    this.karaokeWords.forEach((word, visualIndex) => {
      const normalized = this.normalizeSpeechTokens(word);
      for (const token of normalized) {
        units.push({ token, visualIndex });
      }
    });
    return units;
  }

  private normalizeSpeechTokens(text: string): string[] {
    const rawTokens = text
      .toLowerCase()
      .replace(/[’`]/g, "'")
      .match(/[a-z0-9]+(?:'[a-z0-9]+)?/g) || [];

    const contractionExpansions: Record<string, string[]> = {
      "i'm": ['i', 'am'],
      "you're": ['you', 'are'],
      "we're": ['we', 'are'],
      "they're": ['they', 'are'],
      "he's": ['he', 'is'],
      "she's": ['she', 'is'],
      "it's": ['it', 'is'],
      "that's": ['that', 'is'],
      "what's": ['what', 'is'],
      "where's": ['where', 'is'],
      "who's": ['who', 'is'],
      "there's": ['there', 'is'],
      "i've": ['i', 'have'],
      "you've": ['you', 'have'],
      "we've": ['we', 'have'],
      "they've": ['they', 'have'],
      "i'll": ['i', 'will'],
      "you'll": ['you', 'will'],
      "we'll": ['we', 'will'],
      "they'll": ['they', 'will'],
      "he'll": ['he', 'will'],
      "she'll": ['she', 'will'],
      "don't": ['do', 'not'],
      "doesn't": ['does', 'not'],
      "didn't": ['did', 'not'],
      "isn't": ['is', 'not'],
      "aren't": ['are', 'not'],
      "wasn't": ['was', 'not'],
      "weren't": ['were', 'not'],
      "can't": ['can', 'not'],
      "couldn't": ['could', 'not'],
      "shouldn't": ['should', 'not'],
      "wouldn't": ['would', 'not'],
      "won't": ['will', 'not'],
      "haven't": ['have', 'not'],
      "hasn't": ['has', 'not'],
      "hadn't": ['had', 'not'],
    };

    return rawTokens.flatMap((token) => contractionExpansions[token] || [token]);
  }

  private async goToNextSegmentOrFinish(): Promise<void> {
    if (!this.lesson) return;

    this.clearTimer();
    this.captureCurrentSegmentQuality();
    this.debug('student-turn-stop-request', { segmentIndex: this.currentSegmentIndex, matchScore: this.currentSpeechMatchScore });
    this.stopStudentSpeechRecognition(true);
    this.stopVisualizer();

    const nextIndex = this.currentSegmentIndex + 1;

    if (nextIndex < this.lesson.segments.length) {
      this.currentSegmentIndex = nextIndex;
      this.currentSegment = this.lesson.segments[nextIndex];
      this.renderView();
      this.debug('segment-change', { nextIndex, segment: this.currentSegment });
      await this.playCurrentTeacherSegment();
      return;
    }

    await this.finishRepetition();
  }

  private async finishRepetition(): Promise<void> {
    this.debug('finish-repetition-start', { chunks: this.activeTurnChunks.length, totalRecordedMs: this.totalRecordedMs });
    this.state = 'saving';
    this.renderView();
    this.stopStudentSpeechRecognition(true);
    this.stopVisualizer();
    this.stopTeacherProgress();

    const blob = await this.stopRepetitionRecording(true);

    if (!this.lesson || !this.studentId || !blob || blob.size === 0) {
      this.state = 'ready';
      this.resetToFirstSegment();
      this.renderView();
      return;
    }

    const now = new Date().toISOString();
    const durationSeconds = Math.max(0, Math.round(this.totalRecordedMs / 1000));

    const meta: RecordingMeta = {
      id: `recording-${Date.now()}`,
      studentId: this.studentId,
      groupId: this.activeGroupId || undefined,
      lessonId: this.lesson.id,
      curriculumSlotId: this.curriculumSlotId || undefined,
      repetitionFrom: this.currentRepetitionNumber,
      repetitionTo: this.currentRepetitionNumber,
      mode: 'per-repetition',
      countsTowardProgress: !this.reviewSession && !this.teacherPreview,
      durationLabel: this.formatDurationSeconds(durationSeconds),
      createdAt: now,
    };

    const completedBeforeSave = this.completedRepetitions;
    await this.recordingRepository.saveRecording(meta, blob);
    this.debug('recording-saved', { recordingId: meta.id, blobSize: blob.size, duration: meta.durationLabel });
    this.syncProgressFallback(meta, completedBeforeSave);
    await Promise.all([
      this.syncProgressToBackend(),
      this.loadRecordings(),
    ]);
    this.debug('recordings-reloaded', { count: this.recordings.length });

    const repetitionScore = this.currentRepetitionSegmentScores.length
      ? Math.round(
          this.currentRepetitionSegmentScores.reduce((sum, value) => sum + value, 0) /
            this.currentRepetitionSegmentScores.length,
        )
      : 0;
    this.shadowingRepetitionScores.push(repetitionScore);
    this.debug('shadowing-repetition-quality-captured', {
      repetition: this.currentRepetitionNumber,
      repetitionScore,
      segmentScores: [...this.currentRepetitionSegmentScores],
    });

    this.sessionCompletedInThisRun++;
    if (
      !this.teacherPreview &&
      (this.sessionCompletedInThisRun >= this.sessionTargetForThisRun ||
        this.remainingRepetitions === 0 ||
        this.activeStageType === 'shadowing-review')
    ) {
      this.markActiveShadowingStageComplete();
    }
    this.lastSavedMessage = `تم حفظ التكرار ${this.sessionCompletedInThisRun} من ${this.sessionTargetForThisRun}`;
    this.activeTurnChunks = [];
    this.totalRecordedMs = 0;
    this.renderView();

    if (this.stopAfterCurrentRepetition) {
      this.sessionStarted = false;
      this.state = 'finished';
      this.lastSavedMessage = 'تم حفظ التسجيل وإيقاف التدريب.';
      this.resetToFirstSegment();
      this.renderView();
      return;
    }

    if (
      this.sessionCompletedInThisRun < this.sessionTargetForThisRun &&
      (this.reviewSession || this.remainingRepetitions > 0)
    ) {
      this.state = 'between';
      this.renderView();
      this.scheduleActiveTimer(1200, () => {
        void this.startNextRepetitionInSession();
      });
      return;
    }

    this.sessionStarted = false;
    this.state = 'finished';
    this.lastSavedMessage = `تم عمل ${this.sessionCompletedInThisRun} تكرار وحفظ التسجيلات بنجاح.`;
    this.isCompletionModalOpen = true;
    this.debug('shadowing-completion-modal-open:check-ok', {
      repetitions: this.sessionCompletedInThisRun,
      averageMatchScore: this.completionMatchScore,
      bestRepetitionScore: this.completionBestRepetitionScore,
      qualityLabel: this.completionQualityLabel,
      trainingTime: this.completionTrainingTimeLabel,
    });
    if (!this.teacherPreview && this.studentId && this.activeGroupId && this.lesson) {
      void this.trackingApi.trackEvent({
        studentId: this.studentId,
        studentName: this.auth.currentUser?.name || this.studentId,
        groupId: this.activeGroupId,
        groupName: this.auth.currentUser?.groupName || this.activeGroupId,
        cefrLevel: this.auth.currentUser?.cefrLevel || 'A1',
        lessonId: this.lesson.id,
        lessonTitle: this.lesson.title,
        curriculumSlotId: this.curriculumSlotId,
        stageId: this.activeStageId,
        eventType: 'shadowing_stage_evaluated',
        status: 'success',
        detailsJson: JSON.stringify({
          repetitions: this.sessionCompletedInThisRun,
          averageSpeechMatchScore: this.completionMatchScore,
          bestRepetitionScore: this.completionBestRepetitionScore,
          qualityLabel: this.completionQualityLabel,
          speechReviewMode: this.speechReviewRequiredByTeacher ? 'teacher-required' : 'student-request',
          note: 'Speech Recognition text match; not an accent/pronunciation score',
        }),
        occurredAtUtc: new Date().toISOString(),
        correlationId: `shadowing-evaluated-${this.studentId}-${this.activeStageId}-${Date.now()}`,
      });
    }
    this.resetToFirstSegment();
    this.renderView();
  }

  private async ensureMicStream(reportFatalError = true): Promise<boolean> {
    try {
      if (this.micStream?.active) {
        this.debug('microphone-already-active', { tracks: this.micStream.getAudioTracks().length });
        return true;
      }

      this.debug('microphone-request');
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: this.microphoneConstraintsForMode(this.audioCaptureMode),
      });

      const microphoneTrack = this.micStream.getAudioTracks()[0];
      this.microphoneSettingsLabel = microphoneTrack
        ? this.describeMicrophoneSettings(microphoneTrack)
        : `وضع ${this.audioCaptureModeLabel} جاهز.`;

      this.debug('microphone-ready', {
        active: this.micStream.active,
        tracks: this.micStream.getAudioTracks().map((track) => ({ label: track.label, enabled: track.enabled, muted: track.muted, readyState: track.readyState })),
      });

      return true;
    } catch (error) {
      this.debug('microphone-error', error);
      const message =
        'تعذر فتح الميكروفون. اسمح باستخدامه من إعدادات المتصفح ثم حاول مرة أخرى.';
      this.microphoneTestMessage = message;
      if (reportFatalError) {
        this.error = message;
        if (this.state === 'teacher' || this.state === 'student') {
          this.state = 'ready';
        }
      }
      this.renderView();
      this.stopVisualizer();
      this.stopTracks();
      return false;
    }
  }

  private async startRepetitionRecording(): Promise<boolean> {
    try {
      const microphoneReady = await this.ensureMicStream();
      if (!microphoneReady || !this.micStream || !this.mediaPlayer?.nativeElement) return false;

      this.activeTurnChunks = [];
      this.recorderChunkCount = 0;
      this.startedAt = Date.now();
      this.totalRecordedMs = 0;
      this.recordingAccumulatedMs = 0;
      this.recordingActiveSliceStartedAt = 0;
      this.recordingMimeType = this.pickRecordingMimeType();
      this.cleanupRecordingGraph();

      const media = this.mediaPlayer.nativeElement as HTMLVideoElement & {
        captureStream?: () => MediaStream;
        mozCaptureStream?: () => MediaStream;
      };

      const capture = media.captureStream?.bind(media) || media.mozCaptureStream?.bind(media);
      this.capturedTeacherStream = capture ? capture() : null;

      const teacherTracks = this.capturedTeacherStream?.getAudioTracks() || [];
      const micTracks = this.micStream.getAudioTracks();

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.recordingAudioContext = new AudioContextClass();
      await this.recordingAudioContext.resume();
      this.recordingDestination = this.recordingAudioContext.createMediaStreamDestination();
      this.recordingSources = [];

      if (this.capturedTeacherStream && teacherTracks.length > 0) {
        const teacherSource = this.recordingAudioContext.createMediaStreamSource(this.capturedTeacherStream);
        teacherSource.connect(this.recordingDestination);
        this.recordingSources.push(teacherSource);
      }

      if (this.micStream && micTracks.length > 0) {
        const micSource = this.recordingAudioContext.createMediaStreamSource(this.micStream);
        micSource.connect(this.recordingDestination);
        this.recordingSources.push(micSource);
      }

      const mixedTracks = this.recordingDestination.stream.getAudioTracks();

      this.debug('mixed-recorder-create', {
        mimeType: this.recordingMimeType || 'browser-default',
        teacherTracks: teacherTracks.length,
        micTracks: micTracks.length,
        mixedTracks: mixedTracks.length,
        sources: this.recordingSources.length,
      });

      if (mixedTracks.length === 0 || this.recordingSources.length === 0) {
        this.state = 'error';
        this.error = 'No audio tracks found for recording.';
        this.renderView();
        return false;
      }

      this.mixedRecordingStream = this.recordingDestination.stream;
      const options = this.recordingMimeType ? { mimeType: this.recordingMimeType } : undefined;
      this.mediaRecorder = new MediaRecorder(this.mixedRecordingStream, options);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.activeTurnChunks.push(event.data);
          this.recorderChunkCount++;

          if (this.recorderChunkCount <= 3 || this.recorderChunkCount % 10 === 0) {
            this.debug('recorder-data', { count: this.recorderChunkCount, chunkSize: event.data.size });
          }
        }
      };

      this.mediaRecorder.start(200);
      this.startedAt = Date.now();
      this.recordingActiveSliceStartedAt = this.startedAt;
      this.debug('mixed-recorder-started', { state: this.mediaRecorder.state });
      return true;
    } catch (error) {
      this.debug('mixed-recorder-error', error);
      this.state = 'error';
      this.error = 'Microphone permission is required to record your repetition.';
      this.renderView();
      this.stopVisualizer();
      this.cleanupRecordingGraph();
      this.stopTracks();
      return false;
    }
  }

  private stopRepetitionRecording(shouldKeep: boolean): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        this.cleanupCapturedTeacherStream();
        resolve(null);
        return;
      }

      const recorder = this.mediaRecorder;

      recorder.onstop = () => {
        this.accumulateActiveRecordingSlice();
        const durationMs = Math.max(0, this.recordingAccumulatedMs);
        this.totalRecordedMs = durationMs;

        let blob: Blob | null = null;

        if (shouldKeep && this.activeTurnChunks.length > 0) {
          blob = new Blob(this.activeTurnChunks, { type: this.recordingMimeType || recorder.mimeType || 'audio/webm' });
          this.debug('mixed-recorder-stopped-keep', { chunks: this.activeTurnChunks.length, blobSize: blob.size, durationMs });
        } else {
          this.debug('mixed-recorder-stopped-discard', { shouldKeep, chunks: this.activeTurnChunks.length });
        }

        this.activeTurnChunks = [];
        this.mediaRecorder = null;
        this.mixedRecordingStream = null;
        this.recordingAccumulatedMs = 0;
        this.recordingActiveSliceStartedAt = 0;
        this.cleanupRecordingGraph();
        this.cleanupCapturedTeacherStream();
        resolve(blob);
      };

      recorder.stop();
    });
  }

  private cleanupRecordingGraph(): void {
    this.recordingSources = [];
    this.recordingDestination = null;

    if (this.recordingAudioContext) {
      void this.recordingAudioContext.close();
      this.recordingAudioContext = null;
    }
  }

  private cleanupCapturedTeacherStream(): void {
    this.capturedTeacherStream?.getTracks().forEach((track) => track.stop());
    this.capturedTeacherStream = null;
  }

  private async startMicVisualizer(
    stream: MediaStream,
    resetElapsed = true,
  ): Promise<void> {
    this.stopVisualizer(resetElapsed);

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.audioContext = new AudioContextClass();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 128;
    this.analyser.smoothingTimeConstant = 0.68;

    await this.audioContext.resume();
    this.debug('visualizer-started', { audioContextState: this.audioContext.state });

    const source = this.audioContext.createMediaStreamSource(stream);
    source.connect(this.analyser);

    const data = new Uint8Array(this.analyser.frequencyBinCount);

    const animate = () => {
      if (!this.analyser) return;

      this.analyser.getByteTimeDomainData(data);

      let sum = 0;
      for (const value of data) {
        const normalized = (value - 128) / 128;
        sum += normalized * normalized;
      }

      const rms = Math.sqrt(sum / data.length);
      const rawLevel = Math.round(Math.min(100, Math.max(0, (rms - 0.012) * 620)));
      const gatedLevel = rawLevel < this.micNoiseGateLevel ? 0 : rawLevel;
      const nextLevel = gatedLevel === 0
        ? (this.voiceLevel <= 2 ? 0 : Math.round(this.voiceLevel * 0.58))
        : Math.round(this.voiceLevel * this.micLevelSmoothing + gatedLevel * (1 - this.micLevelSmoothing));

      this.voiceLevel = nextLevel < this.micNoiseGateLevel ? 0 : Math.min(100, nextLevel);
      this.hasMicSignal = this.voiceLevel >= this.micNoiseGateLevel;

      if (!this.hasMicSignal) {
        this.voiceBars = this.voiceBars.map((_, index) => this.createSilentBar(index, this.voiceBars.length));
      } else {
        this.voiceBars = this.voiceBars.map((_, index) => {
          const value = Math.abs((data[index % data.length] - 128) / 128);
          const boosted = Math.min(1, value * 3.2 + rms * 2.4 + this.voiceLevel / 320);
          return Math.max(10, Math.min(78, Math.round(boosted * 78)));
        });
      }

      if (this.state === 'student' && this.studentTurnStartedAt > 0) {
        this.studentTurnElapsedSeconds = Math.max(
          0,
          Math.floor(
            (this.studentTurnElapsedBeforePauseMs +
              Date.now() -
              this.studentTurnStartedAt) /
              1000,
          ),
        );
      }

      const now = Date.now();
      this.renderVisualFrame(now);

      if (this.state === 'student' && now - this.lastMicDebugAt > 700) {
        this.lastMicDebugAt = now;
        this.debug('mic-level', { voiceLevel: this.voiceLevel, hasMicSignal: this.hasMicSignal, elapsedSeconds: this.studentTurnElapsedSeconds });
      }

      this.visualizerFrameId = window.requestAnimationFrame(animate);
    };

    animate();
  }

  private stopVisualizer(resetElapsed = true): void {
    if (this.visualizerFrameId !== null) {
      this.debug('visualizer-stop');
      window.cancelAnimationFrame(this.visualizerFrameId);
      this.visualizerFrameId = null;
    }

    this.analyser = null;
    this.hasMicSignal = false;
    this.voiceLevel = 0;
    if (resetElapsed) this.studentTurnElapsedSeconds = 0;

    if (this.audioContext) {
      void this.audioContext.close();
      this.audioContext = null;
    }

    this.voiceBars = Array.from({ length: 42 }, (_, index) => this.createSilentBar(index, 42));
    this.renderView();
  }

  private startTeacherProgress(segment: LessonSegment): void {
    this.stopTeacherProgress();

    const animate = () => {
      const media = this.mediaPlayer?.nativeElement;
      if (!media) return;

      const total = Math.max(segment.end - segment.start, 0.01);
      const current = Math.max(0, Math.min(total, media.currentTime - segment.start));
      this.teacherSegmentProgress = Math.min(100, Math.max(0, Math.round((current / total) * 100)));
      this.renderVisualFrame();

      this.teacherProgressFrameId = window.requestAnimationFrame(animate);
    };

    animate();
  }

  private stopTeacherProgress(): void {
    if (this.teacherProgressFrameId !== null) {
      window.cancelAnimationFrame(this.teacherProgressFrameId);
      this.teacherProgressFrameId = null;
    }
  }

  private async loadRecordings(): Promise<void> {
    if (!this.lesson || !this.studentId) return;

    const elapsed = this.diagnostics.start('StudentShadowing', 'recordings-load', {
      studentId: this.studentId,
      lessonId: this.lesson.id,
      curriculumSlotId: this.curriculumSlotId,
    });

    for (const recording of this.recordings) {
      if (recording.url) URL.revokeObjectURL(recording.url);
    }

    const metas = this.recordingRepository.getByLessonAndStudent(
      this.lesson.id,
      this.studentId,
      this.curriculumSlotId,
      this.activeGroupId,
    );
    const views: RecordingView[] = await Promise.all(
      metas.map(async (meta) => {
        const blob = await this.recordingRepository.getRecordingBlob(meta.id);
        return {
          meta,
          url: blob ? URL.createObjectURL(blob) : null,
        };
      }),
    );

    this.recordings = views;
    this.renderView();
    this.debug('load-recordings', { count: this.recordings.length });
    this.diagnostics.success('StudentShadowing', 'recordings-load', elapsed(), {
      studentId: this.studentId,
      lessonId: this.lesson.id,
      count: this.recordings.length,
    });
  }

  private resolveMediaUrl(rawUrl: string): string {
    const value = rawUrl.trim();
    if (!value || /^https?:\/\//i.test(value) || value.startsWith('blob:')) {
      return value;
    }

    // Production serves /api from the same origin. Local development may point
    // API_BASE_URL directly at http://localhost:5017/api; in that case keep the
    // media request on the backend origin instead of sending it to Angular :4200.
    if (/^https?:\/\//i.test(API_BASE_URL)) {
      const apiOrigin = new URL(API_BASE_URL).origin;
      if (value.startsWith('/')) return `${apiOrigin}${value}`;
      return `${API_BASE_URL.replace(/\/$/, '')}/${value.replace(/^\//, '')}`;
    }

    return value;
  }

  onMediaMetadataLoaded(): void {
    if (this.mediaReady) return;

    this.mediaReady = true;
    const media = this.mediaPlayer?.nativeElement;
    this.diagnostics.success(
      'StudentShadowing',
      'media-metadata-ready',
      Math.round(performance.now() - this.mediaLoadStartedAt),
      {
        lessonId: this.lesson?.id || '',
        durationSeconds: Number.isFinite(media?.duration)
          ? Math.round((media?.duration || 0) * 100) / 100
          : null,
        readyState: media?.readyState ?? null,
      },
    );
    this.renderView();
  }

  onMediaLoadError(): void {
    const media = this.mediaPlayer?.nativeElement;
    this.diagnostics.error(
      'StudentShadowing',
      'media-load:error',
      media?.error || new Error('Media load failed'),
      {
        lessonId: this.lesson?.id || '',
        durationMs: Math.round(performance.now() - this.mediaLoadStartedAt),
        networkState: media?.networkState ?? null,
        readyState: media?.readyState ?? null,
      },
    );
    this.state = 'error';
    this.error = 'ملف الدرس غير موجود أو تعذر تحميله من السيرفر. اطلب من الأدمن إعادة رفع الوسائط.';
    this.renderView();
  }

  private stopTracks(): void {
    this.cleanupRecordingGraph();
    this.cleanupCapturedTeacherStream();
    this.mixedRecordingStream = null;
    if (this.micStream) {
      this.debug('microphone-tracks-stop', { tracks: this.micStream.getAudioTracks().length });
    }

    this.micStream?.getTracks().forEach((track) => track.stop());
    this.micStream = null;
  }

  private clearTimer(): void {
    if (this.activeTimerId !== null) {
      window.clearTimeout(this.activeTimerId);
    }

    this.activeTimerId = null;
    this.activeTimerCallback = null;
    this.activeTimerRemainingMs = 0;
    this.activeTimerStartedAt = 0;
  }

  private accumulateActiveRecordingSlice(): void {
    if (this.recordingActiveSliceStartedAt <= 0) return;
    this.recordingAccumulatedMs += Math.max(
      0,
      Date.now() - this.recordingActiveSliceStartedAt,
    );
    this.recordingActiveSliceStartedAt = 0;
  }

  private scheduleActiveTimer(durationMs: number, callback: () => void): void {
    this.clearTimer();
    this.activeTimerCallback = callback;
    this.activeTimerRemainingMs = Math.max(0, durationMs);
    this.startActiveTimerCountdown();
  }

  private startActiveTimerCountdown(): void {
    if (!this.activeTimerCallback) return;

    if (this.activeTimerRemainingMs <= 0) {
      const callback = this.activeTimerCallback;
      this.clearTimer();
      callback();
      return;
    }

    this.activeTimerStartedAt = Date.now();
    this.activeTimerId = window.setTimeout(() => {
      const callback = this.activeTimerCallback;
      this.clearTimer();
      callback?.();
    }, this.activeTimerRemainingMs);
  }

  private pauseActiveTimer(): void {
    if (!this.activeTimerCallback) return;

    if (this.activeTimerId !== null) {
      window.clearTimeout(this.activeTimerId);
      this.activeTimerId = null;
    }

    if (this.activeTimerStartedAt > 0) {
      this.activeTimerRemainingMs = Math.max(
        0,
        this.activeTimerRemainingMs -
          (Date.now() - this.activeTimerStartedAt),
      );
    }
    this.activeTimerStartedAt = 0;
  }

  private resumeActiveTimer(): void {
    if (!this.activeTimerCallback || this.activeTimerId !== null) return;
    this.startActiveTimerCountdown();
  }

  private getStudentTurnDuration(segment: LessonSegment): number {
    const teacherMs = Math.max((segment.end - segment.start) * 1000, 500);
    const ratioMs = teacherMs * this.studentDurationRatio;
    return Math.max(ratioMs, 1500);
  }

  private getTeacherPlaybackDurationMs(segment: LessonSegment): number {
    const originalDurationMs = Math.max(
      (segment.end - segment.start) * 1000,
      500,
    );
    return originalDurationMs / this.teacherPlaybackRate;
  }

  private applyTeacherPlaybackRate(media: HTMLMediaElement): void {
    media.defaultPlaybackRate = this.teacherPlaybackRate;
    media.playbackRate = this.teacherPlaybackRate;
    media.muted = this.teacherMuted;
  }

  toggleTeacherMute(): void {
    this.teacherMuted = !this.teacherMuted;
    const media = this.mediaPlayer?.nativeElement;
    if (media) media.muted = this.teacherMuted;
    this.renderView();
  }

  copyCurrentSentence(): void {
    const text = this.currentSegment?.text;
    if (!text) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch {}
      ta.remove();
    }

    this.renderView();
  }

  private restorePlayerSettings(): void {
    this.teacherPlaybackRate = this.readStoredNumber(
      this.teacherPlaybackRateStorageKey,
      0.5,
      2.0,
      1,
    );
    this.studentDurationRatio = this.readStoredNumber(
      this.studentDurationRatioStorageKey,
      0.4,
      3.0,
      1.0,
    );
    this.studentDurationOffsetSeconds = this.readStoredNumber(
      this.studentDurationStorageKey,
      0,
      8,
      3.5,
    );
    const storedStudentTurnTimeLimit = localStorage.getItem(
      this.studentTurnTimeLimitStorageKey,
    );
    this.studentTurnTimeLimitEnabled =
      storedStudentTurnTimeLimit === null
        ? true
        : storedStudentTurnTimeLimit === 'true';

    const storedMode = localStorage.getItem(this.audioCaptureModeStorageKey);
    if (storedMode === 'auto' || storedMode === 'headset' || storedMode === 'phone') {
      this.audioCaptureMode = storedMode;
    }
  }

  private readStoredNumber(
    key: string,
    minimum: number,
    maximum: number,
    fallback: number,
  ): number {
    const stored = localStorage.getItem(key);
    if (stored === null || stored.trim() === '') return fallback;
    const value = Number(stored);
    return Number.isFinite(value) && value >= minimum && value <= maximum
      ? value
      : fallback;
  }

  private microphoneConstraintsForMode(
    mode: AudioCaptureMode,
  ): MediaTrackConstraints {
    if (mode === 'headset') {
      return {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      };
    }

    if (mode === 'phone') {
      return {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
        channelCount: 1,
      };
    }

    return {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    };
  }

  private describeMicrophoneSettings(track: MediaStreamTrack): string {
    const settings = track.getSettings?.() || {};
    const deviceName = track.label?.trim() || 'الميكروفون المحدد';
    const processing = [
      settings.echoCancellation ? 'منع الصدى' : '',
      settings.noiseSuppression ? 'تقليل الضوضاء' : '',
      settings.autoGainControl ? 'ضبط الصوت التلقائي' : '',
    ].filter(Boolean);

    return `${deviceName} · ${this.audioCaptureModeLabel}${
      processing.length ? ` · ${processing.join('، ')}` : ''
    }`;
  }

  private stopMicrophoneTest(releaseMicrophone: boolean): void {
    if (this.microphoneTestTimerId !== null) {
      window.clearTimeout(this.microphoneTestTimerId);
      this.microphoneTestTimerId = null;
    }

    this.microphoneTestActive = false;
    this.microphoneTestStarting = false;
    this.stopVisualizer();
    if (releaseMicrophone) this.stopTracks();
    this.renderView();
  }

  private markActiveShadowingStageComplete(): void {
    if (!this.lesson || !this.studentId || !this.activeGroupId || this.teacherPreview) return;

    const slotId = this.resolveCurriculumSlotId();
    if (!slotId) return;

    const lessonView = this.courseFacade.getLesson(this.lesson.id, slotId);
    if (!lessonView) return;
    this.courseFacade.completeStage(lessonView, this.activeStageId);
    this.activeStageCompleted = true;
  }

  private resolveCurriculumSlotId(): string {
    if (this.curriculumSlotId) return this.curriculumSlotId;
    if (!this.lesson || !this.activeGroupId) return '';

    const group = this.groupRepository.getById(this.activeGroupId);
    for (const week of group?.publishedCurriculum.weeks || []) {
      for (const day of week.days) {
        const slot = day.lessonSlots.find(
          (item) => item.lessonId === this.lesson?.id,
        );
        if (slot) return slot.id;
      }
    }

    return '';
  }

  private pickRecordingMimeType(): string {
    const preferredTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    return preferredTypes.find((type) => MediaRecorder.isTypeSupported(type)) || '';
  }

  private createTeacherBar(index: number): number {
    const base = Math.sin(index * 0.65) * 18 + Math.sin(index * 0.19) * 14 + 34;
    return Math.max(7, Math.min(56, Math.round(base * 0.72)));
  }

  private createSilentBar(index: number, total: number): number {
    const center = (total - 1) / 2;
    const distance = Math.abs(index - center) / Math.max(1, center);
    const softLine = Math.round(6 + (1 - distance) * 3);
    return Math.max(6, Math.min(9, softLine));
  }

  private createRestingBar(index: number, total: number): number {
    return this.createSilentBar(index, total);
  }

  formatDurationSeconds(totalSeconds: number): string {
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const seconds = String(Math.floor(totalSeconds % 60)).padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  private createLessonForCurriculumSlot(
    sourceLesson: CourseLesson,
  ): CourseLesson {
    if (!this.curriculumSlotId || !this.studentId) return sourceLesson;

    const student = this.studentRepository.findById(this.studentId);
    const group = student ? this.groupRepository.getById(student.groupId) : null;
    if (!group) return sourceLesson;

    for (const week of group.publishedCurriculum.weeks) {
      for (const day of week.days) {
        const slot = day.lessonSlots.find(
          (item) =>
            item.id === this.curriculumSlotId &&
            item.lessonId === sourceLesson.id,
        );

        if (!slot) continue;

        return {
          ...sourceLesson,
          weekName: week.name,
          dayName: day.name,
          requiredRepetitions: Math.max(1, slot.repetitionCount),
        };
      }
    }

    return sourceLesson;
  }


  private resetToFirstSegment(): void {
    if (!this.lesson || this.lesson.segments.length === 0) return;

    this.currentSegmentIndex = 0;
    this.currentSegment = this.lesson.segments[0];
    this.teacherSegmentProgress = 0;
    this.studentTurnElapsedSeconds = 0;
    this.resetStudentKaraokeState();
  }

  private renderVisualFrame(now = Date.now()): void {
    if (now - this.lastVisualRenderAt < this.visualRenderIntervalMs) return;

    this.lastVisualRenderAt = now;
    // Update karaoke highlight index based on teacher progress when appropriate
    try {
      const words = this.karaokeWords;
      if ((this.state === 'teacher' || this.manualPreviewActive) && words.length > 0) {
        const idx = Math.min(words.length - 1, Math.max(0, Math.floor((this.teacherSegmentProgress / 100) * words.length)));
        this.currentKaraokeIndex = idx;
      } else if (this.state !== 'student') {
        this.currentKaraokeIndex = -1;
      }
    } catch {
      this.currentKaraokeIndex = -1;
    }

    this.renderView();
  }

  private renderView(): void {
    if (this.destroyed) return;

    try {
      this.cdr.detectChanges();
    } catch {
      // Ignore view refresh attempts after the component is destroyed.
    }
  }

  private debug(message: string, data?: unknown): void {
    if (!this.debugPlayer) return;

    if (data === undefined) {
      console.log(`[LessonPlayer TEST] ${message}`);
      return;
    }

    console.log(`[LessonPlayer TEST] ${message}`, data);
  }

  private syncProgressFallback(recording: RecordingMeta, completedBeforeSave: number): void {
    if (recording.countsTowardProgress === false) return;
    const progress = this.progress;
    const alreadySynced = progress?.recordingIds.includes(recording.id) || (progress?.completedRepetitions || 0) > completedBeforeSave;
    if (alreadySynced) return;

    const key = 'english-shadowing-platform-v8';
    const raw = localStorage.getItem(key);
    if (!raw || !this.lesson) return;

    try {
      const store = JSON.parse(raw) as {
        progress?: StudentProgress[];
      };

      if (!Array.isArray(store.progress)) return;

      const index = store.progress.findIndex(
        (item) =>
          item.studentId === recording.studentId &&
          (!recording.groupId || !item.groupId || item.groupId === recording.groupId) &&
          item.lessonId === recording.lessonId &&
          (recording.curriculumSlotId
            ? item.curriculumSlotId === recording.curriculumSlotId
            : !item.curriculumSlotId),
      );
      const now = new Date().toISOString();

      if (index === -1) {
        store.progress.push({
          studentId: recording.studentId,
          groupId: recording.groupId,
          lessonId: recording.lessonId,
          curriculumSlotId: recording.curriculumSlotId,
          completedRepetitions: 1,
          requiredRepetitions: this.lesson.requiredRepetitions,
          recordingIds: [recording.id],
          updatedAt: now,
        });
      } else {
        const row = store.progress[index];
        const recordingIds = Array.from(new Set([...(row.recordingIds || []), recording.id]));
        store.progress[index] = {
          ...row,
          recordingIds,
          completedRepetitions: Math.min(Math.max(row.completedRepetitions || 0, completedBeforeSave) + 1, row.requiredRepetitions || this.lesson.requiredRepetitions),
          requiredRepetitions: row.requiredRepetitions || this.lesson.requiredRepetitions,
          updatedAt: now,
        };
      }

      localStorage.setItem(key, JSON.stringify(store));
    } catch {
      // Keep the recording even if the fallback progress sync fails.
    }
  }

  private async syncProgressToBackend(): Promise<void> {
    if (!this.lesson || !this.studentId) return;

    const student = this.studentRepository.findById(this.studentId);
    const group = student ? this.groupRepository.getById(student.groupId) : null;
    const progress = this.studentRepository.getProgress(
      this.studentId,
      this.lesson.id,
      this.curriculumSlotId,
      this.activeGroupId,
    );

    if (!student || !group || !progress) return;

    let curriculumSlotId =
      this.curriculumSlotId || progress.curriculumSlotId || '';

    if (!curriculumSlotId) {
      for (const week of group.publishedCurriculum.weeks) {
        for (const day of week.days) {
          const slot = day.lessonSlots.find((item) => item.lessonId === this.lesson?.id);
          if (slot) {
            curriculumSlotId = slot.id;
            break;
          }
        }

        if (curriculumSlotId) break;
      }
    }

    curriculumSlotId ||= `demo-slot-${this.lesson.id}`;

    try {
      const remoteRow = await firstValueFrom(
        this.progressApi
          .saveStudentProgress({
            studentId: student.id,
            studentName: student.name,
            groupId: group.id,
            groupName: group.name,
            curriculumSlotId,
            lessonId: this.lesson.id,
            lessonTitle: this.lesson.title,
            completedRepetitions: progress.completedRepetitions,
            requiredRepetitions: progress.requiredRepetitions,
            recordingCount: Math.max(
              progress.recordingCount || 0,
              progress.recordingIds.length,
            ),
          })
          .pipe(timeout(5000)),
      );

      this.studentRepository.applyRemoteProgress([remoteRow]);
      this.debug('progress-synced-to-api', remoteRow);
    } catch (error) {
      console.warn('[Progress API] Progress remains saved locally and will be retried later.', error);
    }
  }

  private async deleteRecordingFallback(recordingId: string): Promise<void> {
    const key = 'english-shadowing-platform-v8';
    const raw = localStorage.getItem(key);

    if (raw) {
      try {
        const store = JSON.parse(raw) as {
          recordings?: RecordingMeta[];
          progress?: StudentProgress[];
        };

        if (Array.isArray(store.recordings)) {
          store.recordings = store.recordings.filter((item) => item.id !== recordingId);
        }

        if (Array.isArray(store.progress)) {
          store.progress = store.progress.map((item) => {
            if (!item.recordingIds?.includes(recordingId)) return item;

            const recordingIds = item.recordingIds.filter((id) => id !== recordingId);
            return {
              ...item,
              recordingIds,
              completedRepetitions: Math.min(recordingIds.length, item.requiredRepetitions || recordingIds.length),
              updatedAt: new Date().toISOString(),
            };
          });
        }

        localStorage.setItem(key, JSON.stringify(store));
      } catch {
        // Ignore local fallback errors.
      }
    }

    await this.deleteRecordingBlobFallback(recordingId);
  }

  private deleteRecordingBlobFallback(recordingId: string): Promise<void> {
    return new Promise((resolve) => {
      const request = indexedDB.open('english-shadowing-platform-db-v1');

      request.onerror = () => resolve();
      request.onsuccess = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains('files')) {
          db.close();
          resolve();
          return;
        }

        const transaction = db.transaction('files', 'readwrite');
        const store = transaction.objectStore('files');

        try {
          store.delete(recordingId);
          store.delete(`recording-${recordingId}`);
        } catch {
          // Ignore IndexedDB fallback errors.
        }

        transaction.oncomplete = () => {
          db.close();
          resolve();
        };

        transaction.onerror = () => {
          db.close();
          resolve();
        };
      };
    });
  }
}
