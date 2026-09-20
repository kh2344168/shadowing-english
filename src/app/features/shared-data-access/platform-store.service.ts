import { Injectable } from '@angular/core';
import { LocalStorageService } from '../../core/storage/local-storage.service';
import { PlatformStore } from '../platform-store.model';
import { CurriculumWeek, TeacherCurriculum } from '../teacher/data-access/curriculum.models';
import { GroupCurriculumSnapshot } from '../teacher/data-access/group-curriculum.models';
import { TeacherGroup } from '../teacher/data-access/teacher-group.models';

@Injectable({ providedIn: 'root' })
export class PlatformStoreService {
  private readonly storageKey = 'english-shadowing-platform-v8';

  constructor(private localStorage: LocalStorageService) {}

  getStore(): PlatformStore {
    const rawStore = this.localStorage.getJson<Partial<PlatformStore>>(this.storageKey, {
      lessons: [],
      students: [],
      progress: [],
      recordings: [],
      groups: [],
      curriculums: [],
    });

    const now = new Date().toISOString();

    const curriculums = (rawStore.curriculums || []).map((curriculum, index) =>
      this.normalizeCurriculum(curriculum, index, now),
    );
    const students = (rawStore.students || []).map((student) => ({
      ...student,
      groupId: student.groupId || '',
      temporaryPassword: student.temporaryPassword || '123456',
    }));
    const groupByStudentId = new Map(
      students.map((student) => [student.id, student.groupId]),
    );

    const store: PlatformStore = {
      // Lesson content is server-owned. Never rehydrate lessons from localStorage.
      // The LessonRepository fetches them from /api/lessons for the current session.
      lessons: [],
      students,
      progress: (rawStore.progress || []).map((row) => ({
        ...row,
        groupId: row.groupId || groupByStudentId.get(row.studentId) || '',
      })),
      recordings: (rawStore.recordings || []).map((recording) => ({
        ...recording,
        groupId:
          recording.groupId ||
          groupByStudentId.get(recording.studentId) ||
          '',
      })),
      curriculums,
      groups: (rawStore.groups || []).map((group, index) =>
        this.normalizeGroup(group, index, curriculums, now),
      ),
    };

    // One-time migration from older builds: physically remove previously cached
    // lesson payloads from localStorage. Other platform metadata remains untouched.
    if ((rawStore.lessons?.length || 0) > 0) {
      this.localStorage.setJson(this.storageKey, {
        ...rawStore,
        lessons: [],
      });
    }

    return store;
  }

  saveStore(store: PlatformStore): void {
    // Persist account/progress/curriculum metadata only. Lesson content and media
    // live on the Backend/SQL and must never use browser storage as a source of truth.
    this.localStorage.setJson(this.storageKey, {
      ...store,
      lessons: [],
    });
  }

  private normalizeCurriculum(
    curriculum: TeacherCurriculum,
    index: number,
    now: string,
  ): TeacherCurriculum {
    return {
      ...curriculum,
      id: curriculum.id || `curriculum-${index + 1}`,
      name: curriculum.name || `Curriculum ${index + 1}`,
      description: curriculum.description || '',
      status: curriculum.status || 'ready',
      weeks: this.cloneWeeks(curriculum.weeks || []),
      createdAt: curriculum.createdAt || curriculum.updatedAt || now,
      updatedAt: curriculum.updatedAt || now,
    };
  }

  private normalizeGroup(
    group: TeacherGroup,
    index: number,
    curriculums: TeacherCurriculum[],
    now: string,
  ): TeacherGroup {
    const fallbackCurriculum =
      curriculums.find((curriculum) => curriculum.id === group.curriculumId) ||
      curriculums[0] ||
      null;

    const fallbackSnapshot = this.createSnapshot(
      fallbackCurriculum,
      1,
      now,
      now,
    );
    const needsCurriculumMigration =
      !group.curriculumId ||
      !group.draftCurriculum?.weeks?.length ||
      !group.publishedCurriculum?.weeks?.length;

    return {
      ...group,
      teacherId: group.teacherId || '',
      id: group.id || `group-${index + 1}`,
      name: group.name || `Group ${index + 1}`,
      curriculumId: group.curriculumId || fallbackCurriculum?.id || '',
      curriculumName: needsCurriculumMigration
        ? fallbackCurriculum?.name || 'No Curriculum'
        : group.curriculumName || fallbackCurriculum?.name || 'No Curriculum',
      startDate: group.startDate || now.slice(0, 10),
      studentIds: group.studentIds || [],
      draftCurriculum: needsCurriculumMigration
        ? this.cloneSnapshot(fallbackSnapshot)
        : this.normalizeSnapshot(group.draftCurriculum, fallbackSnapshot, now),
      publishedCurriculum: needsCurriculumMigration
        ? this.cloneSnapshot(fallbackSnapshot)
        : this.normalizeSnapshot(group.publishedCurriculum, fallbackSnapshot, now),
      hasDraftChanges: needsCurriculumMigration ? false : !!group.hasDraftChanges,
      createdAt: group.createdAt || now,
      updatedAt: group.updatedAt || now,
    };
  }

  private normalizeSnapshot(
    snapshot: GroupCurriculumSnapshot,
    fallback: GroupCurriculumSnapshot,
    now: string,
  ): GroupCurriculumSnapshot {
    return {
      sourceCurriculumId:
        snapshot.sourceCurriculumId || fallback.sourceCurriculumId,
      sourceCurriculumName:
        snapshot.sourceCurriculumName || fallback.sourceCurriculumName,
      version: Math.max(Number(snapshot.version) || fallback.version || 1, 1),
      weeks: this.cloneWeeks(snapshot.weeks || fallback.weeks || []),
      updatedAt: snapshot.updatedAt || now,
      publishedAt: snapshot.publishedAt,
    };
  }

  private cloneSnapshot(
    snapshot: GroupCurriculumSnapshot,
  ): GroupCurriculumSnapshot {
    return {
      ...snapshot,
      weeks: this.cloneWeeks(snapshot.weeks),
    };
  }

  private createSnapshot(
    curriculum: TeacherCurriculum | null,
    version: number,
    updatedAt: string,
    publishedAt?: string,
  ): GroupCurriculumSnapshot {
    return {
      sourceCurriculumId: curriculum?.id || '',
      sourceCurriculumName: curriculum?.name || 'No Curriculum',
      version,
      weeks: this.cloneWeeks(curriculum?.weeks || []),
      updatedAt,
      publishedAt,
    };
  }

  private cloneWeeks(weeks: CurriculumWeek[]): CurriculumWeek[] {
    return weeks.map((week) => ({
      ...week,
      days: (week.days || []).map((day) => ({
        ...day,
        lessonSlots: (day.lessonSlots || []).map((slot) => ({ ...slot })),
      })),
    }));
  }
}
