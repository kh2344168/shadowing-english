import { Injectable } from '@angular/core';
import { StudentProgressDto } from '../../../core/api/progress-api.models';
import { PlatformStoreService } from '../../shared-data-access/platform-store.service';
import { TeacherGroupRepository } from './teacher-group.repository';
import { TeacherGroup } from './teacher-group.models';
import {
  StudentAccount,
  StudentCreateResult,
  StudentProgress,
} from './student.models';

@Injectable({ providedIn: 'root' })
export class StudentRepository {
  constructor(
    private storeService: PlatformStoreService,
    private groupRepository: TeacherGroupRepository,
  ) {}

  getStudents(): StudentAccount[] {
    // Student identity is backend-owned. This browser store is only a synchronized
    // compatibility cache; never invent demo students or auto-assign them locally.
    return this.storeService.getStore().students;
  }

  addStudent(
    name: string,
    email: string,
    groupId: string,
  ): StudentCreateResult | null {
    const group = this.groupRepository.getById(groupId);
    if (!group) return null;

    const store = this.storeService.getStore();
    const normalizedEmail = email.trim().toLowerCase();

    if (
      store.students.some(
        (student) => student.email.toLowerCase() === normalizedEmail,
      )
    ) {
      return null;
    }

    const temporaryPassword = this.createTemporaryPassword();
    const student: StudentAccount = {
      id: this.createId('student'),
      name: name.trim(),
      email: normalizedEmail,
      groupId,
      temporaryPassword,
      createdAt: new Date().toISOString(),
    };

    store.students = [...store.students, student];

    store.progress = this.createProgressForPublishedGroup(
      store.progress,
      student.id,
      group,
    );

    this.storeService.saveStore(store);
    this.groupRepository.addStudentToGroup(groupId, student.id);

    return {
      student,
      temporaryPassword,
    };
  }

  moveStudent(studentId: string, targetGroupId: string): boolean {
    const targetGroup = this.groupRepository.getById(targetGroupId);
    if (!targetGroup) return false;

    const store = this.storeService.getStore();
    const studentIndex = store.students.findIndex(
      (student) => student.id === studentId,
    );

    if (studentIndex === -1) return false;

    store.students = [...store.students];
    store.students[studentIndex] = {
      ...store.students[studentIndex],
      groupId: targetGroupId,
    };

    this.storeService.saveStore(store);
    this.groupRepository.addStudentToGroup(targetGroupId, studentId);

    const latestStore = this.storeService.getStore();
    latestStore.progress = this.createProgressForPublishedGroup(
      latestStore.progress,
      studentId,
      targetGroup,
    );
    this.storeService.saveStore(latestStore);
    return true;
  }

  findByEmail(email: string): StudentAccount | null {
    const normalized = email.trim().toLowerCase();
    return (
      this.getStudents().find(
        (student) => student.email.toLowerCase() === normalized,
      ) || null
    );
  }

  findById(studentId: string): StudentAccount | null {
    return this.getStudents().find((student) => student.id === studentId) || null;
  }

  upsertRemoteStudent(student: {
    id: string;
    name: string;
    email: string;
    groupId: string;
    groupName: string;
    cefrLevel?: string;
  }): StudentAccount {
    const group = this.groupRepository.ensureRemoteGroup(
      student.groupId,
      student.groupName,
      student.cefrLevel || 'A1',
    );
    const store = this.storeService.getStore();
    const index = store.students.findIndex((item) => item.id === student.id);
    const value: StudentAccount = {
      id: student.id,
      name: student.name,
      email: student.email.trim().toLowerCase(),
      groupId: group.id,
      temporaryPassword: '',
      createdAt: index === -1 ? new Date().toISOString() : store.students[index].createdAt,
    };
    if (index === -1) store.students.push(value);
    else store.students[index] = value;
    if (!group.studentIds.includes(value.id)) {
      store.groups = store.groups.map((item) =>
        item.id === group.id
          ? { ...item, studentIds: [...item.studentIds, value.id] }
          : item,
      );
    }
    this.storeService.saveStore(store);
    return value;
  }

