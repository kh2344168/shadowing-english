import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../../core/auth/services/auth.service';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.esm.js';
import { LessonRepository } from '../../data-access/lesson.repository';
import {
  CourseLesson,
  LessonActivity,
  LessonActivityType,
  LessonContentType,
  LessonSegment,
  LessonVocabularyItem,
} from '../../data-access/lesson.models';
import {
  LocalAiProgress,
  LocalWhisperAlignmentService,
} from '../../services/local-whisper-alignment.service';
import { ScriptLineAlignment } from '../../services/script-alignment.util';

type AppView = 'teacher-dashboard' | 'lesson-builder' | 'student-dashboard' | 'student-player' | 'teacher-progress';
type PauseMode = 'same' | 'plus2' | 'plus5' | 'custom';
type TrainingState = 'empty' | 'ready' | 'teacher' | 'student' | 'finished' | 'stopped';
type RecordingMode = 'per-repetition' | 'one-session';
type ProgressStatus = 'not-started' | 'in-progress' | 'completed';

interface StudentAccount {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

interface StudentProgress {
  studentId: string;
  lessonId: string;
  completedRepetitions: number;
  requiredRepetitions: number;
  recordingIds: string[];
  updatedAt: string;
}

interface RecordingMeta {
  id: string;
  studentId: string;
  lessonId: string;
  repetitionFrom: number;
  repetitionTo: number;
  mode: RecordingMode;
  durationLabel: string;
  createdAt: string;
}

interface FullRecording {
  url: string;
  durationLabel: string;
  createdAt: string;
}

interface AppStoreData {
  lessons: CourseLesson[];
  students: StudentAccount[];
  progress: StudentProgress[];
  recordings: RecordingMeta[];
}

interface BuilderDraftData {
  editingLessonId: string | null;
  lessonTitle: string;
  lessonContentType: LessonContentType;
  lessonTopic: string;
  lessonLearningObjective: string;
  lessonTeacherNotes: string;
  weekName: string;
  dayName: string;
  requiredRepetitions: number;
  currentMediaFileName: string;
  currentMediaType: string;
  segments: LessonSegment[];
  vocabulary: LessonVocabularyItem[];
  activities: LessonActivity[];
  scriptLines: string[];
  selectedScriptIndex: number;
  scriptFileName: string;
  segmentText: string;
  segmentTranslation: string;
  segmentStart: number | null;
  segmentEnd: number | null;
  savedAt: string;
}

@Component({
  selector: 'app-lesson-builder-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './lesson-builder.page.html',
  styleUrl: './lesson-builder.page.scss',
})
export class LessonBuilderPage implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('lessonPlayer') lessonPlayer?: ElementRef<HTMLVideoElement>;
  @ViewChild('waveScroll') waveScroll?: ElementRef<HTMLDivElement>;
  @ViewChild('waveformContainer') waveformContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('timelineContainer') timelineContainer?: ElementRef<HTMLDivElement>;

  view: AppView = 'lesson-builder';

  lessons: CourseLesson[] = [];
  students: StudentAccount[] = [];
  progressItems: StudentProgress[] = [];
  recordings: RecordingMeta[] = [];

  hasBuilderDraft = false;
  builderDraftSavedLabel = '';
  lessonSavedMessage = '';
  isSavingBuilderDraft = false;

  selectedStudentId = '';
  selectedLessonId: string | null = null;
  selectedProgressLessonId: string | null = null;

  newStudentName = '';
  newStudentEmail = '';

  lessonTitle = 'Lesson 1';
  lessonContentType: LessonContentType = 'auto';
  lessonTopic = '';
  lessonLearningObjective = '';
  lessonTeacherNotes = '';
  weekName = '';
  dayName = '';
  requiredRepetitions = 10;

  videoUrl: string | null = null;
  private currentMediaBlob: Blob | null = null;
  currentMediaFileName = '';
  private currentMediaType = '';

  segments: LessonSegment[] = [];
  vocabulary: LessonVocabularyItem[] = [];
  activities: LessonActivity[] = [this.createLessonActivity('shadowing')];
  scriptLines: string[] = [];
  selectedScriptIndex = 0;
  scriptFileName = '';
  scriptError = '';

  segmentText = '';
  segmentTranslation = '';
  segmentStart: number | null = null;
  segmentEnd: number | null = null;

  pauseMode: PauseMode = 'same';
  customRepeatSeconds = 3;
  teacherSpeed = 1;
  recordingMode: RecordingMode = 'per-repetition';
  sessionTargetRepetitions = 1;

  trainingState: TrainingState = 'empty';
  currentIndex = 0;
  currentSegment: LessonSegment | null = null;
  currentRepetitionNumber = 0;
  sessionCompletedRepetitions = 0;

  fullRecording: FullRecording | null = null;
  lastStudentRecordings: Array<RecordingMeta & { url?: string }> = [];

  isRecorderRunning = false;
  isTeacherAudioRecording = false;
  isStudentMicLive = false;
  microphoneError = '';
  voiceBars: number[] = Array.from({ length: 28 }, () => 8);

  isWaveformLoading = false;
  isWaveformReady = false;
  waveformError = '';

  isAutoSplitting = false;
  autoSplitMessage = '';
  autoSplitError = '';
  autoSplitPercent: number | null = null;
  autoSplitDevice: 'webgpu' | 'wasm' | null = null;
  autoSplitElapsedSeconds = 0;
  autoSplitTranscript = '';
  autoSplitStartPaddingSeconds = 1;
  autoAlignmentResults: ScriptLineAlignment[] = [];

  lessonCurrentTime = 0;
  lessonDuration = 0;
  isLessonPlaying = false;

  waveZoom = 12;
  minWaveZoom = 2;
  maxWaveZoom = 650;
  defaultWaveZoom = 12;

  private readonly storageKey = 'english-shadowing-platform-v8';
  private readonly builderDraftKey = 'english-shadowing-platform-v8-builder-draft';
  private readonly builderDraftMediaKey = 'lesson-builder-draft-media';
  private readonly dbName = 'english-shadowing-platform-db-v1';
  private readonly dbStoreName = 'files';

  editingLessonId: string | null = null;
  private shouldContinueTraining = false;
  private stopAfterCurrentRepetition = false;
  private activeTimeoutId: number | null = null;
  private selectionPreviewTimeoutId: number | null = null;
  private visualizerFrameId: number | null = null;
  private waveformVideoSyncFrameId: number | null = null;

  private wavesurfer: WaveSurfer | null = null;
  private regionsPlugin: any = null;
  private activeRegion: any = null;
  private disableRegionDragSelection: (() => void) | null = null;
  private waveformSubscriptions: Array<() => void> = [];

  private audioContext: AudioContext | null = null;
  private microphoneStream: MediaStream | null = null;
  private microphoneGain: GainNode | null = null;
  private teacherGain: GainNode | null = null;
  private lessonAudioSource: MediaElementAudioSourceNode | null = null;
  private recorderDestination: MediaStreamAudioDestinationNode | null = null;
  private analyser: AnalyserNode | null = null;
  private frequencyData: Uint8Array<ArrayBuffer> | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private recordingStartedAt = 0;
  private recordingMimeType = '';
  private pendingRecordingContext: { from: number; to: number; mode: RecordingMode } | null = null;

  constructor(
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router,
    private lessonRepository: LessonRepository,
    private localWhisperAlignment: LocalWhisperAlignmentService,
    public auth: AuthService,
  ) {}

  get contentBasePath(): '/admin' | '/teacher' {
    return this.auth.isTeacher() ? '/teacher' : '/admin';
  }

  ngOnInit(): void {
    this.loadStore();
    this.ensureDemoStudents();
    this.selectedStudentId = this.students[0]?.id || '';
    this.checkBuilderDraftStatus();

    const lessonId = this.route.snapshot.queryParamMap.get('lessonId') || '';
    const lessonToEdit = this.lessons.find((lesson) => lesson.id === lessonId);

    if (lessonToEdit) {
      void this.editLesson(lessonToEdit);
      return;
    }

    void this.restoreBuilderDraftAfterRefresh();
  }

  ngAfterViewInit(): void {
    // The waveform is initialized only after a lesson file exists.
  }

  get currentLesson(): CourseLesson | null {
    if (!this.selectedLessonId) return null;
    return this.lessons.find((lesson) => lesson.id === this.selectedLessonId) || null;
  }

  get progressLesson(): CourseLesson | null {
    if (!this.selectedProgressLessonId) return null;
    return this.lessons.find((lesson) => lesson.id === this.selectedProgressLessonId) || null;
  }

  get currentDraftSentence(): string {
    return (this.segmentText || this.currentScriptText || '').trim();
  }

  get hasScript(): boolean {
    return this.scriptLines.length > 0;
  }

  get currentScriptText(): string {
    return this.scriptLines[this.selectedScriptIndex] || '';
  }

  get isScriptFinished(): boolean {
    return this.hasScript && this.selectedScriptIndex >= this.scriptLines.length;
  }

  get scriptProgressLabel(): string {
    if (!this.hasScript) return 'No script loaded';
    if (this.isScriptFinished) return `${this.scriptLines.length} / ${this.scriptLines.length} completed`;
    return `${this.selectedScriptIndex + 1} / ${this.scriptLines.length}`;
  }

  get hasActiveSelection(): boolean {
    return this.segmentStart !== null && this.segmentEnd !== null && this.segmentEnd > this.segmentStart;
  }

  get canAddSegment(): boolean {
    return !!this.currentDraftSentence && this.hasActiveSelection;
  }

  get canSaveLesson(): boolean {
    return !!this.lessonTitle.trim() && this.requiredRepetitions > 0 && this.segments.length > 0 && !!this.currentMediaBlob;
  }

  get missingTranslationCount(): number {
    return this.segments.filter((segment) => !segment.translation?.trim()).length;
  }

  get visibleVocabularyCount(): number {
    return this.vocabulary.filter(
      (item) => item.term.trim() && item.includeForStudent !== false,
    ).length;
  }

  get vocabularyImagesNeedingReviewCount(): number {
    return this.vocabulary.filter(
      (item) =>
        item.includeForStudent !== false &&
        !!item.imageUrl?.trim() &&
        !item.imageApproved,
    ).length;
  }

  get primaryShadowingActivityId(): string {
    return (
      this.activities.find((activity) => activity.type === 'shadowing')?.id ||
      'shadowing'
    );
  }

  get canAutoSplit(): boolean {
    return !!this.currentMediaBlob && this.scriptLines.length > 0 && !this.isAutoSplitting;
  }

  get autoSplitReviewCount(): number {
    return this.autoAlignmentResults.filter((item) => item.status === 'review').length;
  }

  get autoSplitMatchedCount(): number {
    return this.autoAlignmentResults.filter((item) => item.status === 'matched').length;
  }

  get waveZoomLabel(): string {
    return `${Math.round((this.waveZoom / Math.max(this.defaultWaveZoom, 1)) * 100)}%`;
  }

