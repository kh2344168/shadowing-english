import { describe, expect, it, vi } from 'vitest';
import { StudentTrackingApiService } from '../../../core/api/student-tracking-api.service';
import { AppDiagnosticsService } from '../../../core/diagnostics/app-diagnostics.service';
import { IndexedDbService } from '../../../core/storage/indexed-db.service';
import { LessonRepository } from '../../lessons/data-access/lesson.repository';
import { PlatformStore } from '../../platform-store.model';
import { PlatformStoreService } from '../../shared-data-access/platform-store.service';
import { RecordingMeta } from './recording.models';
import { RecordingRepository } from './recording.repository';

describe('RecordingRepository review recordings', () => {
  it('saves a review recording without increasing completed repetitions', async () => {
    let store: PlatformStore = {
      lessons: [],
      students: [],
      groups: [],
      curriculums: [],
      recordings: [],
      progress: [
        {
          studentId: 'student-1',
          groupId: 'group-1',
          lessonId: 'lesson-1',
          curriculumSlotId: 'slot-1',
          completedRepetitions: 3,
          requiredRepetitions: 3,
          recordingIds: ['recording-1', 'recording-2', 'recording-3'],
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    };
    const storeService = {
      getStore: () => structuredClone(store),
      saveStore: (next: PlatformStore) => {
        store = structuredClone(next);
      },
    } as PlatformStoreService;
    const indexedDb = {
      putBlob: vi.fn().mockResolvedValue(undefined),
    } as unknown as IndexedDbService;
    const trackingApi = {
      uploadRecording: vi.fn().mockResolvedValue(null),
      trackEvent: vi.fn().mockResolvedValue(null),
    } as unknown as StudentTrackingApiService;
    const lessons = { getById: vi.fn().mockReturnValue(null) } as unknown as LessonRepository;
    const diagnostics = {
      start: vi.fn(() => () => 1),
      check: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
    } as unknown as AppDiagnosticsService;
    const repository = new RecordingRepository(
      storeService,
      indexedDb,
      trackingApi,
      lessons,
      diagnostics,
    );
    const review: RecordingMeta = {
      id: 'review-recording-1',
      studentId: 'student-1',
      groupId: 'group-1',
      lessonId: 'lesson-1',
      curriculumSlotId: 'slot-1',
      repetitionFrom: 3,
      repetitionTo: 3,
      mode: 'per-repetition',
      countsTowardProgress: false,
      durationLabel: '0:15',
      createdAt: '2026-01-02T00:00:00.000Z',
    };

    await repository.saveRecording(review, new Blob(['review']));

    expect(store.recordings).toEqual([review]);
    expect(store.progress[0].completedRepetitions).toBe(3);
    expect(store.progress[0].recordingIds).toEqual([
      'recording-1',
      'recording-2',
      'recording-3',
    ]);
  });
});
