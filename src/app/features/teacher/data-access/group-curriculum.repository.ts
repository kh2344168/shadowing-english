import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CourseLesson } from '../../lessons/data-access/lesson.models';
import { PlatformStoreService } from '../../shared-data-access/platform-store.service';
import { CurriculumRepository } from './curriculum.repository';
import { CurriculumLessonSlot } from './curriculum.models';
import { GroupCurriculumApiService } from './group-curriculum-api.service';
import { GroupCurriculumSnapshot } from './group-curriculum.models';
import { StudentRepository } from './student.repository';
import { StudentTrackingApiService } from '../../../core/api/student-tracking-api.service';
import { AppDiagnosticsService } from '../../../core/diagnostics/app-diagnostics.service';
import { TeacherGroup } from './teacher-group.models';

@Injectable({ providedIn: 'root' })
export class GroupCurriculumRepository {
  constructor(
    private storeService: PlatformStoreService,
    private curriculumRepository: CurriculumRepository,
    private groupCurriculumApi: GroupCurriculumApiService,
    private studentRepository: StudentRepository,
    private trackingApi: StudentTrackingApiService,
    private diagnostics: AppDiagnosticsService,
  ) {}

  async initializeFromDatabase(): Promise<void> {
    const groups = this.storeService.getStore().groups;

    for (const group of groups) {
      await this.refreshPublishedForGroup(group.id, true);
    }
  }

  async refreshPublishedForGroup(
    groupId: string,
    seedWhenMissing = false,
  ): Promise<TeacherGroup | null> {
    const localGroup = this.storeService
      .getStore()
      .groups.find((group) => group.id === groupId);

    if (!localGroup) return null;

    try {
      const snapshot = await firstValueFrom(
        this.groupCurriculumApi.getPublished(groupId),
      );
      return this.applyPublishedSnapshot(groupId, snapshot);
    } catch (error) {
      if (
        seedWhenMissing &&
        error instanceof HttpErrorResponse &&
        error.status === 404
      ) {
        try {
          const snapshot = await firstValueFrom(
            this.groupCurriculumApi.publish(
              localGroup.id,
              localGroup.name,
              localGroup.publishedCurriculum,
            ),
          );
          return this.applyPublishedSnapshot(groupId, snapshot);
        } catch (seedError) {
          console.warn(
            '[Group curriculum API] Initial publication failed.',
            seedError,
          );
          return localGroup;
        }
      }

      if (!(error instanceof HttpErrorResponse && error.status === 404)) {
        console.warn(
          '[Group curriculum API] Published curriculum is unavailable.',
          error,
        );
      }

      return localGroup;
    }
  }

  syncDraftFromCurriculum(
    groupId: string,
    curriculumId?: string,
  ): TeacherGroup | null {
    const store = this.storeService.getStore();
    const index = store.groups.findIndex((group) => group.id === groupId);
    if (index === -1) return null;

    const group = this.cloneGroup(store.groups[index]);
    const curriculum = this.curriculumRepository.getById(
      curriculumId || group.curriculumId,
    );
    if (!curriculum) return null;

    const now = new Date().toISOString();
    group.curriculumId = curriculum.id;
    group.curriculumName = curriculum.name;
    group.draftCurriculum = {
      sourceCurriculumId: curriculum.id,
      sourceCurriculumName: curriculum.name,
      version: group.publishedCurriculum.version,
      weeks: curriculum.weeks.map((week) => ({
        ...week,
        days: week.days.map((day) => ({
          ...day,
          lessonSlots: day.lessonSlots.map((slot) => ({ ...slot })),
        })),
      })),
      updatedAt: now,
    };
    group.hasDraftChanges = true;
    group.updatedAt = now;

    store.groups = [...store.groups];
    store.groups[index] = group;
    this.storeService.saveStore(store);
    void this.persistGroupState(group, 'sync-draft-from-curriculum');
    return group;
  }

  addLessonToDraft(
    groupId: string,
    weekId: string,
    dayId: string,
    lesson: CourseLesson,
    repetitionCount: number,
    required: boolean,
  ): TeacherGroup | null {
    return this.updateGroupDraft(groupId, (group) => {
      const day = group.draftCurriculum.weeks
        .find((week) => week.id === weekId)
        ?.days.find((item) => item.id === dayId);

      if (!day) return false;

      day.lessonSlots.push({
        id: this.createId('group-slot'),
        lessonId: lesson.id,
        repetitionCount: Math.max(1, Number(repetitionCount) || 1),
        required,
        order: day.lessonSlots.length,
      });

      return true;
    });
  }