  get waveContentWidth(): number {
    const duration = this.lessonDuration || this.wavesurfer?.getDuration() || this.lessonPlayer?.nativeElement?.duration || 0;
    const visibleWidth = this.waveScroll?.nativeElement?.clientWidth || this.waveformContainer?.nativeElement?.clientWidth || 900;
    if (!Number.isFinite(duration) || duration <= 0) return visibleWidth;
    return Math.max(visibleWidth, Math.ceil(duration * this.waveZoom));
  }

  get selectionStartPx(): number {
    if (!this.hasActiveSelection) return 0;
    const duration = this.safeDuration();
    return Math.max(0, Math.min(this.waveContentWidth, (this.segmentStart! / duration) * this.waveContentWidth));
  }

  get selectionEndPx(): number {
    if (!this.hasActiveSelection) return 0;
    const duration = this.safeDuration();
    return Math.max(0, Math.min(this.waveContentWidth, (this.segmentEnd! / duration) * this.waveContentWidth));
  }

  get selectionCenterPx(): number {
    return (this.selectionStartPx + this.selectionEndPx) / 2;
  }

  get teacherDashboardStats(): { totalLessons: number; totalStudents: number; completed: number; inProgress: number; notStarted: number } {
    let completed = 0;
    let inProgress = 0;
    let notStarted = 0;

    for (const lesson of this.lessons) {
      for (const student of this.students) {
        const progress = this.getProgress(student.id, lesson.id);
        const status = this.getProgressStatus(progress);
        if (status === 'completed') completed++;
        if (status === 'in-progress') inProgress++;
        if (status === 'not-started') notStarted++;
      }
    }

    return {
      totalLessons: this.lessons.length,
      totalStudents: this.students.length,
      completed,
      inProgress,
      notStarted,
    };
  }

  get remainingRepetitions(): number {
    const lesson = this.currentLesson;
    if (!lesson || !this.selectedStudentId) return 0;
    const progress = this.getProgress(this.selectedStudentId, lesson.id);
    return Math.max((progress?.requiredRepetitions || lesson.requiredRepetitions) - (progress?.completedRepetitions || 0), 0);
  }

  get currentStudentProgressLabel(): string {
    const lesson = this.currentLesson;
    if (!lesson || !this.selectedStudentId) return '0 / 0';
    const progress = this.getProgress(this.selectedStudentId, lesson.id);
    return `${progress?.completedRepetitions || 0} / ${lesson.requiredRepetitions}`;
  }

  get maxSessionTarget(): number {
    return Math.max(this.remainingRepetitions, 1);
  }

  get selectedStudent(): StudentAccount | null {
    return this.students.find((student) => student.id === this.selectedStudentId) || null;
  }

  goToTeacherDashboard(): void {
    this.stopAllPlaybackAndRecording(false);
    this.view = 'teacher-dashboard';
    this.selectedLessonId = null;
  }

  goToStudentDashboard(): void {
    this.stopAllPlaybackAndRecording(false);
    this.view = 'student-dashboard';
    this.selectedLessonId = null;
  }

  startNewLesson(): void {
    this.lessonSavedMessage = '';
    if (this.hasBuilderDraft && this.view !== 'lesson-builder') {
      const shouldDiscard = confirm('There is an unfinished lesson draft saved in this browser. Start a new empty lesson and discard the draft?');
      if (!shouldDiscard) {
        void this.restoreBuilderDraftFromSavedData();
        return;
      }
      void this.clearBuilderDraft(false);
    }

    this.stopAllPlaybackAndRecording(false);
    this.editingLessonId = null;
    this.selectedLessonId = null;
    this.lessonTitle = `Lesson ${this.lessons.length + 1}`;
    this.lessonContentType = 'auto';
    this.lessonTopic = '';
    this.lessonLearningObjective = '';
    this.lessonTeacherNotes = '';
    this.weekName = '';
    this.dayName = '';
    this.requiredRepetitions = 10;
    this.currentMediaBlob = null;
    this.currentMediaFileName = '';
    this.currentMediaType = '';
    this.clearMediaUrl();
    this.destroyWaveform();
    this.segments = [];
    this.vocabulary = [];
    this.activities = [this.createLessonActivity('shadowing')];
    this.scriptLines = [];
    this.selectedScriptIndex = 0;
    this.scriptFileName = '';
    this.scriptError = '';
    this.resetAutoSplitState();
    this.segmentText = '';
    this.segmentStart = null;
    this.segmentEnd = null;
    this.currentSegment = null;
    this.trainingState = 'empty';
    this.view = 'lesson-builder';
    void this.saveBuilderDraft();
  }

  async editLesson(lesson: CourseLesson): Promise<void> {
    this.stopAllPlaybackAndRecording(false);
    this.editingLessonId = lesson.id;
    this.selectedLessonId = lesson.id;
    this.lessonTitle = lesson.title;
    this.lessonContentType = lesson.contentProfile?.type || 'auto';
    this.lessonTopic = lesson.contentProfile?.topic || '';
    this.lessonLearningObjective =
      lesson.contentProfile?.learningObjective || '';
    this.lessonTeacherNotes = lesson.contentProfile?.teacherNotes || '';
    this.weekName = lesson.weekName || '';
    this.dayName = lesson.dayName || '';
    this.requiredRepetitions = lesson.requiredRepetitions;
    this.segments = lesson.segments.map((segment) => ({ ...segment }));
    this.vocabulary = (lesson.vocabulary || []).map((item) => ({ ...item }));
    this.activities = this.normalizeActivities(lesson.activities);
    this.scriptLines = [...lesson.scriptLines];
    this.selectedScriptIndex = Math.min(this.segments.length, this.scriptLines.length);
    this.segmentText = this.currentScriptText || '';
    this.currentSegment = this.segments[0] || null;
    this.segmentStart = null;
    this.segmentEnd = null;
    this.currentMediaFileName = lesson.mediaFileName;
    this.currentMediaType = lesson.mediaType;
    this.resetAutoSplitState();
    this.currentMediaBlob = await this.lessonRepository.getMediaBlob(lesson.id);

    if (!this.currentMediaBlob) {
      alert('The lesson data exists, but the audio file was not found in this browser. Upload the lesson file again, then save.');
      this.clearMediaUrl();
    } else {
      this.setMediaUrlFromBlob(this.currentMediaBlob);
    }

    this.view = 'lesson-builder';
    this.cdr.detectChanges();
    window.setTimeout(() => this.initWaveform(), 0);
    void this.saveBuilderDraft(true);
  }

  async previewAsStudent(lesson: CourseLesson): Promise<void> {
    await this.openStudentLesson(lesson);
  }

  openProgress(lesson: CourseLesson): void {
    this.stopAllPlaybackAndRecording(false);
    this.selectedProgressLessonId = lesson.id;
    this.view = 'teacher-progress';
  }

  async openStudentLesson(lesson: CourseLesson): Promise<void> {
    this.stopAllPlaybackAndRecording(false);
    this.selectedLessonId = lesson.id;
    this.lessonTitle = lesson.title;
    this.weekName = lesson.weekName || '';
    this.dayName = lesson.dayName || '';
    this.requiredRepetitions = lesson.requiredRepetitions;
    this.segments = lesson.segments.map((segment) => ({ ...segment }));
    this.currentSegment = this.segments[0] || null;
    this.currentIndex = 0;
    this.trainingState = 'ready';
    this.currentRepetitionNumber = 0;
    this.sessionCompletedRepetitions = 0;
    this.revokeStudentRecordingUrls();
    this.teacherSpeed = 1;
    this.pauseMode = 'same';
    this.recordingMode = 'per-repetition';
    this.sessionTargetRepetitions = Math.min(1, this.maxSessionTarget);
    this.currentMediaFileName = lesson.mediaFileName;
    this.currentMediaType = lesson.mediaType;
    this.currentMediaBlob = await this.lessonRepository.getMediaBlob(lesson.id);

    if (!this.currentMediaBlob) {
      alert('The lesson audio was not found in this browser. Open the lesson as teacher and upload/save the audio again.');
      return;
    }

    this.setMediaUrlFromBlob(this.currentMediaBlob);
    this.view = 'student-player';
    await this.loadStudentRecordingsForLesson(this.selectedStudentId, lesson.id);
    this.cdr.detectChanges();
  }

