import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { StudentTrackingApiService } from '../../../core/api/student-tracking-api.service';
import { AppDiagnosticsService } from '../../../core/diagnostics/app-diagnostics.service';
import { PlatformStoreService } from '../../shared-data-access/platform-store.service';
import { CurriculumRepository } from './curriculum.repository';
import { GroupCurriculumSnapshot } from './group-curriculum.models';
import { GroupCurriculumApiService } from './group-curriculum-api.service';
import { StudentAccount } from './student.models';
import { TeacherGroup } from './teacher-group.models';

@Injectable({ providedIn: 'root' })
export class TeacherGroupRepository {
  constructor(
    private storeService: PlatformStoreService,
    private curriculumRepository: CurriculumRepository,
    private groupCurriculumApi: GroupCurriculumApiService,
    private trackingApi: StudentTrackingApiService,
    private diagnostics: AppDiagnosticsService,
  ) {}


  async initializeFromBackend(): Promise<TeacherGroup[]> {
    const elapsed = this.diagnostics.start('TeacherGroupRepository', 'initializeFromBackend');
    const store = this.storeService.getStore();
    const legacyGroups = [...store.groups];
    const legacyStudents = [...store.students];

    try {
      let remoteGroups = await this.trackingApi.getGroups();
      let remoteStudents: any[] = [];
      let canReadStudents = true;
      try {
        remoteStudents = await this.trackingApi.getStudents();
      } catch (error: any) {
        canReadStudents = false;
        this.diagnostics.warn('TeacherGroupRepository', 'student-directory-unavailable-for-role', {
          status: error?.status ?? null,
        });
      }

      const migrationKey = 'english-shadowing-backend-directory-migration-v3';
      const migrationDone = localStorage.getItem(migrationKey) === 'done';
      if (!migrationDone && canReadStudents) {
        const remoteById = new Map(remoteGroups.map((group) => [group.id, group]));
        let migratedGroups = 0;
        let enrichedGroups = 0;
        for (const local of legacyGroups) {
          const remote = remoteById.get(local.id);
          const remoteHasCurriculumMetadata = !!remote?.curriculumId && !!this.parseDraft(remote.draftCurriculumJson);
          if (remoteHasCurriculumMetadata) {
            this.diagnostics.check('TeacherGroupRepository', 'legacy-group-already-complete', true, {
              groupId: local.id,
              curriculumId: remote.curriculumId,
            });
            continue;
          }

          await this.trackingApi.upsertGroup(this.toBackendGroupRequest(local));
          if (remote) enrichedGroups += 1;
          else migratedGroups += 1;
          this.diagnostics.check('TeacherGroupRepository', remote ? 'legacy-group-enriched' : 'legacy-group-migrated', true, {
            groupId: local.id,
            curriculumId: local.curriculumId,
          });
          try {
            const slotCount = local.publishedCurriculum.weeks.reduce(
              (total, week) => total + week.days.reduce((dayTotal, day) => dayTotal + day.lessonSlots.length, 0),
              0,
            );
            if (slotCount > 0 && local.publishedCurriculum.sourceCurriculumId) {
              let publicationExists = false;
              try {
                await firstValueFrom(this.groupCurriculumApi.getPublished(local.id));
                publicationExists = true;
              } catch (readError: any) {
                if (readError?.status !== 404) throw readError;
              }
              if (!publicationExists) {
                await firstValueFrom(this.groupCurriculumApi.publish(
                  local.id,
                  local.name,
                  local.publishedCurriculum,
                ));
                this.diagnostics.info('TeacherGroupRepository', 'legacy-publication-migrated', {
                  groupId: local.id,
                  slotCount,
                });
              } else {
                this.diagnostics.check('TeacherGroupRepository', 'legacy-publication-preserved', true, {
                  groupId: local.id,
                  reason: 'backend publication already exists',
                });
              }
            }
          } catch (error) {
            this.diagnostics.warn('TeacherGroupRepository', 'legacy-publication-migration-skipped', {
              groupId: local.id,
              reason: error instanceof Error ? error.message : 'publish failed',
            });
          }
        }
        if (migratedGroups > 0 || enrichedGroups > 0) remoteGroups = await this.trackingApi.getGroups();

        let migratedStudents = 0;
        if (canReadStudents) {
          const remoteIdsOrEmails = new Set(remoteStudents.flatMap((student: any) => [student.id, student.email.toLowerCase()]));
          const remoteGroupIds = new Set(remoteGroups.map((group) => group.id));
          for (const local of legacyStudents) {
            if (!local.id || !local.email || !remoteGroupIds.has(local.groupId)) continue;
            if (remoteIdsOrEmails.has(local.id) || remoteIdsOrEmails.has(local.email.toLowerCase())) continue;
            const group = remoteGroups.find((item) => item.id === local.groupId);
            await this.trackingApi.importLegacyStudent({
              id: local.id,
              name: local.name,
              email: local.email,
              groupId: local.groupId,
              cefrLevel: group?.cefrLevel || 'A1',
              temporaryPassword: local.temporaryPassword || '123456',
              createdAtUtc: local.createdAt || null,
            });
            migratedStudents += 1;
          }
          if (migratedStudents > 0) remoteStudents = await this.trackingApi.getStudents();
        }

        localStorage.setItem(migrationKey, 'done');
        this.diagnostics.success('TeacherGroupRepository', 'legacy-directory-migration', elapsed(), {
          migratedGroups,
          enrichedGroups,
          migratedStudents,
          canReadStudents,
        });
      }

      const previousById = new Map(legacyGroups.map((group) => [group.id, group]));
      const now = new Date().toISOString();
      const nextGroups = remoteGroups.map((remote) => {
        const previous = previousById.get(remote.id);
        const draft = this.parseDraft(remote.draftCurriculumJson) || previous?.draftCurriculum || {
          sourceCurriculumId: remote.curriculumId || '',
          sourceCurriculumName: remote.curriculumName || `${remote.cefrLevel} Curriculum`,
          version: 0,
          weeks: [],
          updatedAt: remote.updatedAtUtc || now,
        };
        const published = previous?.publishedCurriculum || this.cloneSnapshot(draft);
        const studentIds = canReadStudents
          ? remoteStudents.filter((student: any) => student.groupId === remote.id).map((student: any) => student.id)
          : previous?.studentIds || [];
        return {
          id: remote.id,
          name: remote.name,
          teacherId: remote.supervisorId || '',
          curriculumId: remote.curriculumId || draft.sourceCurriculumId || '',
          curriculumName: remote.curriculumName || draft.sourceCurriculumName || `${remote.cefrLevel} Curriculum`,
          startDate: remote.startDate || now.slice(0, 10),
          studentIds,
          draftCurriculum: this.cloneSnapshot(draft),
          publishedCurriculum: this.cloneSnapshot(published),
          hasDraftChanges: remote.hasDraftChanges,
          createdAt: previous?.createdAt || now,
          updatedAt: remote.updatedAtUtc || now,
        } satisfies TeacherGroup;
      });

      store.groups = nextGroups;
      if (canReadStudents) {
        const previousStudents = new Map(legacyStudents.map((student) => [student.id, student]));
        store.students = remoteStudents.map((student: any) => ({
          id: student.id,
          name: student.name,
          email: student.email,
          groupId: student.groupId,
          temporaryPassword: previousStudents.get(student.id)?.temporaryPassword || '',
          createdAt: student.createdAtUtc || now,
        }));
      }
      this.storeService.saveStore(store);
      this.diagnostics.check('TeacherGroupRepository', 'backend-authoritative-groups', nextGroups.length === remoteGroups.length, {
        backendGroups: remoteGroups.length,
        cachedGroups: nextGroups.length,
      });
      this.diagnostics.success('TeacherGroupRepository', 'initializeFromBackend', elapsed(), {
        groups: nextGroups.length,
        students: canReadStudents ? remoteStudents.length : null,
      });
      return nextGroups;
    } catch (error) {
      this.diagnostics.error('TeacherGroupRepository', 'initializeFromBackend:error', error, {
        durationMs: elapsed(),
      });
      throw error;
    }
  }