  applyRemoteProgress(rows: StudentProgressDto[]): void {
    if (rows.length === 0) return;

    const store = this.storeService.getStore();

    for (const row of rows) {
      const existing = store.progress.find(
        (item) =>
          item.studentId === row.studentId &&
          (!item.groupId || item.groupId === row.groupId) &&
          (item.curriculumSlotId === row.curriculumSlotId ||
            (!item.curriculumSlotId && item.lessonId === row.lessonId)),
      );

      const nextRow: StudentProgress = {
        studentId: row.studentId,
        groupId: row.groupId,
        lessonId: row.lessonId,
        curriculumSlotId: row.curriculumSlotId,
        completedRepetitions: row.completedRepetitions,
        requiredRepetitions: row.requiredRepetitions,
        recordingIds: existing?.recordingIds || [],
        recordingCount: Math.max(existing?.recordingCount || 0, row.recordingCount || 0),
        updatedAt: row.updatedAtUtc,
      };

      const index = store.progress.findIndex(
        (item) =>
          item.studentId === row.studentId &&
          (!item.groupId || item.groupId === row.groupId) &&
          (item.curriculumSlotId === row.curriculumSlotId ||
            (!item.curriculumSlotId && item.lessonId === row.lessonId)),
      );

      if (index === -1) {
        store.progress.push(nextRow);
      } else {
        store.progress[index] = nextRow;
      }
    }

    this.storeService.saveStore(store);
  }

  getProgressForLesson(lessonId: string): StudentProgress[] {
    return this.storeService
      .getStore()
      .progress.filter((row) => row.lessonId === lessonId);
  }

  getProgressForStudent(studentId: string): StudentProgress[] {
    return this.storeService
      .getStore()
      .progress.filter((row) => row.studentId === studentId);
  }

  getProgress(
    studentId: string,
    lessonId: string,
    curriculumSlotId?: string,
    groupId?: string,
  ): StudentProgress | null {
    const rows = this.storeService.getStore().progress;
    const belongsToGroup = (row: StudentProgress) =>
      !groupId || !row.groupId || row.groupId === groupId;

    if (curriculumSlotId) {
      const slotProgress = rows.find(
        (row) =>
          row.studentId === studentId &&
          row.lessonId === lessonId &&
          belongsToGroup(row) &&
          row.curriculumSlotId === curriculumSlotId,
      );

      return slotProgress || null;
    }

    return (
      rows.find(
        (row) =>
          row.studentId === studentId &&
          row.lessonId === lessonId &&
          belongsToGroup(row) &&
          !row.curriculumSlotId,
      ) ||
      rows.find(
        (row) =>
          row.studentId === studentId &&
          row.lessonId === lessonId &&
          belongsToGroup(row),
      ) ||
      null
    );
  }

  ensureProgressRowsForLesson(
    lessonId: string,
    requiredRepetitions: number,
  ): void {
    const now = new Date().toISOString();
    const students = this.getStudents();
    const latestStore = this.storeService.getStore();

    for (const student of students) {
      const existing = latestStore.progress.find(
        (row) =>
          row.studentId === student.id &&
          row.lessonId === lessonId &&
          !row.curriculumSlotId,
      );

      latestStore.progress = this.upsertProgress(latestStore.progress, {
        studentId: student.id,
        groupId: student.groupId,
        lessonId,
        completedRepetitions: existing?.completedRepetitions || 0,
        requiredRepetitions,
        recordingIds: existing?.recordingIds || [],
        recordingCount: Math.max(existing?.recordingCount || 0, existing?.recordingIds.length || 0),
        updatedAt: existing?.updatedAt || now,
      });
    }

    this.storeService.saveStore(latestStore);
  }

  ensureProgressRowForCurriculumSlot(
    studentId: string,
    groupId: string,
    lessonId: string,
    curriculumSlotId: string,
    requiredRepetitions: number,
  ): void {
    if (!studentId || !groupId || !lessonId || !curriculumSlotId) return;

    const store = this.storeService.getStore();
    const existing = store.progress.find(
      (row) =>
        row.studentId === studentId &&
        (!row.groupId || row.groupId === groupId) &&
        row.curriculumSlotId === curriculumSlotId,
    );

    const isSameLesson = existing?.lessonId === lessonId;

    store.progress = this.upsertProgress(store.progress, {
      studentId,
      groupId,
      lessonId,
      curriculumSlotId,
      completedRepetitions: isSameLesson
        ? existing?.completedRepetitions || 0
        : 0,
      requiredRepetitions: Math.max(1, requiredRepetitions),
      recordingIds: isSameLesson ? existing?.recordingIds || [] : [],
      recordingCount: isSameLesson
        ? Math.max(existing?.recordingCount || 0, existing?.recordingIds.length || 0)
        : 0,
      updatedAt: isSameLesson
        ? existing?.updatedAt || new Date().toISOString()
        : new Date().toISOString(),
    });

    this.storeService.saveStore(store);
  }