  updateDraftSlot(
    groupId: string,
    weekId: string,
    dayId: string,
    slotId: string,
    repetitionCount: number,
    required: boolean,
  ): TeacherGroup | null {
    return this.updateGroupDraft(groupId, (group) => {
      const slot = this.findDraftSlot(group, weekId, dayId, slotId);
      if (!slot) return false;

      slot.repetitionCount = Math.max(1, Number(repetitionCount) || 1);
      slot.required = required;
      return true;
    });
  }

  removeDraftSlot(
    groupId: string,
    weekId: string,
    dayId: string,
    slotId: string,
  ): TeacherGroup | null {
    return this.updateGroupDraft(groupId, (group) => {
      const day = group.draftCurriculum.weeks
        .find((week) => week.id === weekId)
        ?.days.find((item) => item.id === dayId);

      if (!day) return false;

      const before = day.lessonSlots.length;
      day.lessonSlots = day.lessonSlots
        .filter((slot) => slot.id !== slotId)
        .map((slot, index) => ({ ...slot, order: index }));

      return before !== day.lessonSlots.length;
    });
  }

  replaceDraftSlot(
    groupId: string,
    weekId: string,
    dayId: string,
    slotId: string,
    lessonId: string,
  ): TeacherGroup | null {
    return this.updateGroupDraft(groupId, (group) => {
      const slot = this.findDraftSlot(group, weekId, dayId, slotId);
      if (!slot || !lessonId) return false;

      slot.lessonId = lessonId;
      return true;
    });
  }

  copyDraftSlot(
    groupId: string,
    sourceWeekId: string,
    sourceDayId: string,
    slotId: string,
    targetWeekId: string,
    targetDayId: string,
  ): TeacherGroup | null {
    return this.updateGroupDraft(groupId, (group) => {
      const sourceSlot = this.findDraftSlot(
        group,
        sourceWeekId,
        sourceDayId,
        slotId,
      );
      const targetDay = this.findDraftDay(group, targetWeekId, targetDayId);
      if (!sourceSlot || !targetDay) return false;

      targetDay.lessonSlots.push({
        ...sourceSlot,
        id: this.createId('group-slot'),
        order: targetDay.lessonSlots.length,
      });
      return true;
    });
  }

  moveDraftSlot(
    groupId: string,
    sourceWeekId: string,
    sourceDayId: string,
    slotId: string,
    targetWeekId: string,
    targetDayId: string,
  ): TeacherGroup | null {
    return this.updateGroupDraft(groupId, (group) => {
      const sourceDay = this.findDraftDay(
        group,
        sourceWeekId,
        sourceDayId,
      );
      const targetDay = this.findDraftDay(group, targetWeekId, targetDayId);
      const slot = sourceDay?.lessonSlots.find((item) => item.id === slotId);
      if (!sourceDay || !targetDay || !slot) return false;

      if (
        sourceWeekId === targetWeekId &&
        sourceDayId === targetDayId
      ) {
        return false;
      }

      sourceDay.lessonSlots = sourceDay.lessonSlots
        .filter((item) => item.id !== slotId)
        .map((item, index) => ({ ...item, order: index }));
      targetDay.lessonSlots.push({
        ...slot,
        order: targetDay.lessonSlots.length,
      });
      return true;
    });
  }