  getGroups(): TeacherGroup[] {
    // Browser storage is only a synchronized cache. Creation/membership identity is
    // owned by SQL and initializeFromBackend() replaces this array from the server.
    return this.storeService.getStore().groups;
  }

  getById(groupId: string): TeacherGroup | null {
    return this.getGroups().find((group) => group.id === groupId) || null;
  }

  async deleteGroupPersisted(groupId: string): Promise<boolean> {
    const elapsed = this.diagnostics.start('TeacherGroupRepository', 'deleteGroupPersisted', { groupId });
    const exists = !!this.getById(groupId);
    this.diagnostics.check('TeacherGroupRepository', 'deleteGroupPersisted-local-exists', exists, { groupId });
    if (!exists) return false;
    try {
      await this.trackingApi.deleteGroup(groupId);
      const store = this.storeService.getStore();
      const before = store.groups.length;
      store.groups = store.groups.filter((item) => item.id !== groupId);
      this.storeService.saveStore(store);
      this.diagnostics.check('TeacherGroupRepository', 'deleteGroupPersisted-cache-removed', store.groups.length === before - 1, {
        groupId,
        before,
        after: store.groups.length,
      });
      this.diagnostics.success('TeacherGroupRepository', 'deleteGroupPersisted', elapsed(), { groupId });
      return true;
    } catch (error) {
      this.diagnostics.error('TeacherGroupRepository', 'deleteGroupPersisted:error', error, { groupId, durationMs: elapsed() });
      throw error;
    }
  }