  syncPublishedProgressForGroup(group: TeacherGroup): void {
    const store = this.storeService.getStore();
    const studentIds = store.students
      .filter((student) => student.groupId === group.id)
      .map((student) => student.id);

    for (const studentId of studentIds) {
      store.progress = this.createProgressForPublishedGroup(
        store.progress,
        studentId,
        group,
      );
    }

    this.storeService.saveStore(store);
  }

  getCompletionPercent(
    progress: StudentProgress | null | undefined,
  ): number {
    if (!progress || progress.requiredRepetitions <= 0) return 0;
    return Math.min(
      100,
      Math.round(
        (progress.completedRepetitions / progress.requiredRepetitions) * 100,
      ),
    );
  }

  getStatus(progress: StudentProgress | null | undefined): string {
    if (!progress || progress.completedRepetitions === 0) return 'Not started';
    if (progress.completedRepetitions >= progress.requiredRepetitions) {
      return 'Completed';
    }
    return 'In progress';
  }

  resetTemporaryPassword(studentId: string): string | null {
    const store = this.storeService.getStore();
    const index = store.students.findIndex((student) => student.id === studentId);
    if (index === -1) return null;

    const password = this.createTemporaryPassword();
    store.students = [...store.students];
    store.students[index] = { ...store.students[index], temporaryPassword: password };
    this.storeService.saveStore(store);
    return password;
  }

  deleteStudent(studentId: string): boolean {
    const store = this.storeService.getStore();
    const student = store.students.find((item) => item.id === studentId);
    if (!student) return false;

    store.students = store.students.filter((item) => item.id !== studentId);
    store.progress = store.progress.filter((item) => item.studentId !== studentId);
    store.recordings = store.recordings.filter((item) => item.studentId !== studentId);
    store.groups = store.groups.map((group) => ({
      ...group,
      studentIds: group.studentIds.filter((id) => id !== studentId),
    }));
    this.storeService.saveStore(store);
    return true;
  }

  private createTemporaryPassword(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let password = '';

    for (let index = 0; index < 8; index++) {
      password += alphabet[Math.floor(Math.random() * alphabet.length)];
    }

    return password;
  }

  private createId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  private upsertProgress(
    progress: StudentProgress[],
    row: StudentProgress,
  ): StudentProgress[] {
    const index = progress.findIndex(
      (item) =>
        item.studentId === row.studentId &&
        (row.groupId ? !item.groupId || item.groupId === row.groupId : true) &&
        (row.curriculumSlotId
          ? item.curriculumSlotId === row.curriculumSlotId
          : !item.curriculumSlotId && item.lessonId === row.lessonId),
    );

    if (index === -1) return [...progress, row];

    const next = [...progress];
    next[index] = row;
    return next;
  }

  private createProgressForPublishedGroup(
    progress: StudentProgress[],
    studentId: string,
    group: TeacherGroup,
  ): StudentProgress[] {
    let next = progress;
    const now = new Date().toISOString();
    const publishedSlots = group.publishedCurriculum.weeks.flatMap((week) =>
      week.days.flatMap((day) => day.lessonSlots),
    );

    for (const week of group.publishedCurriculum.weeks) {
      for (const day of week.days) {
        for (const slot of day.lessonSlots) {
          let existing = next.find(
            (row) =>
              row.studentId === studentId &&
              (!row.groupId || row.groupId === group.id) &&
              row.curriculumSlotId === slot.id,
          );

          if (
            !existing &&
            publishedSlots.filter((item) => item.lessonId === slot.lessonId)
              .length === 1
          ) {
            const legacyIndex = next.findIndex(
              (row) =>
                row.studentId === studentId &&
                (!row.groupId || row.groupId === group.id) &&
                row.lessonId === slot.lessonId &&
                !row.curriculumSlotId,
            );

            if (legacyIndex !== -1) {
              next = [...next];
              next[legacyIndex] = {
                ...next[legacyIndex],
                groupId: group.id,
                curriculumSlotId: slot.id,
              };
              existing = next[legacyIndex];
            }
          }

          const isSameLesson = existing?.lessonId === slot.lessonId;

          next = this.upsertProgress(next, {
            studentId,
            groupId: group.id,
            lessonId: slot.lessonId,
            curriculumSlotId: slot.id,
            completedRepetitions: isSameLesson
              ? existing?.completedRepetitions || 0
              : 0,
            requiredRepetitions: Math.max(1, slot.repetitionCount),
            recordingIds: isSameLesson ? existing?.recordingIds || [] : [],
            updatedAt: isSameLesson ? existing?.updatedAt || now : now,
          });
        }
      }
    }

    return next;
  }
}