  async publish(groupId: string): Promise<TeacherGroup | null> {
    const traceId = `${groupId}-${Date.now()}`;
    console.group(`[PUBLISH][${traceId}] GroupCurriculumRepository.publish`);

    try {
      const store = this.storeService.getStore();
      const index = store.groups.findIndex((group) => group.id === groupId);
      if (index === -1) {
        console.error(`[PUBLISH][${traceId}] Group not found in local store.`, {
          groupId,
          availableGroupIds: store.groups.map((group) => group.id),
        });
        return null;
      }

      const remoteGroups = await this.trackingApi.getGroups();
      const remoteGroup = remoteGroups.find((item) => item.id === groupId);
      if (!remoteGroup) {
        throw new Error(`المجموعة ${groupId} غير موجودة في الـBackend قبل النشر.`);
      }
      let remoteDraft: GroupCurriculumSnapshot | null = null;
      try {
        const parsed = JSON.parse(remoteGroup.draftCurriculumJson || '{}') as GroupCurriculumSnapshot;
        remoteDraft = parsed && Array.isArray(parsed.weeks) ? parsed : null;
      } catch (error) {
        this.diagnostics.error('GroupCurriculumRepository', 'publish-backend-draft-parse:error', error, { groupId });
      }
      if (!remoteDraft) {
        throw new Error('مسودة المجموعة في الـBackend غير صالحة. حدّث المسودة من المنهج ثم حاول النشر.');
      }

      store.groups[index] = {
        ...store.groups[index],
        name: remoteGroup.name,
        curriculumId: remoteGroup.curriculumId || remoteDraft.sourceCurriculumId || store.groups[index].curriculumId,
        curriculumName: remoteGroup.curriculumName || remoteDraft.sourceCurriculumName || store.groups[index].curriculumName,
        draftCurriculum: this.cloneSnapshot(remoteDraft),
        hasDraftChanges: remoteGroup.hasDraftChanges,
        updatedAt: remoteGroup.updatedAtUtc || store.groups[index].updatedAt,
      };
      this.storeService.saveStore(store);
      this.diagnostics.check('GroupCurriculumRepository', 'publish-backend-draft-refreshed', true, {
        groupId,
        backendDraftSlots: this.snapshotSlotIds(remoteDraft).length,
        curriculumId: remoteGroup.curriculumId,
      });

      const group = this.cloneGroup(store.groups[index]);
      const now = new Date().toISOString();
      const nextVersion = Math.max(group.publishedCurriculum.version + 1, 1);

      console.log(`[PUBLISH][${traceId}] Local group before publish`, {
        groupId: group.id,
        groupName: group.name,
        curriculumId: group.curriculumId,
        hasDraftChanges: group.hasDraftChanges,
        currentPublishedVersion: group.publishedCurriculum.version,
        currentPublishedSlots: this.snapshotSlotIds(group.publishedCurriculum),
        draftVersion: group.draftCurriculum.version,
        draftSlots: this.snapshotSlotIds(group.draftCurriculum),
      });

      const candidateSnapshot: GroupCurriculumSnapshot = {
        ...this.cloneSnapshot(group.draftCurriculum),
        version: nextVersion,
        updatedAt: now,
        publishedAt: now,
      };

      const expectedSlots = this.snapshotSlotIds(candidateSnapshot);
      console.log(`[PUBLISH][${traceId}] Candidate snapshot prepared`, {
        requestedVersion: candidateSnapshot.version,
        expectedSlotCount: expectedSlots.length,
        expectedSlots,
        candidateSnapshot,
      });

      console.log(`[PUBLISH][${traceId}] STEP 1/3: PUT published snapshot → Backend`);
      const savedSnapshot = await firstValueFrom(
        this.groupCurriculumApi.publish(
          group.id,
          group.name,
          candidateSnapshot,
        ),
      );
      console.log(`[PUBLISH][${traceId}] STEP 1/3 OK: Backend accepted publish`, {
        savedVersion: savedSnapshot.version,
        savedSlots: this.snapshotSlotIds(savedSnapshot),
      });

      console.log(`[PUBLISH][${traceId}] STEP 2/3: GET published snapshot ← Backend`);
      const persistedSnapshot = await firstValueFrom(
        this.groupCurriculumApi.getPublished(group.id),
      );
      const persistedSlots = this.snapshotSlotIds(persistedSnapshot);
      console.log(`[PUBLISH][${traceId}] STEP 2/3 OK: Fresh DB read verified`, {
        persistedVersion: persistedSnapshot.version,
        persistedSlotCount: persistedSlots.length,
        persistedSlots,
      });

      if (persistedSnapshot.version < savedSnapshot.version) {
        const message = `تعذر تأكيد حفظ النشر في الـBackend. المتوقع الإصدار ${savedSnapshot.version} والمحفوظ ${persistedSnapshot.version}.`;
        console.error(`[PUBLISH][${traceId}] VERSION VERIFY FAILED`, {
          savedVersion: savedSnapshot.version,
          persistedVersion: persistedSnapshot.version,
        });
        throw new Error(message);
      }

      const verification = await firstValueFrom(
        this.groupCurriculumApi.verify(group.id),
      );
      console.log(`[PUBLISH][${traceId}] STEP 3/3: Student visibility verification`, verification);
      if (!verification.isValid) {
        throw new Error(
          `تم حفظ نسخة النشر لكن فحص ظهور الدروس للطالب فشل. Missing=${verification.missingLessonIds.length}, unavailable=${verification.unavailableLessonIds.length}.`,
        );
      }
      if (verification.slotCount !== expectedSlots.length) {
        throw new Error(
          `فشل فحص عدد مواضع الدروس بعد النشر. المتوقع ${expectedSlots.length} والمحفوظ ${verification.slotCount}.`,
        );
      }

      const missingSlots = expectedSlots.filter((slotId) => !persistedSlots.includes(slotId));
      if (missingSlots.length > 0) {
        console.error(`[PUBLISH][${traceId}] SLOT VERIFY FAILED`, {
          expectedSlots,
          persistedSlots,
          missingSlots,
        });
        throw new Error(
          `الـBackend رد بنجاح لكن النسخة المقروءة لا تحتوي ${missingSlots.length} درس/موضع تم نشره. أول موضع مفقود: ${missingSlots[0]}.`,
        );
      }

      console.log(`[PUBLISH][${traceId}] Updating local store from committed backend snapshot.`);
      group.publishedCurriculum = this.cloneSnapshot(persistedSnapshot);
      group.draftCurriculum = this.cloneSnapshot(persistedSnapshot);
      group.hasDraftChanges = false;
      group.updatedAt = persistedSnapshot.updatedAt;

      store.groups = [...store.groups];
      store.groups[index] = group;
      this.storeService.saveStore(store);
      this.studentRepository.syncPublishedProgressForGroup(group);
      await this.persistGroupState(group, `publish:${traceId}`);

      console.log(`[PUBLISH][${traceId}] ✅ PUBLISH COMPLETE`, {
        groupId: group.id,
        publishedVersion: group.publishedCurriculum.version,
        publishedSlots: this.snapshotSlotIds(group.publishedCurriculum),
      });
      return group;
    } catch (error) {
      console.error(`[PUBLISH][${traceId}] ❌ PUBLISH FAILED`, error);
      if (error instanceof HttpErrorResponse) {
        console.error(`[PUBLISH][${traceId}] HTTP ERROR DETAILS`, {
          status: error.status,
          statusText: error.statusText,
          url: error.url,
          message: error.message,
          backendBody: error.error,
        });
      }
      throw error;
    } finally {
      console.groupEnd();
    }
  }