  async createGroup(
    name: string,
    curriculumId: string,
    startDate: string,
    teacherId = '',
  ): Promise<TeacherGroup | null> {
    const curriculum = this.curriculumRepository.getById(curriculumId);
    if (!curriculum || !name.trim()) return null;

    const now = new Date().toISOString();
    const snapshot = this.createSnapshot(curriculum.id, curriculum.name, curriculum.weeks, 1, now, now);
    const group: TeacherGroup = {
      id: this.createId('group'),
      teacherId,
      name: name.trim(),
      curriculumId: curriculum.id,
      curriculumName: curriculum.name,
      startDate,
      studentIds: [],
      draftCurriculum: this.cloneSnapshot(snapshot),
      publishedCurriculum: {
        sourceCurriculumId: curriculum.id,
        sourceCurriculumName: curriculum.name,
        version: 0,
        weeks: [],
        updatedAt: now,
      },
      hasDraftChanges: true,
      createdAt: now,
      updatedAt: now,
    };

    const elapsed = this.diagnostics.start('TeacherGroupRepository', 'createGroup-backend', { groupId: group.id });
    await this.trackingApi.upsertGroup(this.toBackendGroupRequest(group));
    const store = this.storeService.getStore();
    store.groups = [group, ...store.groups.filter((item) => item.id !== group.id)];
    this.storeService.saveStore(store);
    this.diagnostics.success('TeacherGroupRepository', 'createGroup-backend', elapsed(), { groupId: group.id });
    return group;
  }

  saveGroup(group: TeacherGroup, syncBackend = true): TeacherGroup {
    const store = this.storeService.getStore();
    const index = store.groups.findIndex((item) => item.id === group.id);
    const nextGroup = {
      ...group,
      updatedAt: new Date().toISOString(),
    };

    if (index === -1) {
      store.groups = [nextGroup, ...store.groups];
    } else {
      store.groups = [...store.groups];
      store.groups[index] = nextGroup;
    }

    this.storeService.saveStore(store);
    if (syncBackend) void this.syncTrackingGroup(nextGroup);
    return nextGroup;
  }

