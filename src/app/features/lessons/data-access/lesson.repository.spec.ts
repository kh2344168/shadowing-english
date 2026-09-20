import { of, throwError } from 'rxjs';
import { IndexedDbService } from '../../../core/storage/indexed-db.service';
import { PlatformStore } from '../../platform-store.model';
import { PlatformStoreService } from '../../shared-data-access/platform-store.service';
import { StudentRepository } from '../../teacher/data-access/student.repository';
import { LessonApiService } from './lesson-api.service';
import { CourseLesson } from './lesson.models';
import { LessonRepository } from './lesson.repository';

describe('LessonRepository portable files and safe deletion', () => {
  it('blocks deletion and reports every curriculum scope that still uses the lesson', () => {
    const harness = createHarness(true);

    const check = harness.repository.getDeleteCheck('lesson-a');

    expect(check.canDelete).toBe(false);
    expect(check.references.map((item) => item.scope).sort()).toEqual([
      'curriculum',
      'group-draft',
      'group-published',
    ]);
    expect(check.progressRows).toBe(1);
    expect(check.recordings).toBe(1);
  });

  it('deletes lesson metadata and every related blob after the safety check passes', async () => {
    const harness = createHarness(false);

    const result = await harness.repository.deleteLessonSafely('lesson-a');

    expect(result.deleted).toBe(true);
    expect(harness.read().lessons).toHaveLength(0);
    expect(harness.read().progress).toHaveLength(0);
    expect(harness.read().recordings).toHaveLength(0);
    expect(harness.deletedBlobKeys).toEqual([
      'lesson-media-lesson-a',
      'recording-recording-1',
    ]);
  });

  it('round-trips a complete lesson package and imports an id collision as a draft copy', async () => {
    const harness = createHarness(false);

    const portable = await harness.repository.exportPortableLesson('lesson-a');
    const imported = await harness.repository.importPortableLesson(
      new File([portable.blob], portable.fileName, { type: 'application/zip' }),
    );

    expect(portable.fileName.endsWith('.shadowlesson.zip')).toBe(true);
    expect(imported.id).not.toBe('lesson-a');
    expect(imported.title).toContain('Imported Copy');
    expect(imported.status).toBe('draft');
    expect(imported.segments).toEqual(createLesson().segments);
  });

  it('does not create a local-only lesson when the hosted API is unavailable', async () => {
    const harness = createHarness(false, true);
    const lesson = {
      ...createLesson(),
      id: 'lesson-server-only',
      title: 'Hosted lesson',
    };

    await expectAsync(
      harness.repository.saveLessonToDatabase(
        lesson,
        new Blob(['hosted-audio'], { type: 'audio/wav' }),
      ),
    ).toBeRejected();

    expect(
      harness.repository.getAll().some((item) => item.id === 'lesson-server-only'),
    ).toBe(false);
  });
});

function createHarness(withReferences: boolean, apiSaveFails = false) {
  const lesson = createLesson();
  const slot = {
    id: 'slot-1',
    lessonId: lesson.id,
    repetitionCount: 3,
    required: true,
    order: 0,
  };
  const weeks = [
    {
      id: 'week-1',
      name: 'Week 1',
      order: 0,
      days: [
        {
          id: 'day-1',
          name: 'Day 1',
          order: 0,
          lessonSlots: withReferences ? [slot] : [],
        },
      ],
    },
  ];
  const snapshot = {
    sourceCurriculumId: 'curriculum-1',
    sourceCurriculumName: 'Curriculum One',
    version: 1,
    weeks,
    updatedAt: '2026-01-01T00:00:00.000Z',
    publishedAt: '2026-01-01T00:00:00.000Z',
  };
  let currentStore: PlatformStore = {
    lessons: [lesson],
    students: [],
    progress: [
      {
        studentId: 'student-1',
        groupId: 'group-1',
        lessonId: lesson.id,
        curriculumSlotId: 'slot-1',
        completedRepetitions: 1,
        requiredRepetitions: 3,
        recordingIds: ['recording-1'],
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    recordings: [
      {
        id: 'recording-1',
        studentId: 'student-1',
        groupId: 'group-1',
        lessonId: lesson.id,
        curriculumSlotId: 'slot-1',
        repetitionFrom: 1,
        repetitionTo: 1,
        mode: 'per-repetition',
        durationLabel: '00:02',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    curriculums: withReferences
      ? [
          {
            id: 'curriculum-1',
            name: 'Curriculum One',
            description: '',
            status: 'ready',
            weeks,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ]
      : [],
    groups: withReferences
      ? [
          {
            id: 'group-1',
            name: 'Group One',
            curriculumId: 'curriculum-1',
            curriculumName: 'Curriculum One',
            startDate: '2026-01-01',
            studentIds: [],
            draftCurriculum: structuredClone(snapshot),
            publishedCurriculum: structuredClone(snapshot),
            hasDraftChanges: false,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ]
      : [],
  };
  const deletedBlobKeys: string[] = [];
  const mediaBlob = new Blob(['test-audio'], { type: 'audio/wav' });
  const storeService = {
    getStore: () => structuredClone(currentStore),
    saveStore: (next: PlatformStore) => {
      currentStore = structuredClone(next);
    },
  } as PlatformStoreService;
  const indexedDb = {
    getBlob: async () => mediaBlob,
    putBlob: async () => undefined,
    deleteBlob: async (key: string) => {
      deletedBlobKeys.push(key);
    },
    deleteBlobsByPrefix: async () => undefined,
  } as unknown as IndexedDbService;
  const studentRepository = {
    ensureProgressRowsForLesson: () => undefined,
  } as unknown as StudentRepository;
  const lessonApi = {
    getAll: () => of([]),
    getMedia: () => of(mediaBlob),
    save: (savedLesson: CourseLesson) =>
      apiSaveFails
        ? throwError(() => new Error('API unavailable'))
        : of(savedLesson),
    delete: () => of(undefined),
  } as unknown as LessonApiService;

  return {
    repository: new LessonRepository(
      storeService,
      indexedDb,
      studentRepository,
      lessonApi,
    ),
    read: () => structuredClone(currentStore),
    deletedBlobKeys,
  };
}

function createLesson(): CourseLesson {
  return {
    id: 'lesson-a',
    title: 'Greeting a Customer',
    description: 'Test lesson',
    status: 'ready',
    weekName: '',
    dayName: '',
    requiredRepetitions: 3,
    mediaFileName: 'greeting.wav',
    mediaType: 'audio/wav',
    segments: [
      {
        text: 'Hello, how can I help you?',
        translation: 'مرحبًا، كيف يمكنني مساعدتك؟',
        start: 0,
        end: 2,
      },
    ],
    scriptLines: ['Hello, how can I help you?'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}
