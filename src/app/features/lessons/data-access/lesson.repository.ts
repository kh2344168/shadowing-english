import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { AppDiagnosticsService } from '../../../core/diagnostics/app-diagnostics.service';
import { BehaviorSubject, firstValueFrom, Observable } from 'rxjs';
import { IndexedDbService } from '../../../core/storage/indexed-db.service';
import { PlatformStoreService } from '../../shared-data-access/platform-store.service';
import { StudentRepository } from '../../teacher/data-access/student.repository';
import { LessonApiService } from './lesson-api.service';
import { CourseLesson, getLessonActivities } from './lesson.models';

export type LessonUsageScope =
  | 'curriculum'
  | 'group-draft'
  | 'group-published';

export interface LessonUsageReference {
  scope: LessonUsageScope;
  ownerId: string;
  ownerName: string;
  weekName: string;
  dayName: string;
}

export interface LessonDeleteCheck {
  canDelete: boolean;
  references: LessonUsageReference[];
  progressRows: number;
  recordings: number;
}

export interface LessonDeleteResult extends LessonDeleteCheck {
  deleted: boolean;
}

export interface PortableLessonFile {
  blob: Blob;
  fileName: string;
}

interface PortableLessonManifest {
  format: 'shadowing-english-lesson';
  schemaVersion: 1;
  exportedAtUtc: string;
  mediaPath: string;
  lesson: CourseLesson;
}

@Injectable({ providedIn: 'root' })
export class LessonRepository {
  private initializationPromise: Promise<void> | null = null;
  private initializedFromDatabase = false;
  private readonly lessonsSubject: BehaviorSubject<CourseLesson[]>;
  readonly lessons$: Observable<CourseLesson[]>;

  constructor(
    private storeService: PlatformStoreService,
    private indexedDb: IndexedDbService,
    private studentRepository: StudentRepository,
    private lessonApi: LessonApiService,
    private diagnostics: AppDiagnosticsService = new AppDiagnosticsService(),
  ) {
    this.lessonsSubject = new BehaviorSubject<CourseLesson[]>([]);
    this.lessons$ = this.lessonsSubject.asObservable();
  }

  async initializeFromDatabase(): Promise<void> {
    if (this.initializedFromDatabase) {
      this.diagnostics.info('Lessons', 'initialize:skip-already-loaded', {
        lessonCount: this.lessonsSubject.value.length,
      });
      return;
    }
    if (this.initializationPromise) {
      this.diagnostics.info('Lessons', 'initialize:join-inflight');
      return this.initializationPromise;
    }

    const elapsed = this.diagnostics.start('Lessons', 'initialize-from-backend');
    this.initializationPromise = (async () => {
      // Old lesson-media blobs are not used by the current app. Cleanup is maintenance
      // work and must not delay the first lessons API request on every fresh session.
      void this.indexedDb.deleteBlobsByPrefix('lesson-media-').catch((error) =>
        console.warn('[Lessons] Old local lesson media cache could not be cleared.', error),
      );

      try {
        const remoteLessons = await firstValueFrom(this.lessonApi.getAll());
        // The database is the only durable source of truth for lesson content.
        // Keep the fetched list in memory for this session; do not persist it locally.
        const lessons = remoteLessons.map((lesson) => this.normalizeLesson(lesson));
        this.publishLessons(lessons);
        this.initializedFromDatabase = true;
        this.diagnostics.check('Lessons', 'backend-result', true, { lessonCount: lessons.length });
        this.diagnostics.success('Lessons', 'initialize-from-backend', elapsed(), { lessonCount: lessons.length });
      } catch (error) {
        // Never fall back to stale lesson content from this device. If the hosted API
        // is unavailable, lesson content is unavailable until the server comes back.
        this.publishLessons([]);
        this.initializedFromDatabase = false;
        this.diagnostics.error('Lessons', 'initialize-from-backend:error', error, { durationMs: elapsed() });
      } finally {
        this.initializationPromise = null;
      }
    })();

    return this.initializationPromise;
  }