  getStudentsForGroup(groupId: string): StudentAccount[] {
    const store = this.storeService.getStore();
    return store.students.filter((student) => student.groupId === groupId);
  }

  changeCurriculum(
    groupId: string,
    curriculumId: string,
    syncBackend = true,
  ): TeacherGroup | null {
    const group = this.getById(groupId);
    const curriculum = this.curriculumRepository.getById(curriculumId);

    if (!group || !curriculum) return null;

    const now = new Date().toISOString();
    const nextVersion = Math.max(group.publishedCurriculum.version + 1, 1);
    const snapshot = this.createSnapshot(
      curriculum.id,
      curriculum.name,
      curriculum.weeks,
      nextVersion,
      now,
      now,
    );

    const updatedGroup = this.saveGroup({
      ...group,
      curriculumId: curriculum.id,
      curriculumName: curriculum.name,
      draftCurriculum: this.cloneSnapshot(snapshot),
      hasDraftChanges: true,
    }, syncBackend);

    this.diagnostics.info('TeacherGroupRepository', 'changeCurriculum:draft-only', {
      groupId,
      curriculumId: curriculum.id,
      publishedVersion: group.publishedCurriculum.version,
    });
    return updatedGroup;
  }

  async changeCurriculumPersisted(
    groupId: string,
    curriculumId: string,
  ): Promise<TeacherGroup | null> {
    const elapsed = this.diagnostics.start('TeacherGroupRepository', 'changeCurriculumPersisted', {
      groupId,
      curriculumId,
    });
    const updated = this.changeCurriculum(groupId, curriculumId, false);
    if (!updated) {
      this.diagnostics.check('TeacherGroupRepository', 'changeCurriculumPersisted-local', false, { groupId, curriculumId });
      return null;
    }
    try {
      const remote = await this.trackingApi.upsertGroup(this.toBackendGroupRequest(updated));
      this.diagnostics.check('TeacherGroupRepository', 'changeCurriculumPersisted-backend', remote.curriculumId === curriculumId, {
        groupId,
        expectedCurriculumId: curriculumId,
        backendCurriculumId: remote.curriculumId,
      });
      this.diagnostics.success('TeacherGroupRepository', 'changeCurriculumPersisted', elapsed(), { groupId, curriculumId });
      return this.getById(groupId);
    } catch (error) {
      this.diagnostics.error('TeacherGroupRepository', 'changeCurriculumPersisted:error', error, {
        groupId,
        curriculumId,
        durationMs: elapsed(),
      });
      throw error;
    }
  }

  addStudentToGroup(groupId: string, studentId: string): void {
    const store = this.storeService.getStore();

    store.groups = store.groups.map((group) => ({
      ...group,
      studentIds:
        group.id === groupId
          ? Array.from(new Set([...group.studentIds, studentId]))
          : group.studentIds.filter((id) => id !== studentId),
      updatedAt:
        group.id === groupId || group.studentIds.includes(studentId)
          ? new Date().toISOString()
          : group.updatedAt,
    }));

    this.storeService.saveStore(store);
  }

  removeStudentFromGroup(groupId: string, studentId: string): void {
    const store = this.storeService.getStore();
    const group = store.groups.find((item) => item.id === groupId);
    if (!group) return;

    group.studentIds = group.studentIds.filter((id) => id !== studentId);
    group.updatedAt = new Date().toISOString();
    this.storeService.saveStore(store);
  }

  private createSnapshot(
    sourceCurriculumId: string,
    sourceCurriculumName: string,
    weeks: TeacherGroup['publishedCurriculum']['weeks'],
    version: number,
    updatedAt: string,
    publishedAt?: string,
  ): GroupCurriculumSnapshot {
    return {
      sourceCurriculumId,
      sourceCurriculumName,
      version,
      weeks: weeks.map((week) => ({
        ...week,
        days: week.days.map((day) => ({
          ...day,
          lessonSlots: day.lessonSlots.map((slot) => ({ ...slot })),
        })),
      })),
      updatedAt,
      publishedAt,
    };
  }