  async onMediaSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.stopAllPlaybackAndRecording(false);
    this.destroyWaveform();
    this.currentMediaBlob = file;
    this.currentMediaFileName = file.name;
    this.currentMediaType = file.type || 'application/octet-stream';
    this.resetAutoSplitState();
    this.setMediaUrlFromBlob(file);
    this.trainingState = 'ready';
    this.segmentStart = null;
    this.segmentEnd = null;
    this.lessonDuration = 0;
    this.lessonCurrentTime = 0;
    this.cdr.detectChanges();
    window.setTimeout(() => this.initWaveform(), 0);
    void this.saveBuilderDraft(true);
    input.value = '';
  }

  async onScriptSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const lines = this.parseScriptContent(content, file.name);
      if (lines.length === 0) {
        this.scriptError = 'No sentences found. Use one sentence per line in a TXT file, or a JSON array with text values.';
        return;
      }

      this.resetAutoSplitState();
      this.scriptLines = lines;
      this.selectedScriptIndex = Math.min(this.segments.length, this.scriptLines.length - 1);
      this.scriptFileName = file.name;
      this.scriptError = '';
      this.segmentText = this.currentScriptText;
      void this.saveBuilderDraft();
    } catch (error) {
      console.error(error);
      this.scriptError = 'Could not read this script file. Try a plain TXT file.';
    } finally {
      input.value = '';
    }
  }

  previousScriptSentence(): void {
    if (!this.hasScript) return;
    this.selectedScriptIndex = Math.max(0, this.selectedScriptIndex - 1);
    this.segmentText = this.currentScriptText;
    void this.saveBuilderDraft();
  }

  nextScriptSentence(): void {
    if (!this.hasScript) return;
    this.selectedScriptIndex = Math.min(this.scriptLines.length - 1, this.selectedScriptIndex + 1);
    this.segmentText = this.currentScriptText;
    void this.saveBuilderDraft();
  }

  useCurrentScriptSentence(): void {
    this.segmentText = this.currentScriptText;
    void this.saveBuilderDraft();
  }

  clearScript(): void {
    if (!confirm('Remove the uploaded script from this lesson draft?')) return;
    this.scriptLines = [];
    this.selectedScriptIndex = 0;
    this.scriptFileName = '';
    this.scriptError = '';
    this.resetAutoSplitState();
    this.segmentText = '';
    void this.saveBuilderDraft();
  }

  async splitScriptAutomatically(): Promise<void> {
    if (!this.currentMediaBlob || this.scriptLines.length === 0) {
      this.autoSplitError = 'Upload the lesson media and script first.';
      return;
    }

    if (this.segments.length > 0) {
      const shouldReplace = confirm(
        `Automatic splitting will replace the current ${this.segments.length} segment(s). Continue?`,
      );
      if (!shouldReplace) return;
    }

    this.stopLessonPlayback();
    this.isAutoSplitting = true;
    this.autoSplitError = '';
    this.autoSplitMessage = 'Preparing the lesson for local AI...';
    this.autoSplitPercent = null;
    this.autoSplitDevice = null;
    this.autoSplitElapsedSeconds = 0;
    this.autoSplitTranscript = '';
    this.autoAlignmentResults = [];

    try {
      const result = await this.localWhisperAlignment.align(
        this.currentMediaBlob,
        this.scriptLines,
        this.lessonDuration,
        (progress) => this.onAutoSplitProgress(progress),
        {
          startPaddingSeconds: this.autoSplitStartPaddingSeconds,
          endPaddingSeconds: 0.18,
          preserveStartPaddingOverlap: true,
        },
      );

      this.autoAlignmentResults = result.lines;
      this.autoSplitTranscript = result.transcript;
      this.autoSplitDevice = result.device;
      this.autoSplitElapsedSeconds = Math.round((result.elapsedMs / 1000) * 10) / 10;
      this.autoSplitMessage = `Automatic splitting finished. Every segment starts ${this.autoSplitStartPaddingSeconds}s before the first detected word.`;
      this.segments = result.lines.map((line) => ({
        text: line.text,
        translation: '',
        start: line.start,
        end: line.end,
      }));
      this.currentSegment = this.segments[0] || null;
      this.selectedScriptIndex = this.scriptLines.length;
      this.segmentText = '';
      this.segmentTranslation = '';

      if (this.segments[0]) {
        this.segmentStart = this.segments[0].start;
        this.segmentEnd = this.segments[0].end;
        this.createOrReplaceActiveRegion(this.segments[0].start, this.segments[0].end);
        this.seekLessonTo(this.segments[0].start);
      }

      await this.saveBuilderDraft();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Automatic splitting failed.';

      if (message === 'Automatic splitting was cancelled.') {
        this.autoSplitMessage = message;
        this.autoSplitError = '';
      } else {
        console.error('[Local Whisper] Automatic splitting failed.', error);
        this.autoSplitError = message;
        this.autoSplitMessage = '';
      }
    } finally {
      this.isAutoSplitting = false;
      this.cdr.detectChanges();
    }
  }

  cancelAutomaticSplitting(): void {
    if (!this.isAutoSplitting) return;
    this.localWhisperAlignment.cancel();
    this.isAutoSplitting = false;
    this.autoSplitMessage = 'Automatic splitting cancelled.';
  }

  reviewAutoAlignedSegment(index: number): void {
    const segment = this.segments[index];
    if (!segment) return;
    this.selectSegmentForEdit(segment);
  }

  getAutoAlignmentForSegment(segment: LessonSegment): ScriptLineAlignment | null {
    return (
      this.autoAlignmentResults.find(
        (result) =>
          result.text === segment.text &&
          Math.abs(result.start - segment.start) < 0.4,
      ) || null
    );
  }

  confidencePercent(value: number): number {
    return Math.round(Math.max(0, Math.min(1, value)) * 100);
  }

  addSegment(): void {
    if (this.activeRegion) this.applyRegionToForm(this.activeRegion, false);

    const sentenceText = this.currentDraftSentence;
    if (!sentenceText) {
      alert('Upload a script or write the sentence text first.');
      return;
    }

    if (!this.hasActiveSelection) {
      alert('Select sentence start and end first.');
      return;
    }

    const start = this.segmentStart!;
    const end = this.segmentEnd!;
    const previousDuration = Math.max(end - start, 1);

    this.segments.push({
      text: sentenceText,
      translation: this.segmentTranslation.trim(),
      start,
      end,
    });
    this.segments.sort((a, b) => a.start - b.start);
    this.currentSegment = this.segments[0] || null;
    this.segmentTranslation = '';

    this.moveToNextScriptSentenceAfterAdd();
    this.createNextSelectionAfterAdd(end, previousDuration);
    void this.saveBuilderDraft();
  }

  deleteSegment(index: number): void {
    this.segments.splice(index, 1);
    this.currentSegment = this.segments[0] || null;
    void this.saveBuilderDraft();
  }

  selectSegmentForEdit(segment: LessonSegment): void {
    this.segmentText = segment.text;
    this.segmentTranslation = segment.translation || '';
    this.segmentStart = segment.start;
    this.segmentEnd = segment.end;
    this.currentSegment = segment;
    this.createOrReplaceActiveRegion(segment.start, segment.end);
    this.seekLessonTo(segment.start);
  }

  replaceSelectedSegment(): void {
    if (!this.currentSegment) {
      alert('Select a segment from the list first.');
      return;
    }

    if (!this.canAddSegment) {
      alert('Write text and select valid start/end first.');
      return;
    }

    this.currentSegment.text = this.currentDraftSentence;
    this.currentSegment.translation = this.segmentTranslation.trim();
    this.currentSegment.start = this.segmentStart!;
    this.currentSegment.end = this.segmentEnd!;
    this.segments.sort((a, b) => a.start - b.start);
    this.currentSegment = null;
    this.segmentText = this.currentScriptText || '';
    this.segmentTranslation = '';
    void this.saveBuilderDraft();
  }

  onBuilderFieldChanged(): void {
    void this.saveBuilderDraft();
  }

  hasActivityType(type: LessonActivityType): boolean {
    return this.activities.some((activity) => activity.type === type && activity.enabled);
  }

  canAddActivity(type: LessonActivityType): boolean {
    return type === 'shadowing-review' || !this.hasActivityType(type);
  }

  addActivity(type: LessonActivityType): void {
    if (!this.canAddActivity(type)) return;
    this.activities = [
      ...this.activities,
      this.createLessonActivity(type),
    ].map((activity, order) => ({ ...activity, order }));
    void this.saveBuilderDraft();
  }

  removeActivity(index: number): void {
    const activity = this.activities[index];
    if (!activity || activity.type === 'shadowing') return;
    this.activities = this.activities
      .filter((_, activityIndex) => activityIndex !== index)
      .map((item, order) => ({ ...item, order }));
    void this.saveBuilderDraft();
  }

  moveActivity(index: number, direction: -1 | 1): void {
    const targetIndex = index + direction;
    if (index <= 0 || targetIndex <= 0 || targetIndex >= this.activities.length) return;
    const next = [...this.activities];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    this.activities = next.map((activity, order) => ({ ...activity, order }));
    void this.saveBuilderDraft();
  }

  activityTypeLabel(type: LessonActivityType): string {
    return {
      shadowing: 'شادوينج أساسي',
      vocabulary: 'كلمات وصور',
      'shadowing-review': 'شادوينج مرة ثانية',
      'listen-write': 'اسمع واكتب',
      quiz: 'اختبار الدرس',
      'ai-conversation': 'محادثة بالذكاء الاصطناعي',
    }[type];
  }

  getVocabularyHistory(item: LessonVocabularyItem): string[] {
    const term = this.normalizeVocabularyTerm(item.term);
    if (!term) return [];

    return this.lessons
      .filter((lesson) => lesson.id !== this.editingLessonId)
      .filter((lesson) => {
        const existsInBank = (lesson.vocabulary || []).some(
          (entry) => this.normalizeVocabularyTerm(entry.term) === term,
        );
        if (existsInBank) return true;

        return lesson.segments.some((segment) => {
          const text = this.normalizeVocabularyTerm(segment.text);
          return term.includes(' ')
            ? text.includes(term)
            : text.split(' ').includes(term);
        });
      })
      .map((lesson) => lesson.title);
  }

  setVocabularyVisibility(item: LessonVocabularyItem, visible: boolean): void {
    item.includeForStudent = visible;
    void this.saveBuilderDraft();
  }

  keepVocabularyForReview(item: LessonVocabularyItem): void {
    item.includeForStudent = true;
    item.repeatForReview = !item.repeatForReview;
    void this.saveBuilderDraft();
  }

  toggleVocabularyFutureTest(item: LessonVocabularyItem): void {
    item.testLater = !item.testLater;
    void this.saveBuilderDraft();
  }

  approveVocabularyImage(item: LessonVocabularyItem): void {
    if (!item.imageUrl?.trim()) return;
    item.imageApproved = true;
    void this.saveBuilderDraft();
  }

  removeVocabularyImage(item: LessonVocabularyItem): void {
    item.imageUrl = '';
    item.imageApproved = false;
    void this.saveBuilderDraft();
  }

  searchVocabularyImage(item: LessonVocabularyItem): void {
    const query = encodeURIComponent(`${item.term.trim()} real context photo`);
    if (!query) return;
    window.open(`https://www.google.com/search?tbm=isch&q=${query}`, '_blank', 'noopener,noreferrer');
  }

  suggestVocabularyFromSegments(): void {
    if (this.segments.length === 0) {
      alert('قسّم الدرس إلى جمل أولًا، ثم جهّز الكلمات.');
      return;
    }

    if (
      this.vocabulary.length > 0 &&
      !confirm('استبدال قائمة الكلمات الحالية باقتراح جديد من جمل الدرس؟')
    ) {
      return;
    }

    const stopWords = new Set([
      'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'do', 'for',
      'from', 'had', 'has', 'have', 'he', 'her', 'him', 'his', 'i', 'in',
      'is', 'it', 'its', 'me', 'my', 'of', 'on', 'or', 'our', 'she', 'so',
      'that', 'the', 'their', 'them', 'they', 'this', 'to', 'was', 'we',
      'were', 'will', 'with', 'you', 'your',
    ]);
    const candidates = new Map<string, LessonVocabularyItem>();

    for (const segment of this.segments) {
      const words = segment.text.match(/[A-Za-z][A-Za-z'-]*/g) || [];
      for (const rawWord of words) {
        const term = rawWord.toLowerCase();
        if (term.length < 3 || stopWords.has(term) || candidates.has(term)) continue;
        const previous = this.findVocabularyBankItem(term);
        candidates.set(term, {
          term,
          translation: previous?.translation || '',
          example: segment.text.trim(),
          imageUrl: previous?.imageUrl || '',
          imageApproved: Boolean(previous?.imageUrl && previous.imageApproved),
          includeForStudent: true,
          repeatForReview: false,
          testLater: false,
        });
      }
    }

    this.vocabulary = Array.from(candidates.values()).slice(0, 30);
    void this.saveBuilderDraft();
  }

  addVocabularyItem(): void {
    this.vocabulary = [
      ...this.vocabulary,
      {
        term: '',
        translation: '',
        example: '',
        imageUrl: '',
        imageApproved: false,
        includeForStudent: true,
        repeatForReview: false,
        testLater: false,
      },
    ];
    void this.saveBuilderDraft();
  }

  removeVocabularyItem(index: number): void {
    this.vocabulary = this.vocabulary.filter((_, itemIndex) => itemIndex !== index);
    void this.saveBuilderDraft();
  }

  onVocabularyImageChanged(item: LessonVocabularyItem): void {
    if (!item.imageUrl?.trim()) item.imageApproved = false;
    else item.imageApproved = false;
    void this.saveBuilderDraft();
  }

  private findVocabularyBankItem(term: string): LessonVocabularyItem | null {
    const normalized = this.normalizeVocabularyTerm(term);
    for (const lesson of this.lessons) {
      if (lesson.id === this.editingLessonId) continue;
      const item = (lesson.vocabulary || []).find(
        (entry) => this.normalizeVocabularyTerm(entry.term) === normalized,
      );
      if (item) return item;
    }
    return null;
  }

  private normalizeVocabularyTerm(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9'\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private createLessonActivity(type: LessonActivityType): LessonActivity {
    const existing = this.activities || [];
    const baseId = type;
    const matchingCount = existing.filter((activity) => activity.type === type).length;
    return {
      id: matchingCount === 0 ? baseId : `${baseId}-${matchingCount + 1}`,
      type,
      title: this.activityTypeLabel(type),
      order: existing.length,
      enabled: true,
      instructions:
        type === 'ai-conversation'
          ? 'تحدث مع الطالب عن نفس موقف الدرس واستخدم الكلمات التي تعلمها.'
          : '',
      questionCount: type === 'ai-conversation' ? 6 : undefined,
      reviewStatus: 'pending',
    };
  }

  private normalizeActivities(activities?: LessonActivity[]): LessonActivity[] {
    const source: LessonActivity[] = activities?.length
      ? activities
      : (['shadowing', 'vocabulary', 'shadowing-review', 'listen-write', 'quiz', 'ai-conversation'] as LessonActivityType[])
          .map((type, index): LessonActivity => ({
            id: type,
            type,
            title: this.activityTypeLabel(type),
            order: index,
            enabled: true,
            instructions:
              type === 'ai-conversation'
                ? 'تحدث مع الطالب عن نفس موقف الدرس واستخدم الكلمات التي تعلمها.'
                : '',
            questionCount: type === 'ai-conversation' ? 6 : undefined,
            reviewStatus: 'pending',
          }));

    return source
      .filter((activity) => activity?.enabled !== false)
      .map((activity, order) => ({
        ...activity,
        id: activity.id || `${activity.type}-${order + 1}`,
        title: activity.title || this.activityTypeLabel(activity.type),
        order,
        enabled: true,
        reviewStatus: activity.reviewStatus || 'pending',
        segmentIndexes: Array.isArray(activity.segmentIndexes)
          ? [...activity.segmentIndexes]
          : undefined,
      }));
  }

  async saveDraftNow(): Promise<void> {
    await this.saveBuilderDraft(true);
    alert('Draft saved. If you refresh, the lesson builder will restore this work.');
  }

  async finishLessonAndSave(): Promise<void> {
    const saved = await this.saveLesson();
    if (
      saved &&
      this.editingLessonId &&
      (this.auth.isAdmin() || this.auth.isTeacher())
    ) {
      await this.router.navigate([
        `${this.contentBasePath}/lessons`,
        this.editingLessonId,
        'processing',
      ]);
    }
  }

  async discardBuilderDraft(): Promise<void> {
    if (!confirm('Discard the current lesson draft from this browser?')) return;
    await this.clearBuilderDraft(true);
    this.startNewLesson();
  }

  async saveLesson(): Promise<boolean> {
    this.lessonSavedMessage = '';
    if (!this.canSaveLesson || !this.currentMediaBlob) {
      alert('Upload media, add at least one segment, and fill lesson details first.');
      return false;
    }

    const now = new Date().toISOString();
    const id = this.editingLessonId || this.createId('lesson');
    const existing = this.lessons.find((lesson) => lesson.id === id);

    const lesson: CourseLesson = {
      id,
      title: this.lessonTitle.trim(),
      contentProfile: {
        type: this.lessonContentType,
        topic: this.lessonTopic.trim(),
        learningObjective: this.lessonLearningObjective.trim(),
        teacherNotes: this.lessonTeacherNotes.trim(),
      },
      status: 'draft',
      weekName: '',
      dayName: '',
      requiredRepetitions: Math.max(Number(this.requiredRepetitions) || 10, 1),
      mediaFileName: this.currentMediaFileName || 'lesson-file',
      mediaType: this.currentMediaType || this.currentMediaBlob.type || 'application/octet-stream',
      segments: this.segments.map((segment) => ({ ...segment })),
      vocabulary: this.vocabulary
        .filter((item) => item.term.trim())
        .map((item) => ({
          term: item.term.trim(),
          id: item.id,
          kind: item.kind || (item.term.trim().includes(' ') ? 'chunk' : 'word'),
          translation: item.translation.trim(),
          example: item.example.trim() || item.term.trim(),
          explanation: item.explanation?.trim() || '',
          imagePrompt: item.imagePrompt?.trim() || '',
          extraExample: item.extraExample?.trim() || '',
          usageNote: item.usageNote?.trim() || '',
          imageAlt: item.imageAlt?.trim() || '',
          imageProvider: item.imageProvider,
          aiConfidence: Math.min(1, Math.max(0, Number(item.aiConfidence) || 0)),
          imageUrl: item.imageUrl?.trim() || '',
          imageApproved: Boolean(item.imageUrl?.trim() && item.imageApproved),
          includeForStudent: item.includeForStudent !== false,
          repeatForReview: Boolean(item.repeatForReview),
          testLater: Boolean(item.testLater),
        })),
      activities: this.activities.map((activity, order) => ({
        ...activity,
        order,
        enabled: true,
        aiGenerated: false,
        reviewStatus: 'pending',
        title: activity.title.trim() || this.activityTypeLabel(activity.type),
        questionCount:
          activity.type === 'ai-conversation'
            ? Math.max(6, Number(activity.questionCount) || 6)
            : undefined,
      })),
      scriptLines: [...this.scriptLines],
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    let savedLesson: CourseLesson;

    try {
      const databaseLesson = await this.lessonRepository.saveLessonToDatabaseStrict(
        lesson,
        this.currentMediaBlob,
      );
      savedLesson = {
        ...databaseLesson,
        weekName: databaseLesson.weekName || '',
        dayName: databaseLesson.dayName || '',
      };
    } catch (error) {
      console.error('[Lessons API] Save failed.', error);
      alert('The lesson was not saved in the database. Make sure the API is running, then try again.');
      return false;
    }


    if (existing) {
      this.lessons = this.lessons.map((item) => (item.id === id ? savedLesson : item));
    } else {
      this.lessons = [...this.lessons, savedLesson];
    }

    this.editingLessonId = id;
    this.selectedLessonId = id;
    this.ensureProgressRowsForLesson(savedLesson);
    this.saveStore();
    await this.clearBuilderDraft(false);
    this.lessonSavedMessage =
      'تم حفظ الدرس داخل مكتبة الدروس. الخطوة التالية: أضفه إلى المنهج ثم انشره للمجموعة.';
    this.view = 'lesson-builder';
    return true;
  }

  async deleteLesson(lesson: CourseLesson): Promise<void> {
    if (!confirm(`Delete ${lesson.title}?`)) return;

    const previousLessons = [...this.lessons];
    const previousProgress = [...this.progressItems];
    const previousRecordings = [...this.recordings];
    const lessonRecordings = this.recordings.filter((item) => item.lessonId === lesson.id);

    // Update the screen immediately. If the Backend refuses, restore the snapshot.
    this.lessons = this.lessons.filter((item) => item.id !== lesson.id);
    this.progressItems = this.progressItems.filter((item) => item.lessonId !== lesson.id);
    this.recordings = this.recordings.filter((item) => item.lessonId !== lesson.id);
    this.saveStore();

    try {
      await this.lessonRepository.deleteLessonFromDatabase(lesson.id);
    } catch (error) {
      this.lessons = previousLessons;
      this.progressItems = previousProgress;
      this.recordings = previousRecordings;
      this.saveStore();
      console.error('[Lessons API] Delete failed.', error);
      alert('The lesson was not deleted. Make sure the API is running, then try again.');
      return;
    }

    await this.deleteBlob(`lesson-media-${lesson.id}`);
    for (const recording of lessonRecordings) {
      await this.deleteBlob(`recording-${recording.id}`);
    }
    this.saveStore();
  }

  addStudent(): void {
    const name = this.newStudentName.trim();
    const email = this.newStudentEmail.trim();

    if (!name || !email) {
      alert('Write student name and email.');
      return;
    }

    const student: StudentAccount = {
      id: this.createId('student'),
      name,
      email,
      createdAt: new Date().toISOString(),
    };

    this.students = [...this.students, student];
    this.newStudentName = '';
    this.newStudentEmail = '';
    this.selectedStudentId = student.id;

    for (const lesson of this.lessons) {
      this.ensureProgressRow(student.id, lesson.id, lesson.requiredRepetitions);
    }

    this.saveStore();
  }

  getWeekNames(): string[] {
    const names = this.lessons.map((lesson) => lesson.weekName || 'Week 1');
    return Array.from(new Set(names));
  }

  getDayNames(weekName: string): string[] {
    const names = this.lessons.filter((lesson) => lesson.weekName === weekName).map((lesson) => lesson.dayName || 'Day 1');
    return Array.from(new Set(names));
  }

  getLessonsFor(weekName: string, dayName: string): CourseLesson[] {
    return this.lessons.filter((lesson) => lesson.weekName === weekName && lesson.dayName === dayName);
  }

  getProgress(studentId: string, lessonId: string): StudentProgress | null {
    return this.progressItems.find((item) => item.studentId === studentId && item.lessonId === lessonId) || null;
  }

  getProgressPercent(studentId: string, lesson: CourseLesson): number {
    const progress = this.getProgress(studentId, lesson.id);
    const completed = progress?.completedRepetitions || 0;
    const required = progress?.requiredRepetitions || lesson.requiredRepetitions || 1;
    return Math.min(Math.round((completed / required) * 100), 100);
  }

  getProgressStatus(progress: StudentProgress | null): ProgressStatus {
    if (!progress || progress.completedRepetitions <= 0) return 'not-started';
    if (progress.completedRepetitions >= progress.requiredRepetitions) return 'completed';
    return 'in-progress';
  }

  getStatusLabel(progress: StudentProgress | null): string {
    const status = this.getProgressStatus(progress);
    if (status === 'completed') return 'Completed';
    if (status === 'in-progress') return 'In progress';
    return 'Not started';
  }

  getLessonRecordingsForStudent(studentId: string, lessonId: string): RecordingMeta[] {
    return this.recordings.filter((recording) => recording.studentId === studentId && recording.lessonId === lessonId);
  }

  async playTeacherRecording(recording: RecordingMeta): Promise<void> {
    const blob = await this.getBlob(`recording-${recording.id}`);
    if (!blob) {
      alert('Recording file was not found in this browser.');
      return;
    }

    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    await audio.play();
  }

  buildReminderMessage(student: StudentAccount, lesson: CourseLesson): string {
    const progress = this.getProgress(student.id, lesson.id);
    const completed = progress?.completedRepetitions || 0;
    const required = lesson.requiredRepetitions;

    if (completed === 0) {
      return `${student.name}, you still haven't started ${lesson.title}. Start with one repetition now.`;
    }

    if (completed < required) {
      return `${student.name}, great progress. You finished ${completed}/${required}. You only have ${required - completed} left.`;
    }

    return `${student.name}, excellent work. You completed ${lesson.title}.`;
  }

  showReminder(student: StudentAccount, lesson: CourseLesson): void {
    alert(this.buildReminderMessage(student, lesson));
  }

  onLessonMetadataLoaded(): void {
    const media = this.lessonPlayer?.nativeElement;
    if (!media) return;
    this.lessonDuration = Number.isFinite(media.duration) ? media.duration : 0;
    this.lessonCurrentTime = media.currentTime || 0;
  }

  onLessonTimeUpdate(): void {
    const media = this.lessonPlayer?.nativeElement;
    if (!media) return;
    this.lessonCurrentTime = media.currentTime || 0;
  }

  onLessonPlay(): void {
    this.isLessonPlaying = true;
    this.startWaveformVideoSync();
  }

  onLessonPause(): void {
    this.isLessonPlaying = false;
    this.stopWaveformVideoSync();
    this.syncWaveformToMedia();
  }

  async toggleLessonPlayback(): Promise<void> {
    const media = this.lessonPlayer?.nativeElement;
    if (!media) return;

    this.stopSelectionPreview();

    if (media.paused) {
      try {
        media.playbackRate = this.teacherSpeed;
        await media.play();
      } catch (error) {
        console.error(error);
        alert('The lesson file could not start. Try clicking again.');
      }
      return;
    }

    media.pause();
  }

  stopLessonPlayback(): void {
    const media = this.lessonPlayer?.nativeElement;
    if (!media) return;
    this.stopSelectionPreview();
    media.pause();
    media.currentTime = 0;
    this.lessonCurrentTime = 0;
    this.wavesurfer?.setTime(0);
  }

  skipLesson(seconds: number): void {
    const nextTime = this.clampLessonTime((this.lessonPlayer?.nativeElement?.currentTime || 0) + seconds);
    this.seekLessonTo(nextTime);
  }

  zoomWaveform(amount: number): void {
    this.setWaveZoom(this.waveZoom + amount);
  }

  resetWaveZoom(): void {
    this.fitWaveformToScreen();
  }

  onWaveAreaWheel(event: WheelEvent): void {
    if (!this.isWaveformReady) return;

    event.preventDefault();
    const scrollElement = event.currentTarget as HTMLElement;
    const rect = scrollElement.getBoundingClientRect();
    const pointerX = Math.max(0, event.clientX - rect.left);
    const oldScrollWidth = Math.max(scrollElement.scrollWidth, 1);
    const oldPositionUnderMouse = scrollElement.scrollLeft + pointerX;
    const positionRatio = oldPositionUnderMouse / oldScrollWidth;
    const direction = event.deltaY < 0 ? 1 : -1;
    const step = event.ctrlKey ? 45 : 22;

    this.setWaveZoom(this.waveZoom + direction * step);

    window.setTimeout(() => {
      const newScrollWidth = Math.max(scrollElement.scrollWidth, 1);
      scrollElement.scrollLeft = Math.max(0, positionRatio * newScrollWidth - pointerX);
    }, 0);
  }

  async previewCurrentSelection(): Promise<void> {
    const media = this.lessonPlayer?.nativeElement;
    if (!media || !this.hasActiveSelection) return;

    const durationMs = Math.max(((this.segmentEnd || 0) - (this.segmentStart || 0)) * 1000, 300) / Math.max(this.teacherSpeed, 0.25);
    this.stopSelectionPreview();
    media.pause();
    media.playbackRate = this.teacherSpeed;
    await this.seekMediaForPlayback(media, this.segmentStart || 0);

    try {
      await media.play();
    } catch (error) {
      console.error(error);
      return;
    }

    this.selectionPreviewTimeoutId = window.setTimeout(() => {
      media.pause();
      this.selectionPreviewTimeoutId = null;
    }, durationMs);
  }

  async startStudentSession(): Promise<void> {
    const lesson = this.currentLesson;
    if (!lesson || !this.selectedStudentId || !this.videoUrl) return;

    if (this.remainingRepetitions <= 0) {
      alert('This lesson is already completed.');
      return;
    }

    this.sessionTargetRepetitions = Math.min(Math.max(Number(this.sessionTargetRepetitions) || 1, 1), this.remainingRepetitions);
    this.sessionCompletedRepetitions = 0;
    this.stopAfterCurrentRepetition = false;
    this.currentIndex = 0;
    this.currentSegment = this.segments[0] || null;
    this.currentRepetitionNumber = (this.getProgress(this.selectedStudentId, lesson.id)?.completedRepetitions || 0) + 1;

    const ready = await this.prepareAudioSystem();
    if (!ready) {
      alert('Please allow microphone access.');
      return;
    }

    this.shouldContinueTraining = true;
    this.fullRecording = null;

    if (this.recordingMode === 'one-session') {
      this.pendingRecordingContext = {
        from: this.currentRepetitionNumber,
        to: Math.min(this.currentRepetitionNumber + this.sessionTargetRepetitions - 1, lesson.requiredRepetitions),
        mode: 'one-session',
      };
      await this.startRecording();
    }

    await this.startOneRepetition();
  }

  stopStudentSession(): void {
    this.stopAfterCurrentRepetition = true;
    this.shouldContinueTraining = false;
    this.trainingState = 'stopped';
    this.clearActiveTimeout();
    this.lessonPlayer?.nativeElement.pause();
    this.setTeacherAudioLive(false);
    void this.setStudentMicLive(false);
    void this.finishActiveRecordingIfNeeded(false);
  }

  stopAfterThisRepetition(): void {
    this.stopAfterCurrentRepetition = true;
  }

  async startOneRepetition(): Promise<void> {
    if (!this.currentLesson) return;

    this.currentIndex = 0;
    this.currentSegment = this.segments[0] || null;
    this.trainingState = 'teacher';

    if (this.recordingMode === 'per-repetition') {
      this.pendingRecordingContext = {
        from: this.currentRepetitionNumber,
        to: this.currentRepetitionNumber,
        mode: 'per-repetition',
      };
      await this.startRecording();
    }

    await this.playCurrentSegment();
  }

  isTeacherReadingSegment(index: number): boolean {
    return index === this.currentIndex && this.trainingState === 'teacher';
  }

  isStudentRepeatingSegment(index: number): boolean {
    return index === this.currentIndex && this.trainingState === 'student';
  }

  setPauseMode(mode: PauseMode): void {
    this.pauseMode = mode;
  }

  setTeacherSpeed(value: number): void {
    this.teacherSpeed = Number(value) || 1;
    if (this.lessonPlayer?.nativeElement) {
      this.lessonPlayer.nativeElement.playbackRate = this.teacherSpeed;
    }
  }

  formatTime(value: number | null): string {
    if (value === null || !Number.isFinite(value)) return '--:--';
    const minutes = Math.floor(value / 60);
    const seconds = Math.floor(value % 60).toString().padStart(2, '0');
    const milliseconds = Math.floor((value % 1) * 10);
    return `${minutes}:${seconds}.${milliseconds}`;
  }

  exportJson(): void {
    const json = JSON.stringify(this.segments, null, 2);
    void navigator.clipboard.writeText(json);
    alert('Segments JSON copied to clipboard.');
  }

  ngOnDestroy(): void {
    this.localWhisperAlignment.cancel();
    this.stopAllPlaybackAndRecording(false);
    this.revokeStudentRecordingUrls();
    this.microphoneStream?.getTracks().forEach((track) => track.stop());
    void this.audioContext?.close();
    this.clearMediaUrl();
    if (this.fullRecording?.url) URL.revokeObjectURL(this.fullRecording.url);
  }

  private revokeStudentRecordingUrls(): void {
    for (const recording of this.lastStudentRecordings) {
      if (recording.url) URL.revokeObjectURL(recording.url);
    }

    this.lastStudentRecordings = [];
  }

  private async loadStudentRecordingsForLesson(studentId: string, lessonId: string): Promise<void> {
    this.revokeStudentRecordingUrls();

    const savedRecordings = this.recordings
      .filter((recording) => recording.studentId === studentId && recording.lessonId === lessonId)
      .sort((a, b) => a.repetitionFrom - b.repetitionFrom || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const hydratedRecordings: Array<RecordingMeta & { url?: string }> = [];

    for (const recording of savedRecordings) {
      const blob = await this.getBlob(`recording-${recording.id}`);
      hydratedRecordings.push({
        ...recording,
        url: blob ? URL.createObjectURL(blob) : undefined,
      });
    }

    this.lastStudentRecordings = hydratedRecordings;
  }

  private async playCurrentSegment(): Promise<void> {
    if (!this.shouldContinueTraining) return;

    const segment = this.segments[this.currentIndex];
    const media = this.lessonPlayer?.nativeElement;

    if (!segment || !media) {
      await this.finishRepetition();
      return;
    }

    this.clearActiveTimeout();
    this.setTeacherAudioLive(true);
    await this.setStudentMicLive(true);
    this.currentSegment = segment;
    this.trainingState = 'teacher';
    media.playbackRate = this.teacherSpeed;
    await this.seekMediaForPlayback(media, segment.start);

    try {
      await media.play();
    } catch (error) {
      console.error(error);
      alert('The lesson file could not start. Press Start again.');
      this.stopStudentSession();
      return;
    }

    const teacherDuration = Math.max(((segment.end - segment.start) * 1000) / Math.max(this.teacherSpeed, 0.25), 300);
    this.activeTimeoutId = window.setTimeout(() => {
      media.pause();
      void this.startStudentTurn(segment);
    }, teacherDuration);
  }

  private async startStudentTurn(segment: LessonSegment): Promise<void> {
    if (!this.shouldContinueTraining) return;

    this.clearActiveTimeout();
    this.setTeacherAudioLive(true);
    this.trainingState = 'student';
    await this.setStudentMicLive(true);

    this.activeTimeoutId = window.setTimeout(() => {
      void this.setStudentMicLive(false);
      this.goToNextSegment();
    }, this.getStudentTurnDuration(segment));
  }

  private goToNextSegment(): void {
    if (!this.shouldContinueTraining) return;

    this.currentIndex++;
    if (this.currentIndex >= this.segments.length) {
      void this.finishRepetition();
      return;
    }

    void this.playCurrentSegment();
  }

  private async finishRepetition(): Promise<void> {
    const lesson = this.currentLesson;
    if (!lesson || !this.selectedStudentId) return;

    this.clearActiveTimeout();
    this.lessonPlayer?.nativeElement.pause();
    this.sessionCompletedRepetitions++;
    this.incrementProgress(this.selectedStudentId, lesson.id, lesson.requiredRepetitions);

    if (this.recordingMode === 'per-repetition') {
      await this.finishActiveRecordingIfNeeded(true);
    }

    const progress = this.getProgress(this.selectedStudentId, lesson.id);
    const isCompleted = !!progress && progress.completedRepetitions >= lesson.requiredRepetitions;
    const reachedSessionTarget = this.sessionCompletedRepetitions >= this.sessionTargetRepetitions;

    if (this.stopAfterCurrentRepetition || reachedSessionTarget || isCompleted) {
      this.shouldContinueTraining = false;
      this.trainingState = 'finished';
      if (this.recordingMode === 'one-session') {
        await this.finishActiveRecordingIfNeeded(true);
      }
      this.currentSegment = this.segments[this.segments.length - 1] || null;
      this.saveStore();
      return;
    }

    this.currentRepetitionNumber++;
    await this.startOneRepetition();
  }

  private async prepareAudioSystem(): Promise<boolean> {
    try {
      this.microphoneError = '';
      const media = this.lessonPlayer?.nativeElement;
      if (!media) {
        this.microphoneError = 'Open a lesson first.';
        return false;
      }

      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!this.audioContext) this.audioContext = new AudioContextClass();
      if (this.audioContext.state === 'suspended') await this.audioContext.resume();

      if (!this.microphoneStream) {
        this.microphoneStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      }

      if (!this.recorderDestination) this.recorderDestination = this.audioContext.createMediaStreamDestination();

      if (!this.microphoneGain || !this.analyser) {
        const microphoneSource = this.audioContext.createMediaStreamSource(this.microphoneStream);
        this.microphoneGain = this.audioContext.createGain();
        this.microphoneGain.gain.value = 0;
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 128;
        this.analyser.smoothingTimeConstant = 0.75;
        this.frequencyData = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
        microphoneSource.connect(this.analyser);
        microphoneSource.connect(this.microphoneGain);
        this.microphoneGain.connect(this.recorderDestination);
      }

      if (!this.lessonAudioSource || !this.teacherGain) {
        this.lessonAudioSource = this.audioContext.createMediaElementSource(media);
        this.teacherGain = this.audioContext.createGain();
        this.teacherGain.gain.value = 0;
        this.lessonAudioSource.connect(this.teacherGain);
        this.teacherGain.connect(this.recorderDestination);
        this.lessonAudioSource.connect(this.audioContext.destination);
      }

      this.recordingMimeType = this.getSupportedMimeType();
      return true;
    } catch (error) {
      console.error(error);
      this.microphoneError = 'Microphone or lesson audio failed. Please allow microphone access and try again.';
      return false;
    }
  }

  private async startRecording(): Promise<void> {
    if (!this.recorderDestination) return;
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') return;

    const options = this.recordingMimeType ? { mimeType: this.recordingMimeType } : undefined;
    this.recordedChunks = [];
    this.recordingStartedAt = Date.now();
    this.mediaRecorder = new MediaRecorder(this.recorderDestination.stream, options);
    this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) this.recordedChunks.push(event.data);
    };
    this.mediaRecorder.start(500);
    this.isRecorderRunning = true;
    this.setTeacherAudioLive(true);
    await this.setStudentMicLive(true);
    this.startVoiceVisualizer();
  }

  private async finishActiveRecordingIfNeeded(shouldSave: boolean): Promise<void> {
    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') return;

    const recorder = this.mediaRecorder;
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });

    recorder.stop();
    await stopped;
    this.isRecorderRunning = false;
    this.setTeacherAudioLive(false);
    await this.setStudentMicLive(false);
    this.stopVoiceVisualizer();

    if (!shouldSave || this.recordedChunks.length === 0 || !this.pendingRecordingContext || !this.currentLesson || !this.selectedStudentId) {
      this.recordedChunks = [];
      this.pendingRecordingContext = null;
      return;
    }

    const blob = new Blob(this.recordedChunks, { type: this.recordingMimeType || 'audio/webm' });
    const url = URL.createObjectURL(blob);
    const duration = Math.max(Math.round((Date.now() - this.recordingStartedAt) / 1000), 1);
    const recordingId = this.createId('recording');
    const meta: RecordingMeta = {
      id: recordingId,
      studentId: this.selectedStudentId,
      lessonId: this.currentLesson.id,
      repetitionFrom: this.pendingRecordingContext.from,
      repetitionTo: this.pendingRecordingContext.to,
      mode: this.pendingRecordingContext.mode,
      durationLabel: `${duration} sec`,
      createdAt: new Date().toISOString(),
    };

    await this.putBlob(`recording-${recordingId}`, blob);
    this.recordings = [...this.recordings, meta];
    this.addRecordingToProgress(meta);
    this.lastStudentRecordings = [...this.lastStudentRecordings, { ...meta, url }]
      .sort((a, b) => a.repetitionFrom - b.repetitionFrom || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    if (this.fullRecording?.url) URL.revokeObjectURL(this.fullRecording.url);
    this.fullRecording = { url, durationLabel: meta.durationLabel, createdAt: new Date(meta.createdAt).toLocaleTimeString() };

    this.recordedChunks = [];
    this.pendingRecordingContext = null;
    this.saveStore();
    this.cdr.detectChanges();
  }

  private setTeacherAudioLive(isLive: boolean): void {
    if (this.teacherGain && this.audioContext) {
      this.teacherGain.gain.setValueAtTime(isLive ? 1 : 0, this.audioContext.currentTime);
    }
    this.isTeacherAudioRecording = isLive;
  }

  private async setStudentMicLive(isLive: boolean): Promise<void> {
    if (!this.microphoneGain || !this.audioContext) {
      this.isStudentMicLive = false;
      return;
    }
    if (this.audioContext.state === 'suspended') await this.audioContext.resume();
    this.microphoneGain.gain.setValueAtTime(isLive ? 1 : 0, this.audioContext.currentTime);
    this.isStudentMicLive = isLive;
  }

  private startVoiceVisualizer(): void {
    if (this.visualizerFrameId !== null) return;

    const tick = () => {
      if (this.analyser && this.frequencyData && this.isStudentMicLive) {
        this.analyser.getByteFrequencyData(this.frequencyData);
        const bars = Array.from(this.frequencyData).slice(0, 28);
        this.voiceBars = bars.map((value) => Math.max(8, Math.round((value / 255) * 70)));
      } else {
        this.voiceBars = this.voiceBars.map((value) => Math.max(8, Math.round(value * 0.72)));
      }
      this.cdr.detectChanges();
      this.visualizerFrameId = window.requestAnimationFrame(tick);
    };

    this.visualizerFrameId = window.requestAnimationFrame(tick);
  }

  private stopVoiceVisualizer(): void {
    if (this.visualizerFrameId !== null) {
      window.cancelAnimationFrame(this.visualizerFrameId);
      this.visualizerFrameId = null;
    }
    this.voiceBars = Array.from({ length: 28 }, () => 8);
  }

  private initWaveform(): void {
    if (!this.videoUrl || !this.waveformContainer?.nativeElement || !this.timelineContainer?.nativeElement) return;

    this.destroyWaveform();
    this.isWaveformLoading = true;
    this.isWaveformReady = false;
    this.waveformError = '';

    try {
      const regions = RegionsPlugin.create();
      const wavesurfer = WaveSurfer.create({
        container: this.waveformContainer.nativeElement,
        url: this.videoUrl,
        height: 230,
        minPxPerSec: this.waveZoom,
        normalize: false,
        waveColor: '#475569',
        progressColor: '#0f766e',
        cursorColor: '#f59e0b',
        cursorWidth: 3,
        dragToSeek: true,
        plugins: [
          regions,
          TimelinePlugin.create({
            container: this.timelineContainer.nativeElement,
            height: 24,
            timeInterval: 1,
            primaryLabelInterval: 5,
            secondaryLabelInterval: 1,
            formatTimeCallback: (seconds: number) => this.formatTime(seconds),
          }),
        ],
      });

      this.wavesurfer = wavesurfer;
      this.regionsPlugin = regions;

      this.waveformSubscriptions.push(
        wavesurfer.on('ready', () => {
          this.isWaveformLoading = false;
          this.isWaveformReady = true;
          this.lessonDuration = wavesurfer.getDuration() || this.lessonDuration;
          this.fitWaveformToScreen();
          this.disableRegionDragSelection = regions.enableDragSelection({
            color: 'rgba(245, 158, 11, 0.28)',
            content: '',
            drag: true,
            resize: true,
            minLength: 0.2,
          });
          this.ensureDefaultSelection();
          this.cdr.detectChanges();
        }),
      );

      this.waveformSubscriptions.push(
        wavesurfer.on('interaction', () => {
          const time = wavesurfer.getCurrentTime();
          this.seekLessonTo(time, false);
          this.cdr.detectChanges();
        }),
      );

      this.waveformSubscriptions.push(
        regions.on('region-created', (region: any) => {
          if (this.activeRegion && this.activeRegion !== region) {
            const oldRegion = this.activeRegion;
            window.setTimeout(() => oldRegion.remove(), 0);
          }
          this.activeRegion = region;
          this.applyRegionToForm(region, true);
          this.cdr.detectChanges();
        }),
      );

      this.waveformSubscriptions.push(regions.on('region-update', (region: any) => {
        if (this.activeRegion === region) this.applyRegionToForm(region, false);
      }));

      this.waveformSubscriptions.push(regions.on('region-updated', (region: any) => {
        this.activeRegion = region;
        this.applyRegionToForm(region, true);
        this.cdr.detectChanges();
        void this.saveBuilderDraft();
      }));

      this.waveformSubscriptions.push(regions.on('region-clicked', (region: any, event: MouseEvent) => {
        event.stopPropagation();
        this.activeRegion = region;
        this.applyRegionToForm(region, true);
        this.cdr.detectChanges();
      }));

      this.waveformSubscriptions.push(wavesurfer.on('error', (error: Error) => {
        console.error(error);
        this.isWaveformLoading = false;
        this.isWaveformReady = false;
        this.waveformError = 'Waveform failed to load. Try another audio/video file.';
        this.cdr.detectChanges();
      }));
    } catch (error) {
      console.error(error);
      this.isWaveformLoading = false;
      this.isWaveformReady = false;
      this.waveformError = 'Waveform failed to start. Try another file.';
    }
  }

  private destroyWaveform(): void {
    this.stopSelectionPreview();
    this.stopWaveformVideoSync();
    if (this.disableRegionDragSelection) {
      this.disableRegionDragSelection();
      this.disableRegionDragSelection = null;
    }
    this.waveformSubscriptions.forEach((unsubscribe) => unsubscribe());
    this.waveformSubscriptions = [];
    this.activeRegion = null;
    this.regionsPlugin = null;
    if (this.wavesurfer) {
      this.wavesurfer.destroy();
      this.wavesurfer = null;
    }
    this.isWaveformLoading = false;
    this.isWaveformReady = false;
  }

  private createOrReplaceActiveRegion(start: number, end: number): void {
    if (!this.regionsPlugin || !this.isWaveformReady) return;

    const safeStart = Math.max(0, Math.min(start, end));
    const safeEnd = Math.max(safeStart + 0.2, Math.max(start, end));
    this.removeActiveRegion();
    this.activeRegion = this.regionsPlugin.addRegion({
      start: safeStart,
      end: safeEnd,
      color: 'rgba(245, 158, 11, 0.28)',
      content: '',
      drag: true,
      resize: true,
      minLength: 0.2,
    });
    this.applyRegionToForm(this.activeRegion, true);
  }

  private ensureDefaultSelection(): void {
    const duration = this.lessonDuration || this.wavesurfer?.getDuration() || this.lessonPlayer?.nativeElement?.duration || 0;
    if (!Number.isFinite(duration) || duration <= 0) return;

    if (this.segmentStart !== null && this.segmentEnd !== null && this.segmentEnd > this.segmentStart) {
      this.createOrReplaceActiveRegion(this.segmentStart, this.segmentEnd);
      return;
    }

    const currentTime = this.lessonPlayer?.nativeElement?.currentTime || this.wavesurfer?.getCurrentTime() || 0;
    const start = this.roundTime(Math.min(Math.max(currentTime, 0), Math.max(duration - 0.4, 0)));
    const end = this.roundTime(Math.min(start + 2, duration));
    if (end > start) {
      this.segmentStart = start;
      this.segmentEnd = end;
      this.createOrReplaceActiveRegion(start, end);
    }
  }

  private createNextSelectionAfterAdd(startTime: number, previousDuration: number): void {
    const duration = this.lessonDuration || this.wavesurfer?.getDuration() || this.lessonPlayer?.nativeElement?.duration || 0;
    if (!Number.isFinite(duration) || duration <= 0 || startTime >= duration) {
      this.clearCurrentSelection();
      return;
    }

    const safeStart = this.roundTime(Math.min(Math.max(startTime, 0), duration));
    const nextDuration = Math.min(Math.max(previousDuration, 1), 4);
    const safeEnd = this.roundTime(Math.min(safeStart + nextDuration, duration));
    if (safeEnd <= safeStart) {
      this.clearCurrentSelection();
      return;
    }

    this.segmentStart = safeStart;
    this.segmentEnd = safeEnd;
    this.createOrReplaceActiveRegion(safeStart, safeEnd);
    this.seekLessonTo(safeStart);
  }

  private removeActiveRegion(): void {
    if (!this.activeRegion) return;
    const region = this.activeRegion;
    this.activeRegion = null;
    region.remove();
  }

  private clearCurrentSelection(): void {
    this.removeActiveRegion();
    this.segmentStart = null;
    this.segmentEnd = null;
  }

  private applyRegionToForm(region: any, shouldSeekMedia: boolean): void {
    const start = this.roundTime(region.start || 0);
    const end = this.roundTime(region.end || start);
    this.segmentStart = start;
    this.segmentEnd = end;
    if (shouldSeekMedia) this.seekLessonTo(start);
  }

  private setWaveZoom(nextZoom: number): void {
    this.waveZoom = Math.max(this.minWaveZoom, Math.min(this.maxWaveZoom, Math.round(nextZoom)));
    this.applyWaveformZoom();
  }

  private fitWaveformToScreen(): void {
    const duration = this.lessonDuration || this.wavesurfer?.getDuration() || this.lessonPlayer?.nativeElement?.duration || 0;
    const visibleWidth = this.waveScroll?.nativeElement?.clientWidth || this.waveformContainer?.nativeElement?.clientWidth || 900;
    if (!Number.isFinite(duration) || duration <= 0) {
      this.setWaveZoom(12);
      return;
    }
    const fitZoom = Math.max(this.minWaveZoom, Math.floor(visibleWidth / duration));
    this.defaultWaveZoom = fitZoom;
    this.setWaveZoom(fitZoom);
  }

  private applyWaveformZoom(): void {
    if (!this.wavesurfer) return;
    const zoomable = this.wavesurfer as unknown as { zoom: (minPxPerSec: number) => void };
    zoomable.zoom(this.waveZoom);
    this.syncWaveformToMedia();
  }

  private syncWaveformToMedia(): void {
    const media = this.lessonPlayer?.nativeElement;
    if (!media || !this.wavesurfer || !this.isWaveformReady) return;
    const time = this.clampLessonTime(media.currentTime || 0);
    this.lessonCurrentTime = time;
    this.wavesurfer.setTime(time);
  }

  private startWaveformVideoSync(): void {
    if (this.waveformVideoSyncFrameId !== null) return;

    const sync = () => {
      const media = this.lessonPlayer?.nativeElement;
      if (!media || media.paused || media.ended) {
        this.stopWaveformVideoSync();
        this.isLessonPlaying = false;
        this.cdr.detectChanges();
        return;
      }
      this.lessonCurrentTime = media.currentTime || 0;
      if (this.wavesurfer && this.isWaveformReady) this.wavesurfer.setTime(this.lessonCurrentTime);
      this.cdr.detectChanges();
      this.waveformVideoSyncFrameId = window.requestAnimationFrame(sync);
    };

    this.waveformVideoSyncFrameId = window.requestAnimationFrame(sync);
  }

  private stopWaveformVideoSync(): void {
    if (this.waveformVideoSyncFrameId !== null) {
      window.cancelAnimationFrame(this.waveformVideoSyncFrameId);
      this.waveformVideoSyncFrameId = null;
    }
  }

  private async seekMediaForPlayback(media: HTMLMediaElement, time: number): Promise<void> {
    const nextTime = this.clampLessonTime(time);
    media.pause();

    if (Math.abs(media.currentTime - nextTime) > 0.03 || media.seeking) {
      await new Promise<void>((resolve) => {
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          media.removeEventListener('seeked', finish);
          window.clearTimeout(timeoutId);
          resolve();
        };
        const timeoutId = window.setTimeout(finish, 1600);
        media.addEventListener('seeked', finish, { once: true });
        media.currentTime = nextTime;

        if (!media.seeking && Math.abs(media.currentTime - nextTime) <= 0.03) {
          queueMicrotask(finish);
        }
      });
    }

    this.lessonCurrentTime = nextTime;
    this.wavesurfer?.setTime(nextTime);
  }

  private seekLessonTo(time: number, syncWave = true): void {
    const media = this.lessonPlayer?.nativeElement;
    const nextTime = this.clampLessonTime(time);
    if (media) media.currentTime = nextTime;
    this.lessonCurrentTime = nextTime;
    if (syncWave) this.wavesurfer?.setTime(nextTime);
  }

  private clampLessonTime(value: number): number {
    const duration = this.lessonDuration || this.wavesurfer?.getDuration() || this.lessonPlayer?.nativeElement?.duration || 0;
    if (!Number.isFinite(duration) || duration <= 0) return Math.max(value, 0);
    return Math.max(0, Math.min(value, duration));
  }

  private safeDuration(): number {
    const duration = this.lessonDuration || this.wavesurfer?.getDuration() || this.lessonPlayer?.nativeElement?.duration || 1;
    return Number.isFinite(duration) && duration > 0 ? duration : 1;
  }

  private stopSelectionPreview(): void {
    if (this.selectionPreviewTimeoutId !== null) {
      window.clearTimeout(this.selectionPreviewTimeoutId);
      this.selectionPreviewTimeoutId = null;
    }
  }

  private clearActiveTimeout(): void {
    if (this.activeTimeoutId !== null) {
      window.clearTimeout(this.activeTimeoutId);
      this.activeTimeoutId = null;
    }
  }

  private getStudentTurnDuration(segment: LessonSegment): number {
    const base = Math.max((segment.end - segment.start) * 1000, 1000);
    if (this.pauseMode === 'same') return base;
    if (this.pauseMode === 'plus2') return base + 2000;
    if (this.pauseMode === 'plus5') return base + 5000;
    return Math.max((Number(this.customRepeatSeconds) || 3) * 1000, 1000);
  }

  private getSupportedMimeType(): string {
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    return types.find((type) => MediaRecorder.isTypeSupported(type)) || '';
  }

  private incrementProgress(studentId: string, lessonId: string, requiredRepetitions: number): void {
    const progress = this.ensureProgressRow(studentId, lessonId, requiredRepetitions);
    progress.completedRepetitions = Math.min(progress.completedRepetitions + 1, requiredRepetitions);
    progress.updatedAt = new Date().toISOString();
    this.saveStore();
  }

  private addRecordingToProgress(recording: RecordingMeta): void {
    const lesson = this.lessons.find((item) => item.id === recording.lessonId);
    if (!lesson) return;
    const progress = this.ensureProgressRow(recording.studentId, recording.lessonId, lesson.requiredRepetitions);
    progress.recordingIds = Array.from(new Set([...progress.recordingIds, recording.id]));
    progress.updatedAt = new Date().toISOString();
  }

  private ensureProgressRowsForLesson(lesson: CourseLesson): void {
    for (const student of this.students) {
      this.ensureProgressRow(student.id, lesson.id, lesson.requiredRepetitions);
    }
  }

  private ensureProgressRow(studentId: string, lessonId: string, requiredRepetitions: number): StudentProgress {
    let progress = this.progressItems.find((item) => item.studentId === studentId && item.lessonId === lessonId);
    if (!progress) {
      progress = {
        studentId,
        lessonId,
        completedRepetitions: 0,
        requiredRepetitions,
        recordingIds: [],
        updatedAt: new Date().toISOString(),
      };
      this.progressItems = [...this.progressItems, progress];
    } else {
      progress.requiredRepetitions = requiredRepetitions;
    }
    return progress;
  }

  private onAutoSplitProgress(progress: LocalAiProgress): void {
    this.autoSplitMessage = progress.message;
    this.autoSplitPercent = progress.percent;
    this.autoSplitDevice = progress.device || this.autoSplitDevice;
    this.cdr.detectChanges();
  }

  private resetAutoSplitState(): void {
    if (this.isAutoSplitting) this.localWhisperAlignment.cancel();
    this.isAutoSplitting = false;
    this.autoSplitMessage = '';
    this.autoSplitError = '';
    this.autoSplitPercent = null;
    this.autoSplitDevice = null;
    this.autoSplitElapsedSeconds = 0;
    this.autoSplitTranscript = '';
    this.autoAlignmentResults = [];
  }

  private parseScriptContent(content: string, fileName: string): string[] {
    const trimmed = content.trim();
    if (!trimmed) return [];

    if (fileName.toLowerCase().endsWith('.json') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed) as Array<string | { text?: string }>;
        if (Array.isArray(parsed)) {
          return parsed
            .map((item) => (typeof item === 'string' ? item : item?.text || ''))
            .map((line) => this.cleanUploadedScriptLine(line))
            .filter(Boolean);
        }
      } catch {
        // Fall back to TXT parsing.
      }
    }

    return trimmed
      .split(/\r?\n+/)
      .map((line) => this.cleanUploadedScriptLine(line))
      .filter(Boolean);
  }

  private cleanUploadedScriptLine(line: string): string {
    return line
      .replace(/^\s*(?:speaker\s*\d+|teacher|student|[a-z])\s*[:\-–—]\s*/i, '')
      .trim();
  }

  private moveToNextScriptSentenceAfterAdd(): void {
    if (!this.hasScript) {
      this.segmentText = '';
      return;
    }

    this.selectedScriptIndex = Math.min(this.selectedScriptIndex + 1, this.scriptLines.length);
    this.segmentText = this.currentScriptText || '';
  }

  private stopAllPlaybackAndRecording(shouldSaveRecording: boolean): void {
    this.shouldContinueTraining = false;
    this.stopAfterCurrentRepetition = false;
    this.clearActiveTimeout();
    this.stopSelectionPreview();
    this.stopWaveformVideoSync();
    this.lessonPlayer?.nativeElement.pause();
    this.setTeacherAudioLive(false);
    void this.setStudentMicLive(false);
    void this.finishActiveRecordingIfNeeded(shouldSaveRecording);
    this.trainingState = this.videoUrl ? 'ready' : 'empty';
  }

  private setMediaUrlFromBlob(blob: Blob): void {
    this.clearMediaUrl();
    this.videoUrl = URL.createObjectURL(blob);
  }

  private clearMediaUrl(): void {
    if (this.videoUrl) URL.revokeObjectURL(this.videoUrl);
    this.videoUrl = null;
  }

  private createId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  private roundTime(value: number): number {
    return Math.round(value * 10) / 10;
  }

  private getBuilderDraftData(): BuilderDraftData | null {
    try {
      const raw = localStorage.getItem(this.builderDraftKey);
      if (!raw) return null;
      const data = JSON.parse(raw) as Partial<BuilderDraftData>;
      if (!data || typeof data !== 'object') return null;

      return {
        editingLessonId: data.editingLessonId || null,
        lessonTitle: data.lessonTitle || 'Lesson 1',
        lessonContentType: data.lessonContentType || 'auto',
        lessonTopic: data.lessonTopic || '',
        lessonLearningObjective: data.lessonLearningObjective || '',
        lessonTeacherNotes: data.lessonTeacherNotes || '',
        weekName: data.weekName || '',
        dayName: data.dayName || '',
        requiredRepetitions: Math.max(Number(data.requiredRepetitions) || 10, 1),
        currentMediaFileName: data.currentMediaFileName || '',
        currentMediaType: data.currentMediaType || '',
        segments: Array.isArray(data.segments) ? data.segments : [],
        vocabulary: Array.isArray(data.vocabulary) ? data.vocabulary : [],
        activities: Array.isArray(data.activities)
          ? this.normalizeActivities(data.activities)
          : this.normalizeActivities(),
        scriptLines: Array.isArray(data.scriptLines) ? data.scriptLines : [],
        selectedScriptIndex: Math.max(Number(data.selectedScriptIndex) || 0, 0),
        scriptFileName: data.scriptFileName || '',
        segmentText: data.segmentText || '',
        segmentTranslation: data.segmentTranslation || '',
        segmentStart: typeof data.segmentStart === 'number' ? data.segmentStart : null,
        segmentEnd: typeof data.segmentEnd === 'number' ? data.segmentEnd : null,
        savedAt: data.savedAt || new Date().toISOString(),
      };
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  private checkBuilderDraftStatus(): void {
    const draft = this.getBuilderDraftData();
    this.hasBuilderDraft = !!draft;
    this.builderDraftSavedLabel = draft ? new Date(draft.savedAt).toLocaleTimeString() : '';
  }

  private async restoreBuilderDraftAfterRefresh(): Promise<void> {
    const draft = this.getBuilderDraftData();
    if (!draft) return;

    await this.restoreBuilderDraft(draft);
  }

  async restoreBuilderDraftFromSavedData(): Promise<void> {
    const draft = this.getBuilderDraftData();
    if (!draft) {
      alert('No saved draft found.');
      return;
    }

    await this.restoreBuilderDraft(draft);
  }

  private async restoreBuilderDraft(draft: BuilderDraftData): Promise<void> {
    this.stopAllPlaybackAndRecording(false);
    this.destroyWaveform();

    this.editingLessonId = draft.editingLessonId;
    this.selectedLessonId = draft.editingLessonId;
    this.lessonTitle = draft.lessonTitle;
    this.lessonContentType = draft.lessonContentType;
    this.lessonTopic = draft.lessonTopic;
    this.lessonLearningObjective = draft.lessonLearningObjective;
    this.lessonTeacherNotes = draft.lessonTeacherNotes;
    this.weekName = draft.weekName;
    this.dayName = draft.dayName;
    this.requiredRepetitions = draft.requiredRepetitions;
    this.currentMediaFileName = draft.currentMediaFileName;
    this.currentMediaType = draft.currentMediaType;
    this.segments = draft.segments.map((segment) => ({ ...segment }));
    this.vocabulary = draft.vocabulary.map((item) => ({ ...item }));
    this.activities = this.normalizeActivities(draft.activities);
    this.scriptLines = [...draft.scriptLines];
    this.selectedScriptIndex = Math.min(draft.selectedScriptIndex, Math.max(this.scriptLines.length - 1, 0));
    this.scriptFileName = draft.scriptFileName;
    this.segmentText = draft.segmentText || this.currentScriptText || '';
    this.segmentTranslation = draft.segmentTranslation || '';
    this.segmentStart = draft.segmentStart;
    this.segmentEnd = draft.segmentEnd;
    this.currentSegment = this.segments[0] || null;
    this.trainingState = 'ready';

    this.currentMediaBlob = await this.getBlob(this.builderDraftMediaKey);

    if (this.currentMediaBlob) {
      this.setMediaUrlFromBlob(this.currentMediaBlob);
    } else {
      this.clearMediaUrl();
    }

    this.hasBuilderDraft = true;
    this.builderDraftSavedLabel = new Date(draft.savedAt).toLocaleTimeString();
    this.view = 'lesson-builder';
    this.cdr.detectChanges();

    if (this.currentMediaBlob) {
      window.setTimeout(() => this.initWaveform(), 0);
    }
  }

  private async saveBuilderDraft(includeMedia = false): Promise<void> {
    if (this.view !== 'lesson-builder') return;

    const now = new Date().toISOString();
    const draft: BuilderDraftData = {
      editingLessonId: this.editingLessonId,
      lessonTitle: this.lessonTitle,
      lessonContentType: this.lessonContentType,
      lessonTopic: this.lessonTopic,
      lessonLearningObjective: this.lessonLearningObjective,
      lessonTeacherNotes: this.lessonTeacherNotes,
      weekName: this.weekName,
      dayName: this.dayName,
      requiredRepetitions: Math.max(Number(this.requiredRepetitions) || 10, 1),
      currentMediaFileName: this.currentMediaFileName,
      currentMediaType: this.currentMediaType,
      segments: this.segments.map((segment) => ({ ...segment })),
      vocabulary: this.vocabulary.map((item) => ({ ...item })),
      activities: this.activities.map((activity) => ({ ...activity })),
      scriptLines: [...this.scriptLines],
      selectedScriptIndex: this.selectedScriptIndex,
      scriptFileName: this.scriptFileName,
      segmentText: this.segmentText,
      segmentTranslation: this.segmentTranslation,
      segmentStart: this.segmentStart,
      segmentEnd: this.segmentEnd,
      savedAt: now,
    };

    localStorage.setItem(this.builderDraftKey, JSON.stringify(draft));
    this.hasBuilderDraft = true;
    this.builderDraftSavedLabel = new Date(now).toLocaleTimeString();

    if (includeMedia && this.currentMediaBlob) {
      this.isSavingBuilderDraft = true;
      try {
        await this.putBlob(this.builderDraftMediaKey, this.currentMediaBlob);
      } finally {
        this.isSavingBuilderDraft = false;
      }
    }
  }

  private async clearBuilderDraft(shouldClearScreen: boolean): Promise<void> {
    localStorage.removeItem(this.builderDraftKey);
    await this.deleteBlob(this.builderDraftMediaKey);
    this.hasBuilderDraft = false;
    this.builderDraftSavedLabel = '';

    if (!shouldClearScreen) return;

    this.editingLessonId = null;
    this.selectedLessonId = null;
    this.lessonTitle = `Lesson ${this.lessons.length + 1}`;
    this.lessonContentType = 'auto';
    this.lessonTopic = '';
    this.lessonLearningObjective = '';
    this.lessonTeacherNotes = '';
    this.weekName = '';
    this.dayName = '';
    this.requiredRepetitions = 10;
    this.currentMediaBlob = null;
    this.currentMediaFileName = '';
    this.currentMediaType = '';
    this.clearMediaUrl();
    this.destroyWaveform();
    this.segments = [];
    this.vocabulary = [];
    this.activities = [this.createLessonActivity('shadowing')];
    this.scriptLines = [];
    this.selectedScriptIndex = 0;
    this.scriptFileName = '';
    this.scriptError = '';
    this.segmentText = '';
    this.segmentTranslation = '';
    this.segmentStart = null;
    this.segmentEnd = null;
    this.currentSegment = null;
    this.trainingState = 'empty';
  }

  private loadStore(): void {
    try {
      const raw = localStorage.getItem(this.storageKey);
      this.lessons = this.lessonRepository.getAll();
      if (!raw) return;
      const data = JSON.parse(raw) as Partial<AppStoreData>;
      this.students = Array.isArray(data.students) ? data.students : [];
      this.progressItems = Array.isArray(data.progress) ? data.progress : [];
      this.recordings = Array.isArray(data.recordings) ? data.recordings : [];
    } catch (error) {
      console.error(error);
    }
  }

  private saveStore(): void {
    let currentStore: Record<string, unknown> = {};

    try {
      const raw = localStorage.getItem(this.storageKey);
      currentStore = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      currentStore = {};
    }

    const data = {
      ...currentStore,
      lessons: [],
      students: this.students,
      progress: this.progressItems,
      recordings: this.recordings,
    };

    localStorage.setItem(this.storageKey, JSON.stringify(data));
  }

  private ensureDemoStudents(): void {
    if (this.students.length > 0) return;
    const now = new Date().toISOString();
    this.students = [
      { id: 'student-demo-khaled', name: 'Khaled Demo', email: 'khaled.demo@example.com', createdAt: now },
      { id: 'student-demo-ahmed', name: 'Ahmed Demo', email: 'ahmed.demo@example.com', createdAt: now },
      { id: 'student-demo-omar', name: 'Omar Demo', email: 'omar.demo@example.com', createdAt: now },
    ];
    this.saveStore();
  }

  private openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.dbStoreName)) db.createObjectStore(this.dbStoreName);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private async putBlob(key: string, blob: Blob): Promise<void> {
    const db = await this.openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.dbStoreName, 'readwrite');
      tx.objectStore(this.dbStoreName).put(blob, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  private async getBlob(key: string): Promise<Blob | null> {
    const db = await this.openDb();
    const result = await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(this.dbStoreName, 'readonly');
      const request = tx.objectStore(this.dbStoreName).get(key);
      request.onsuccess = () => resolve((request.result as Blob) || null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return result;
  }

  private async deleteBlob(key: string): Promise<void> {
    const db = await this.openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.dbStoreName, 'readwrite');
      tx.objectStore(this.dbStoreName).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }
}
