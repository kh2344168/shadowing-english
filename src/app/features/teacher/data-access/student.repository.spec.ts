import { PlatformStore } from '../../platform-store.model';
import { PlatformStoreService } from '../../shared-data-access/platform-store.service';
import { TeacherGroup } from './teacher-group.models';
import { TeacherGroupRepository } from './teacher-group.repository';
import { StudentRepository } from './student.repository';

describe('StudentRepository slot progress', () => {
  it('keeps reused lesson placements independent', () => {
    const group = createGroup([
      { id: 'slot-week-1', lessonId: 'lesson-a', repetitionCount: 3 },
      { id: 'slot-week-2', lessonId: 'lesson-a', repetitionCount: 10 },
    ]);
    const harness = createHarness(group, [
      {
        studentId: 'student-1',
        groupId: group.id,
        lessonId: 'lesson-a',
        curriculumSlotId: 'slot-week-1',
        completedRepetitions: 3,
        requiredRepetitions: 3,
        recordingIds: [],
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        studentId: 'student-1',
        groupId: group.id,
        lessonId: 'lesson-a',
        curriculumSlotId: 'slot-week-2',
        completedRepetitions: 2,
        requiredRepetitions: 10,
        recordingIds: [],
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    expect(
      harness.repository.getProgress(
        'student-1',
        'lesson-a',
        'slot-week-1',
        group.id,
      )?.completedRepetitions,
    ).toBe(3);
    expect(
      harness.repository.getProgress(
        'student-1',
        'lesson-a',
        'slot-week-2',
        group.id,
      )?.completedRepetitions,
    ).toBe(2);
    expect(
      harness.repository.getProgress(
        'student-1',
        'lesson-a',
        'missing-slot',
        group.id,
      ),
    ).toBeNull();
  });

  it('preserves progress when a slot moves and resets it when the lesson is replaced', () => {
    const group = createGroup([
      { id: 'stable-slot', lessonId: 'lesson-a', repetitionCount: 5 },
    ]);
    const harness = createHarness(group, [
      {
        studentId: 'student-1',
        groupId: group.id,
        lessonId: 'lesson-a',
        curriculumSlotId: 'stable-slot',
        completedRepetitions: 4,
        requiredRepetitions: 5,
        recordingIds: ['recording-1'],
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    harness.repository.syncPublishedProgressForGroup(group);
    expect(harness.read().progress).toHaveLength(1);
    expect(harness.read().progress[0].completedRepetitions).toBe(4);

    const replacedGroup = createGroup([
      { id: 'stable-slot', lessonId: 'lesson-b', repetitionCount: 7 },
    ]);
    harness.repository.syncPublishedProgressForGroup(replacedGroup);

    const rows = harness.read().progress;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      curriculumSlotId: 'stable-slot',
      lessonId: 'lesson-b',
      completedRepetitions: 0,
      requiredRepetitions: 7,
      recordingIds: [],
    });
  });

  it('migrates unambiguous legacy lesson progress to the published slot', () => {
    const group = createGroup([
      { id: 'only-slot', lessonId: 'lesson-a', repetitionCount: 5 },
    ]);
    const harness = createHarness(group, [
      {
        studentId: 'student-1',
        groupId: group.id,
        lessonId: 'lesson-a',
        completedRepetitions: 2,
        requiredRepetitions: 5,
        recordingIds: ['legacy-recording'],
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    harness.repository.syncPublishedProgressForGroup(group);

    expect(harness.read().progress).toHaveLength(1);
    expect(harness.read().progress[0]).toMatchObject({
      curriculumSlotId: 'only-slot',
      completedRepetitions: 2,
      recordingIds: ['legacy-recording'],
    });
  });
});

function createHarness(
  group: TeacherGroup,
  progress: PlatformStore['progress'],
) {
  let currentStore: PlatformStore = {
    lessons: [],
    students: [
      {
        id: 'student-1',
        name: 'Student One',
        email: 'student@example.com',
        groupId: group.id,
        temporaryPassword: 'TEST1234',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    progress,
    recordings: [],
    groups: [group],
    curriculums: [],
  };

  const storeService = {
    getStore: () => structuredClone(currentStore),
    saveStore: (next: PlatformStore) => {
      currentStore = structuredClone(next);
    },
  } as PlatformStoreService;
  const groupRepository = {
    getGroups: () => [group],
    getById: (id: string) => (id === group.id ? group : null),
    addStudentToGroup: () => true,
  } as unknown as TeacherGroupRepository;

  return {
    repository: new StudentRepository(storeService, groupRepository),
    read: () => structuredClone(currentStore),
  };
}

function createGroup(
  slots: Array<{
    id: string;
    lessonId: string;
    repetitionCount: number;
  }>,
): TeacherGroup {
  const snapshot = {
    sourceCurriculumId: 'curriculum-1',
    sourceCurriculumName: 'Curriculum One',
    version: 1,
    weeks: [
      {
        id: 'week-1',
        name: 'Week 1',
        order: 0,
        days: [
          {
            id: 'day-1',
            name: 'Day 1',
            order: 0,
            lessonSlots: slots.map((slot, order) => ({
              ...slot,
              required: true,
              order,
            })),
          },
        ],
      },
    ],
    updatedAt: '2026-01-01T00:00:00.000Z',
    publishedAt: '2026-01-01T00:00:00.000Z',
  };

  return {
    id: 'group-1',
    name: 'Group One',
    curriculumId: 'curriculum-1',
    curriculumName: 'Curriculum One',
    startDate: '2026-01-01',
    studentIds: ['student-1'],
    draftCurriculum: structuredClone(snapshot),
    publishedCurriculum: structuredClone(snapshot),
    hasDraftChanges: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}