  private cloneSnapshot(
    snapshot: GroupCurriculumSnapshot,
  ): GroupCurriculumSnapshot {
    return this.createSnapshot(
      snapshot.sourceCurriculumId,
      snapshot.sourceCurriculumName,
      snapshot.weeks,
      snapshot.version,
      snapshot.updatedAt,
      snapshot.publishedAt,
    );
  }

  ensureRemoteGroup(groupId: string, groupName: string, cefrLevel = 'A1'): TeacherGroup {
    const existing = this.getById(groupId);
    if (existing) return existing;

    const now = new Date().toISOString();
    const emptySnapshot: GroupCurriculumSnapshot = {
      sourceCurriculumId: '',
      sourceCurriculumName: `${cefrLevel} Curriculum`,
      version: 0,
      weeks: [],
      updatedAt: now,
    };
    const group: TeacherGroup = {
      id: groupId,
      name: groupName || groupId,
      teacherId: '',
      curriculumId: '',
      curriculumName: emptySnapshot.sourceCurriculumName,
      startDate: now.slice(0, 10),
      studentIds: [],
      draftCurriculum: this.cloneSnapshot(emptySnapshot),
      publishedCurriculum: this.cloneSnapshot(emptySnapshot),
      hasDraftChanges: false,
      createdAt: now,
      updatedAt: now,
    };
    const store = this.storeService.getStore();
    store.groups = [group, ...store.groups.filter((item) => item.id !== groupId)];
    this.storeService.saveStore(store);
    this.diagnostics.info('TeacherGroupRepository', 'ensureRemoteGroup:local-cache-created', {
      groupId,
      groupName: group.name,
      cefrLevel,
    });
    return group;
  }

  private async syncTrackingGroup(group: TeacherGroup): Promise<void> {
    const elapsed = this.diagnostics.start('TeacherGroupRepository', 'syncTrackingGroup', {
      groupId: group.id, groupName: group.name,
    });
    try {
      await this.trackingApi.upsertGroup(this.toBackendGroupRequest(group));
      this.diagnostics.success('TeacherGroupRepository', 'syncTrackingGroup', elapsed(), { groupId: group.id });
    } catch (error) {
      this.diagnostics.error('TeacherGroupRepository', 'syncTrackingGroup:error', error, {
        groupId: group.id, durationMs: elapsed(),
      });
    }
  }

  private toBackendGroupRequest(group: TeacherGroup) {
    return {
      id: group.id,
      name: group.name,
      cefrLevel: this.detectLevel(`${group.name} ${group.curriculumName}`),
      supervisorId: group.teacherId || '',
      supervisorName: '',
      curriculumId: group.curriculumId || '',
      curriculumName: group.curriculumName || '',
      startDate: group.startDate || '',
      draftCurriculumJson: JSON.stringify(group.draftCurriculum || {}),
      hasDraftChanges: !!group.hasDraftChanges,
    };
  }

  private parseDraft(value: string): GroupCurriculumSnapshot | null {
    if (!value) return null;
    try {
      const parsed = JSON.parse(value) as GroupCurriculumSnapshot;
      return parsed && Array.isArray(parsed.weeks) ? parsed : null;
    } catch {
      return null;
    }
  }

  private detectLevel(value: string): string {
    return value.toUpperCase().match(/\b(A1|A2|B1|B2|C1|C2)\b/)?.[1] || 'A1';
  }

  private createId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  private async publishGroupSnapshot(group: TeacherGroup): Promise<void> {
    try {
      await firstValueFrom(
        this.groupCurriculumApi.publish(
          group.id,
          group.name,
          group.publishedCurriculum,
        ),
      );
    } catch (error) {
      console.warn(
        '[Group curriculum API] Group publication will retry later.',
        error,
      );
    }
  }
}
