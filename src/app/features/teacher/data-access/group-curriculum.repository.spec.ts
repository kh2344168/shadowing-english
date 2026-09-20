import { PlatformStore } from '../../platform-store.model';
import { PlatformStoreService } from '../../shared-data-access/platform-store.service';
import { CurriculumRepository } from './curriculum.repository';
import { GroupCurriculumApiService } from './group-curriculum-api.service';
import { GroupCurriculumRepository } from './group-curriculum.repository';
import { StudentRepository } from './student.repository';
import { TeacherGroup } from './teacher-group.models';

describe('GroupCurriculumRepository draft slot actions', () => {
  it('copies with a new id, moves with the same id, and never mutates published data', () => {
    const harness = createHarness();

    harness.repository.copyDraftSlot(
      'group-1',
      'week-1',
      'day-1',
      'slot-1',
      'week-1',
      'day-2',
    );

    let group = harness.read().groups[0];
    const copiedSlot = group.draftCurriculum.weeks[0].days[1].lessonSlots[0];
    expect(copiedSlot.lessonId).toBe('lesson-a');
    expect(copiedSlot.id).not.toBe('slot-1');
    expect(group.publishedCurriculum.weeks[0].days[1].lessonSlots).toHaveLength(0);

    harness.repository.moveDraftSlot(
      'group-1',
      'week-1',
      'day-1',
      'slot-1',
      'week-1',
      'day-2',
    );

    group = harness.read().groups[0];
    expect(group.draftCurriculum.weeks[0].days[0].lessonSlots).toHaveLength(0);
    expect(
      group.draftCurriculum.weeks[0].days[1].lessonSlots.some(
        (slot) => slot.id === 'slot-1',
      ),
    ).toBe(true);
    expect(group.publishedCurriculum.weeks[0].days[0].lessonSlots[0].id).toBe(
      'slot-1',
    );
    expect(group.hasDraftChanges).toBe(true);
  });

  it('replaces only the lesson reference inside the draft slot', () => {
    const harness = createHarness();

    harness.repository.replaceDraftSlot(
      'group-1',
      'week-1',
      'day-1',
      'slot-1',
      'lesson-b',
    );

    const group = harness.read().groups[0];
    expect(group.draftCurriculum.weeks[0].days[0].lessonSlots[0]).toMatchObject({
      id: 'slot-1',
      lessonId: 'lesson-b',
      repetitionCount: 3,
      required: true,
    });
    expect(group.publishedCurriculum.weeks[0].days[0].lessonSlots[0].lessonId).toBe(
      'lesson-a',
    );
  });

  it('copies the latest curriculum into draft and publishes it for the student locally', async () => {
    const group = createGroup();
    let currentStore: PlatformStore = {
      lessons: [],
      students: [],
      progress: [],
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
    const latestCurriculum = {
      id: 'curriculum-1',
      name: 'Curriculum One — latest',
      description: '',
      status: 'ready' as const,
      weeks: structuredClone(group.publishedCurriculum.weeks),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    latestCurriculum.weeks[0].days[0].lessonSlots.push({
      id: 'slot-2',
      lessonId: 'lesson-b',
      repetitionCount: 2,
      required: true,
      order: 1,
    });
    const curriculumRepository = {
      getById: (id: string) =>
        id === latestCurriculum.id ? structuredClone(latestCurriculum) : null,
    } as CurriculumRepository;
    const groupCurriculumApi = {
      publish: () => {
        throw new Error('API unavailable in local preview');
      },
    } as unknown as GroupCurriculumApiService;
    let syncedPublishedVersion = 0;
    const studentRepository = {
      syncPublishedProgressForGroup: (publishedGroup: TeacherGroup) => {
        syncedPublishedVersion = publishedGroup.publishedCurriculum.version;
      },
    } as StudentRepository;
    const repository = new GroupCurriculumRepository(
      storeService,
      curriculumRepository,
      groupCurriculumApi,
      studentRepository,
    );

    repository.syncDraftFromCurriculum('group-1', 'curriculum-1');

    let storedGroup = currentStore.groups[0];
    expect(storedGroup.draftCurriculum.weeks[0].days[0].lessonSlots).toHaveLength(2);
    expect(storedGroup.publishedCurriculum.weeks[0].days[0].lessonSlots).toHaveLength(1);
    expect(storedGroup.hasDraftChanges).toBe(true);

    await repository.publish('group-1');

    storedGroup = currentStore.groups[0];
    expect(storedGroup.publishedCurriculum.weeks[0].days[0].lessonSlots).toHaveLength(2);
    expect(storedGroup.publishedCurriculum.version).toBe(2);
    expect(storedGroup.curriculumName).toBe('Curriculum One — latest');
    expect(storedGroup.hasDraftChanges).toBe(false);
    expect(syncedPublishedVersion).toBe(2);
  });
});

function createHarness() {
  const group = createGroup();
  let currentStore: PlatformStore = {
    lessons: [],
    students: [],
    progress: [],
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

  const repository = new GroupCurriculumRepository(
    storeService,
    {} as CurriculumRepository,
    {} as GroupCurriculumApiService,
    {} as StudentRepository,
  );

  return {
    repository,
    read: () => structuredClone(currentStore),
  };
}

function createGroup(): TeacherGroup {
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
            lessonSlots: [
              {
                id: 'slot-1',
                lessonId: 'lesson-a',
                repetitionCount: 3,
                required: true,
                order: 0,
              },
            ],
          },
          {
            id: 'day-2',
            name: 'Day 2',
            order: 1,
            lessonSlots: [],
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
    studentIds: [],
    draftCurriculum: structuredClone(snapshot),
    publishedCurriculum: structuredClone(snapshot),
    hasDraftChanges: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}