  async reloadFromDatabase(reason = 'session-changed'): Promise<void> {
    const elapsed = this.diagnostics.start('Lessons', 'session-reload', {
      reason,
      previousLessonCount: this.lessonsSubject.value.length,
    });

    if (this.initializationPromise) {
      try {
        await this.initializationPromise;
      } catch {
        // initializeFromDatabase already logs the original error.
      }
    }

    this.initializedFromDatabase = false;
    this.initializationPromise = null;
    this.publishLessons([]);
    this.diagnostics.check('Lessons', 'session-cache-cleared', this.lessonsSubject.value.length === 0, { reason });

    await this.initializeFromDatabase();
    this.diagnostics.success('Lessons', 'session-reload', elapsed(), {
      reason,
      lessonCount: this.lessonsSubject.value.length,
    });
  }

  clearSessionCache(reason = 'logout'): void {
    const previousLessonCount = this.lessonsSubject.value.length;
    this.initializedFromDatabase = false;
    this.initializationPromise = null;
    this.publishLessons([]);
    this.diagnostics.check('Lessons', 'session-cache-cleared', this.lessonsSubject.value.length === 0, {
      reason,
      previousLessonCount,
    });
  }

  getAll(): CourseLesson[] {
    return this.lessonsSubject.value;
  }

  getById(id: string): CourseLesson | null {
    return this.getAll().find((lesson) => lesson.id === id) || null;
  }

  saveLesson(lesson: CourseLesson, _mediaBlob?: Blob): void {
    const currentLessons = this.getAll();
    const index = currentLessons.findIndex((item) => item.id === lesson.id);
    const nextLesson = this.normalizeLesson(lesson);
    const nextLessons = [...currentLessons];

    if (index === -1) {
      nextLessons.unshift(nextLesson);
    } else {
      nextLessons[index] = nextLesson;
    }

    // Session memory only. Persistent lesson content/media stays on the Backend.
    this.publishLessons(nextLessons);
    this.studentRepository.ensureProgressRowsForLesson(
      nextLesson.id,
      nextLesson.requiredRepetitions,
    );
  }

  async saveLessonToDatabase(
    lesson: CourseLesson,
    mediaBlob?: Blob,
  ): Promise<CourseLesson> {
    // Saving a lesson only succeeds when the hosted Backend confirms it.
    return this.saveLessonToDatabaseStrict(lesson, mediaBlob);
  }

  async saveLessonToDatabaseStrict(
    lesson: CourseLesson,
    mediaBlob?: Blob,
  ): Promise<CourseLesson> {
    const remoteLesson = await firstValueFrom(
      this.lessonApi.save(lesson, mediaBlob),
    );
    const savedLesson = this.normalizeLesson({
      ...lesson,
      ...remoteLesson,
      vocabulary: remoteLesson.vocabulary ?? lesson.vocabulary,
      activities: remoteLesson.activities ?? lesson.activities,
    });
    this.saveLesson(savedLesson, mediaBlob);
    return savedLesson;
  }

  async duplicateLesson(lessonId: string): Promise<CourseLesson | null> {
    const lesson = this.getById(lessonId);
    if (!lesson) return null;

    const now = new Date().toISOString();
    const duplicate: CourseLesson = {
      ...lesson,
      id: this.createId('lesson'),
      title: `${lesson.title} — Copy`,
      status: 'draft',
      segments: lesson.segments.map((segment) => ({ ...segment })),
      vocabulary: lesson.vocabulary?.map((item) => ({ ...item })),
      activities: lesson.activities?.map((activity) => ({ ...activity })),
      scriptLines: [...lesson.scriptLines],
      createdAt: now,
      updatedAt: now,
    };

    const mediaBlob = await this.getMediaBlob(lesson.id);
    return this.saveLessonToDatabaseStrict(duplicate, mediaBlob || undefined);
  }