  resetDraft(groupId: string): TeacherGroup | null {
    const store = this.storeService.getStore();
    const index = store.groups.findIndex((group) => group.id === groupId);
    if (index === -1) return null;

    const group = this.cloneGroup(store.groups[index]);
    group.draftCurriculum = this.cloneSnapshot(group.publishedCurriculum);
    group.hasDraftChanges = false;
    group.updatedAt = new Date().toISOString();

    store.groups = [...store.groups];
    store.groups[index] = group;
    this.storeService.saveStore(store);
    void this.persistGroupState(group, 'reset-draft');
    return group;
  }

  saveAsNewCurriculum(
    groupId: string,
    name: string,
  ): string | null {
    const group = this.storeService
      .getStore()
      .groups.find((item) => item.id === groupId);

    if (!group || !name.trim()) return null;

    const curriculum = this.curriculumRepository.createFromWeeks(
      name.trim(),
      group.draftCurriculum.weeks,
      `Saved from ${group.name} group curriculum.`,
    );

    return curriculum.id;
  }

  private updateGroupDraft(
    groupId: string,
    updater: (group: TeacherGroup) => boolean,
  ): TeacherGroup | null {
    const store = this.storeService.getStore();
    const index = store.groups.findIndex((group) => group.id === groupId);
    if (index === -1) return null;

    const group = this.cloneGroup(store.groups[index]);
    if (!updater(group)) return group;

    const now = new Date().toISOString();
    group.draftCurriculum.updatedAt = now;
    group.hasDraftChanges = true;
    group.updatedAt = now;

    store.groups = [...store.groups];
    store.groups[index] = group;
    this.storeService.saveStore(store);
    void this.persistGroupState(group, 'draft-change');
    return group;
  }

  private findDraftSlot(
    group: TeacherGroup,
    weekId: string,
    dayId: string,
    slotId: string,
  ): CurriculumLessonSlot | null {
    return (
      group.draftCurriculum.weeks
        .find((week) => week.id === weekId)
        ?.days.find((day) => day.id === dayId)
        ?.lessonSlots.find((slot) => slot.id === slotId) || null
    );
  }

  private findDraftDay(
    group: TeacherGroup,
    weekId: string,
    dayId: string,
  ) {
    return (
      group.draftCurriculum.weeks
        .find((week) => week.id === weekId)
        ?.days.find((day) => day.id === dayId) || null
    );
  }


  private snapshotSlotIds(snapshot: GroupCurriculumSnapshot): string[] {
    return snapshot.weeks.flatMap((week) =>
      week.days.flatMap((day) => day.lessonSlots.map((slot) => slot.id)),
    );
  }

  private applyPublishedSnapshot(
    groupId: string,
    snapshot: GroupCurriculumSnapshot,
  ): TeacherGroup | null {
    const store = this.storeService.getStore();
    const index = store.groups.findIndex((group) => group.id === groupId);
    if (index === -1) return null;

    const group = this.cloneGroup(store.groups[index]);
    group.publishedCurriculum = this.cloneSnapshot(snapshot);

    if (!group.hasDraftChanges) {
      // When there is no draft, the published snapshot is also the active source
      // curriculum for the group. In that case it is safe to align identity.
      group.draftCurriculum = this.cloneSnapshot(snapshot);
      group.curriculumId = snapshot.sourceCurriculumId || group.curriculumId;
      group.curriculumName = snapshot.sourceCurriculumName || group.curriculumName;
    } else {
      // IMPORTANT: a group may already be linked to a NEW curriculum draft while
      // students are still on the OLD published curriculum. Do not overwrite the
      // draft identity with the old publication during refresh.
      this.diagnostics.check('GroupCurriculumRepository', 'preserve-draft-curriculum-identity', true, {
        groupId,
        draftCurriculumId: group.curriculumId,
        publishedCurriculumId: snapshot.sourceCurriculumId,
      });
    }
    group.updatedAt = snapshot.updatedAt;

    store.groups = [...store.groups];
    store.groups[index] = group;
    this.storeService.saveStore(store);
    this.studentRepository.syncPublishedProgressForGroup(group);
    return group;
  }

  private async persistGroupState(group: TeacherGroup, reason: string): Promise<void> {
    const elapsed = this.diagnostics.start('GroupCurriculumRepository', 'persist-group-state', {
      groupId: group.id,
      reason,
    });
    try {
      await this.trackingApi.upsertGroup({
        id: group.id,
        name: group.name,
        cefrLevel: `${group.name} ${group.curriculumName}`.toUpperCase().match(/\b(A1|A2|B1|B2|C1|C2)\b/)?.[1] || 'A1',
        supervisorId: group.teacherId || '',
        supervisorName: '',
        curriculumId: group.curriculumId || '',
        curriculumName: group.curriculumName || '',
        startDate: group.startDate || '',
        draftCurriculumJson: JSON.stringify(group.draftCurriculum || {}),
        hasDraftChanges: !!group.hasDraftChanges,
      });
      this.diagnostics.success('GroupCurriculumRepository', 'persist-group-state', elapsed(), {
        groupId: group.id,
        reason,
      });
    } catch (error) {
      this.diagnostics.error('GroupCurriculumRepository', 'persist-group-state:error', error, {
        groupId: group.id,
        reason,
        durationMs: elapsed(),
      });
    }
  }

  private cloneGroup(group: TeacherGroup): TeacherGroup {
    return {
      ...group,
      studentIds: [...group.studentIds],
      draftCurriculum: this.cloneSnapshot(group.draftCurriculum),
      publishedCurriculum: this.cloneSnapshot(group.publishedCurriculum),
    };
  }

  private cloneSnapshot(snapshot: TeacherGroup['draftCurriculum']) {
    return {
      ...snapshot,
      weeks: snapshot.weeks.map((week) => ({
        ...week,
        days: week.days.map((day) => ({
          ...day,
          lessonSlots: day.lessonSlots.map((slot) => ({ ...slot })),
        })),
      })),
    };
  }

  private createId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}