  async setArchived(
    lessonId: string,
    archived: boolean,
  ): Promise<CourseLesson | null> {
    const lesson = this.getById(lessonId);
    if (!lesson) return null;

    return this.saveLessonToDatabaseStrict({
      ...lesson,
      status: archived ? 'archived' : 'ready',
      updatedAt: new Date().toISOString(),
    });
  }

  async getMediaBlob(lessonId: string): Promise<Blob | null> {
    try {
      // Media is streamed/downloaded from the hosted Backend on demand and kept only
      // in browser memory for playback. It is not persisted to IndexedDB.
      return await firstValueFrom(this.lessonApi.getMedia(lessonId));
    } catch (error) {
      console.warn(`[Lessons API] Media for ${lessonId} was not available.`, error);
      return null;
    }
  }

  async exportPortableLesson(lessonId: string): Promise<PortableLessonFile> {
    const lesson = this.getById(lessonId);
    if (!lesson) throw new Error('Lesson not found.');

    const mediaBlob = await this.getMediaBlob(lessonId);
    if (!mediaBlob) {
      throw new Error('Lesson media is missing, so a complete export cannot be created.');
    }

    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    const mediaName =
      this.safeFileName(lesson.mediaFileName || 'lesson-media') ||
      'lesson-media';
    const mediaPath = `media/${mediaName}`;
    const manifest: PortableLessonManifest = {
      format: 'shadowing-english-lesson',
      schemaVersion: 1,
      exportedAtUtc: new Date().toISOString(),
      mediaPath,
      lesson: {
        ...this.normalizeLesson(lesson),
        mediaUrl: undefined,
      },
    };

    zip.file('lesson.json', JSON.stringify(manifest, null, 2));
    zip.file(mediaPath, mediaBlob);

    return {
      blob: await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      }),
      fileName: `${this.safeFileName(lesson.title) || 'lesson'}.shadowlesson.zip`,
    };
  }

  async importPortableLesson(file: File): Promise<CourseLesson> {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(file);
    const manifestFile = zip.file('lesson.json');
    if (!manifestFile) {
      throw new Error('The selected file does not contain lesson.json.');
    }

    let manifest: PortableLessonManifest;
    try {
      manifest = JSON.parse(
        await manifestFile.async('string'),
      ) as PortableLessonManifest;
    } catch {
      throw new Error('The lesson manifest is not valid JSON.');
    }

    this.validatePortableManifest(manifest);
    const mediaFile = zip.file(manifest.mediaPath);
    if (!mediaFile) {
      throw new Error('The lesson media file is missing from the package.');
    }

    const mediaBlob = await mediaFile.async('blob');
    if (mediaBlob.size === 0) {
      throw new Error('The lesson media file is empty.');
    }

    const now = new Date().toISOString();
    const hasIdCollision = !!this.getById(manifest.lesson.id);
    const importedLesson = this.normalizeLesson({
      ...manifest.lesson,
      id: hasIdCollision
        ? this.createId('lesson-imported')
        : manifest.lesson.id || this.createId('lesson-imported'),
      title: hasIdCollision
        ? `${manifest.lesson.title} — Imported Copy`
        : manifest.lesson.title,
      status: 'draft',
      mediaFileName:
        manifest.lesson.mediaFileName ||
        manifest.mediaPath.split('/').pop() ||
        'lesson-media',
      mediaType:
        manifest.lesson.mediaType ||
        mediaBlob.type ||
        'application/octet-stream',
      createdAt: now,
      updatedAt: now,
      segments: manifest.lesson.segments.map((segment) => ({ ...segment })),
      vocabulary: manifest.lesson.vocabulary?.map((item) => ({ ...item })),
      activities: manifest.lesson.activities?.map((activity) => ({ ...activity })),
      scriptLines: Array.isArray(manifest.lesson.scriptLines)
        ? [...manifest.lesson.scriptLines]
        : [],
    });

    return this.saveLessonToDatabaseStrict(importedLesson, mediaBlob);
  }

  getDeleteCheck(lessonId: string): LessonDeleteCheck {
    const store = this.storeService.getStore();
    const references: LessonUsageReference[] = [];

    for (const curriculum of store.curriculums) {
      this.collectReferences(
        references,
        'curriculum',
        curriculum.id,
        curriculum.name,
        curriculum.weeks,
        lessonId,
      );
    }

    for (const group of store.groups) {
      this.collectReferences(
        references,
        'group-draft',
        group.id,
        group.name,
        group.draftCurriculum.weeks,
        lessonId,
      );
      this.collectReferences(
        references,
        'group-published',
        group.id,
        group.name,
        group.publishedCurriculum.weeks,
        lessonId,
      );
    }

    return {
      canDelete: references.length === 0,
      references,
      progressRows: store.progress.filter((row) => row.lessonId === lessonId)
        .length,
      recordings: store.recordings.filter(
        (recording) => recording.lessonId === lessonId,
      ).length,
    };
  }

  async deleteLessonSafely(lessonId: string): Promise<LessonDeleteResult> {
    const check = this.getDeleteCheck(lessonId);
    if (!check.canDelete) return { ...check, deleted: false };

    // Update the one shared list immediately. If the API rejects the delete,
    // restore exactly the list that was on screen before the request.
    const previousLessons = this.getAll();
    this.publishLessons(
      previousLessons.filter((lesson) => lesson.id !== lessonId),
    );

    try {
      await firstValueFrom(this.lessonApi.delete(lessonId));
    } catch (error) {
      if (!(error instanceof HttpErrorResponse) || error.status !== 404) {
        this.publishLessons(previousLessons);
        throw error;
      }
    }

    const store = this.storeService.getStore();
    const recordingIds = store.recordings
      .filter((recording) => recording.lessonId === lessonId)
      .map((recording) => recording.id);

    store.progress = store.progress.filter((row) => row.lessonId !== lessonId);
    store.recordings = store.recordings.filter(
      (recording) => recording.lessonId !== lessonId,
    );
    this.storeService.saveStore(store);
    this.publishLessons(
      previousLessons.filter((lesson) => lesson.id !== lessonId),
    );

    // The database delete and the shared lesson-state update are complete here.
    // Local blob cleanup must not keep the page disabled or delay the visible list.
    void this.cleanupDeletedBlobs(lessonId, recordingIds);

    return { ...check, deleted: true };
  }

  async deleteLessonFromDatabase(lessonId: string): Promise<void> {
    const result = await this.deleteLessonSafely(lessonId);
    if (!result.deleted) {
      throw new Error('The lesson is still used by a curriculum or group.');
    }
  }

  private collectReferences(
    target: LessonUsageReference[],
    scope: LessonUsageScope,
    ownerId: string,
    ownerName: string,
    weeks: Array<{
      name: string;
      days: Array<{
        name: string;
        lessonSlots: Array<{ lessonId: string }>;
      }>;
    }>,
    lessonId: string,
  ): void {
    for (const week of weeks) {
      for (const day of week.days) {
        for (const slot of day.lessonSlots) {
          if (slot.lessonId !== lessonId) continue;
          target.push({
            scope,
            ownerId,
            ownerName,
            weekName: week.name,
            dayName: day.name,
          });
        }
      }
    }
  }

  private publishLessons(lessons: CourseLesson[]): void {
    this.lessonsSubject.next([...lessons]);
  }

  private async cleanupDeletedBlobs(
    lessonId: string,
    recordingIds: string[],
  ): Promise<void> {
    const cleanup = await Promise.allSettled([
      this.indexedDb.deleteBlob(`lesson-media-${lessonId}`),
      ...recordingIds.map((recordingId) =>
        this.indexedDb.deleteBlob(`recording-${recordingId}`),
      ),
    ]);
    if (cleanup.some((result) => result.status === 'rejected')) {
      console.warn('[Lessons] Lesson was deleted from the database, but some local blobs could not be removed.');
    }
  }

  private validatePortableManifest(
    manifest: PortableLessonManifest,
  ): void {
    if (
      manifest?.format !== 'shadowing-english-lesson' ||
      manifest.schemaVersion !== 1
    ) {
      throw new Error('This lesson package version is not supported.');
    }

    const lesson = manifest.lesson;
    if (!lesson?.title?.trim()) {
      throw new Error('The imported lesson does not have a title.');
    }

    if (!Array.isArray(lesson.segments) || lesson.segments.length === 0) {
      throw new Error('The imported lesson does not contain segments.');
    }

    if (
      lesson.segments.some(
        (segment) =>
          !segment.text?.trim() ||
          !Number.isFinite(segment.start) ||
          !Number.isFinite(segment.end) ||
          segment.start < 0 ||
          segment.end <= segment.start,
      )
    ) {
      throw new Error('The imported lesson contains invalid segment timing.');
    }

    if (!manifest.mediaPath?.startsWith('media/')) {
      throw new Error('The imported lesson media path is invalid.');
    }
  }

  private normalizeLesson(lesson: CourseLesson): CourseLesson {
    return {
      ...lesson,
      description: lesson.description || '',
      contentProfile: {
        type: lesson.contentProfile?.type || 'auto',
        topic: String(lesson.contentProfile?.topic || '').trim(),
        learningObjective: String(
          lesson.contentProfile?.learningObjective || '',
        ).trim(),
        teacherNotes: String(
          lesson.contentProfile?.teacherNotes || '',
        ).trim(),
      },
      status: lesson.status || 'ready',
      weekName: lesson.weekName || '',
      dayName: lesson.dayName || '',
      requiredRepetitions: Math.max(
        1,
        Number(lesson.requiredRepetitions) || 1,
      ),
      mediaFileName: lesson.mediaFileName || 'lesson-media',
      mediaType: lesson.mediaType || 'application/octet-stream',
      scriptLines: Array.isArray(lesson.scriptLines)
        ? [...lesson.scriptLines]
        : [],
      segments: Array.isArray(lesson.segments)
        ? lesson.segments.map((segment) => ({
            ...segment,
            translation: segment.translation || '',
          }))
        : [],
      vocabulary: Array.isArray(lesson.vocabulary)
        ? lesson.vocabulary
            .filter((item) => item && String(item.term || '').trim())
            .map((item, index) => ({
              id:
                String(item.id || '').trim() ||
                `vocabulary-${this.normalizeContentKey(item.term) || index + 1}`,
              kind:
                item.kind === 'chunk' || String(item.term || '').trim().includes(' ')
                  ? 'chunk'
                  : 'word',
              term: String(item.term || '').trim(),
              translation: String(item.translation || '').trim(),
              example: String(item.example || '').trim(),
              explanation: String(item.explanation || '').trim(),
              imagePrompt: String(item.imagePrompt || '').trim(),
              extraExample: String(item.extraExample || '').trim(),
              usageNote: String(item.usageNote || '').trim(),
              imageAlt: String(item.imageAlt || '').trim(),
              imageProvider: item.imageProvider || undefined,
              aiConfidence: Math.min(
                1,
                Math.max(0, Number(item.aiConfidence) || 0),
              ),
              imageUrl: String(item.imageUrl || '').trim(),
              imageApproved: Boolean(item.imageUrl && item.imageApproved),
              includeForStudent: item.includeForStudent !== false,
              repeatForReview: Boolean(item.repeatForReview),
              testLater: Boolean(item.testLater),
            }))
        : [],
      activities: getLessonActivities(lesson).map((activity) => ({ ...activity })),
    };
  }

  private safeFileName(value: string): string {
    return value
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 120);
  }

  private normalizeContentKey(value: string): string {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60);
  }

  private createId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}
