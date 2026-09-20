import { Injectable } from '@angular/core';
import { AppDiagnosticsService } from '../../../core/diagnostics/app-diagnostics.service';
import { CourseLesson } from '../../lessons/data-access/lesson.models';
import { PlatformStoreService } from '../../shared-data-access/platform-store.service';
import { CurriculumApiService } from './curriculum-api.service';
import {
  CurriculumDay,
  CurriculumLessonSlot,
  CurriculumWeek,
  TeacherCurriculum,
} from './curriculum.models';

@Injectable({ providedIn: 'root' })
export class CurriculumRepository {
  private initializePromise: Promise<TeacherCurriculum[]> | null = null;
  private readonly syncQueues = new Map<string, Promise<TeacherCurriculum>>();

  constructor(
    private storeService: PlatformStoreService,
    private api: CurriculumApiService,
    private diagnostics: AppDiagnosticsService,
  ) {}

  async initializeFromBackend(force = false): Promise<TeacherCurriculum[]> {
    if (!force && this.initializePromise) return this.initializePromise;
    const task = this.loadFromBackend();
    this.initializePromise = task;
    try {
      return await task;
    } finally {
      if (force) this.initializePromise = null;
    }
  }

  getAll(): TeacherCurriculum[] {
    return this.storeService.getStore().curriculums;
  }

  getById(id: string): TeacherCurriculum | null {
    return this.getAll().find((curriculum) => curriculum.id === id) || null;
  }

  create(name: string, description = ''): TeacherCurriculum {
    const curriculum = this.createLocal(name, description, 'draft');
    void this.persistQueued(curriculum, 'create-background').catch(() => undefined);
    return curriculum;
  }

  async createPersisted(name: string, description = ''): Promise<TeacherCurriculum> {
    const curriculum = this.createLocal(name, description, 'draft');
    return this.persistQueued(curriculum, 'create');
  }

  createFromWeeks(
    name: string,
    weeks: CurriculumWeek[],
    description = '',
  ): TeacherCurriculum {
    const curriculum = this.createLocal(name, description, 'ready', weeks);
    void this.persistQueued(curriculum, 'create-from-weeks-background').catch(() => undefined);
    return curriculum;
  }

  save(curriculum: TeacherCurriculum): TeacherCurriculum {
    const nextCurriculum = this.saveLocal(curriculum);
    void this.persistQueued(nextCurriculum, 'save-background').catch(() => undefined);
    return nextCurriculum;
  }

  async savePersisted(curriculum: TeacherCurriculum): Promise<TeacherCurriculum> {
    const nextCurriculum = this.saveLocal(curriculum);
    return this.persistQueued(nextCurriculum, 'save');
  }

  duplicate(curriculumId: string): TeacherCurriculum | null {
    const source = this.getById(curriculumId);
    if (!source) return null;
    return this.createFromWeeks(`${source.name} — Copy`, source.weeks, source.description);
  }

  async duplicatePersisted(curriculumId: string): Promise<TeacherCurriculum | null> {
    const source = this.getById(curriculumId);
    if (!source) return null;
    const copy = this.createLocal(`${source.name} — Copy`, source.description, 'ready', source.weeks);
    return this.persistQueued(copy, 'duplicate');
  }

  archive(curriculumId: string): void {
    const curriculum = this.getById(curriculumId);
    if (!curriculum) return;
    this.save({ ...curriculum, status: 'archived' });
  }

  async archivePersisted(curriculumId: string): Promise<TeacherCurriculum | null> {
    const curriculum = this.getById(curriculumId);
    if (!curriculum) return null;
    return this.savePersisted({ ...curriculum, status: 'archived' });
  }

  async deletePersisted(curriculumId: string): Promise<boolean> {
    const elapsed = this.diagnostics.start('CurriculumRepository', 'deletePersisted', { curriculumId });
    const exists = !!this.getById(curriculumId);
    this.diagnostics.check('CurriculumRepository', 'deletePersisted-local-exists', exists, { curriculumId });
    if (!exists) return false;
    try {
      await this.api.delete(curriculumId);
      const store = this.storeService.getStore();
      const before = store.curriculums.length;
      store.curriculums = store.curriculums.filter((item) => item.id !== curriculumId);
      this.storeService.saveStore(store);
      this.initializePromise = null;
      this.diagnostics.check('CurriculumRepository', 'deletePersisted-cache-removed', store.curriculums.length === before - 1, {
        curriculumId,
        before,
        after: store.curriculums.length,
      });
      this.diagnostics.success('CurriculumRepository', 'deletePersisted', elapsed(), { curriculumId });
      return true;
    } catch (error) {
      this.diagnostics.error('CurriculumRepository', 'deletePersisted:error', error, { curriculumId, durationMs: elapsed() });
      throw error;
    }
  }

  addWeek(curriculum: TeacherCurriculum): TeacherCurriculum {
    const next = this.cloneCurriculum(curriculum);
    next.weeks.push(this.createWeek(next.weeks.length));
    return this.save(next);
  }

  addDay(curriculum: TeacherCurriculum, weekId: string): TeacherCurriculum {
    const next = this.cloneCurriculum(curriculum);
    const week = next.weeks.find((item) => item.id === weekId);
    if (!week) return curriculum;
    week.days.push(this.createDay(week.order, week.days.length));
    return this.save(next);
  }

  addLessonToDay(
    curriculum: TeacherCurriculum,
    weekId: string,
    dayId: string,
    lesson: CourseLesson,
    repetitionCount: number,
    required: boolean,
  ): TeacherCurriculum {
    const next = this.cloneCurriculum(curriculum);
    const day = this.findDay(next, weekId, dayId);
    if (!day) return curriculum;
    day.lessonSlots.push({
      id: this.createId('slot'),
      lessonId: lesson.id,
      repetitionCount: Math.max(1, Number(repetitionCount) || 1),
      required,
      order: day.lessonSlots.length,
    });
    return this.save(next);
  }

  updateLessonSlot(
    curriculum: TeacherCurriculum,
    weekId: string,
    dayId: string,
    slotId: string,
    patch: Pick<CurriculumLessonSlot, 'repetitionCount' | 'required'>,
  ): TeacherCurriculum {
    const next = this.cloneCurriculum(curriculum);
    const slot = this.findDay(next, weekId, dayId)?.lessonSlots.find((item) => item.id === slotId);
    if (!slot) return curriculum;
    slot.repetitionCount = Math.max(1, Number(patch.repetitionCount) || 1);
    slot.required = patch.required;
    return this.save(next);
  }

  replaceLessonSlot(
    curriculum: TeacherCurriculum,
    weekId: string,
    dayId: string,
    slotId: string,
    lessonId: string,
  ): TeacherCurriculum {
    const next = this.cloneCurriculum(curriculum);
    const slot = this.findDay(next, weekId, dayId)?.lessonSlots.find((item) => item.id === slotId);
    if (!slot) return curriculum;
    slot.lessonId = lessonId;
    return this.save(next);
  }

  copyLessonSlot(
    curriculum: TeacherCurriculum,
    sourceWeekId: string,
    sourceDayId: string,
    slotId: string,
    targetWeekId: string,
    targetDayId: string,
  ): TeacherCurriculum {
    const next = this.cloneCurriculum(curriculum);
    const sourceDay = this.findDay(next, sourceWeekId, sourceDayId);
    const targetDay = this.findDay(next, targetWeekId, targetDayId);
    const slot = sourceDay?.lessonSlots.find((item) => item.id === slotId);
    if (!slot || !targetDay) return curriculum;
    targetDay.lessonSlots.push({ ...slot, id: this.createId('slot'), order: targetDay.lessonSlots.length });
    return this.save(next);
  }

  moveLessonSlot(
    curriculum: TeacherCurriculum,
    sourceWeekId: string,
    sourceDayId: string,
    slotId: string,
    targetWeekId: string,
    targetDayId: string,
  ): TeacherCurriculum {
    const next = this.cloneCurriculum(curriculum);
    const sourceDay = this.findDay(next, sourceWeekId, sourceDayId);
    const targetDay = this.findDay(next, targetWeekId, targetDayId);
    const slot = sourceDay?.lessonSlots.find((item) => item.id === slotId);
    if (!slot || !sourceDay || !targetDay) return curriculum;
    sourceDay.lessonSlots = sourceDay.lessonSlots
      .filter((item) => item.id !== slotId)
      .map((item, index) => ({ ...item, order: index }));
    targetDay.lessonSlots.push({ ...slot, order: targetDay.lessonSlots.length });
    return this.save(next);
  }

  removeLessonSlot(
    curriculum: TeacherCurriculum,
    weekId: string,
    dayId: string,
    slotId: string,
  ): TeacherCurriculum {
    const next = this.cloneCurriculum(curriculum);
    const day = this.findDay(next, weekId, dayId);
    if (!day) return curriculum;
    day.lessonSlots = day.lessonSlots
      .filter((slot) => slot.id !== slotId)
      .map((slot, index) => ({ ...slot, order: index }));
    return this.save(next);
  }

  async removeLessonSlotPersisted(
    curriculum: TeacherCurriculum,
    weekId: string,
    dayId: string,
    slotId: string,
  ): Promise<TeacherCurriculum> {
    const elapsed = this.diagnostics.start('CurriculumRepository', 'removeLessonSlotPersisted', {
      curriculumId: curriculum.id,
      weekId,
      dayId,
      slotId,
    });
    const next = this.cloneCurriculum(curriculum);
    const day = this.findDay(next, weekId, dayId);
    if (!day) {
      this.diagnostics.check('CurriculumRepository', 'removeLessonSlotPersisted-day', false, { curriculumId: curriculum.id, weekId, dayId });
      return curriculum;
    }
    const before = day.lessonSlots.length;
    day.lessonSlots = day.lessonSlots
      .filter((slot) => slot.id !== slotId)
      .map((slot, index) => ({ ...slot, order: index }));
    this.diagnostics.check('CurriculumRepository', 'removeLessonSlotPersisted-slot-removed', day.lessonSlots.length === before - 1, {
      curriculumId: curriculum.id,
      before,
      after: day.lessonSlots.length,
    });
    const saved = await this.savePersisted(next);
    this.diagnostics.success('CurriculumRepository', 'removeLessonSlotPersisted', elapsed(), {
      curriculumId: curriculum.id,
      remainingSlots: this.countLessons(saved),
    });
    return saved;
  }

  countLessons(curriculum: TeacherCurriculum): number {
    return curriculum.weeks.reduce(
      (total, week) => total + week.days.reduce((dayTotal, day) => dayTotal + day.lessonSlots.length, 0),
      0,
    );
  }

  private async loadFromBackend(): Promise<TeacherCurriculum[]> {
    const elapsed = this.diagnostics.start('CurriculumRepository', 'initializeFromBackend');
    const store = this.storeService.getStore();
    const legacy = [...store.curriculums];
    try {
      let remote = await this.api.getAll();
      const migrationKey = 'english-shadowing-curriculum-backend-migration-v1';
      if (localStorage.getItem(migrationKey) !== 'done') {
        const remoteIds = new Set(remote.map((item) => item.id));
        let migrated = 0;
        for (const local of legacy) {
          if (!local.id || remoteIds.has(local.id)) continue;
          await this.api.upsert(local);
          migrated += 1;
          this.diagnostics.check('CurriculumRepository', 'legacy-curriculum-migrated', true, {
            curriculumId: local.id,
            name: local.name,
          });
        }
        if (migrated > 0) remote = await this.api.getAll();
        localStorage.setItem(migrationKey, 'done');
        this.diagnostics.success('CurriculumRepository', 'legacy-migration', elapsed(), { migrated });
      }

      store.curriculums = remote.map((item) => this.cloneCurriculum(item));
      this.storeService.saveStore(store);
      this.diagnostics.check('CurriculumRepository', 'backend-authoritative', store.curriculums.length === remote.length, {
        backendCurriculums: remote.length,
        cachedCurriculums: store.curriculums.length,
      });
      this.diagnostics.success('CurriculumRepository', 'initializeFromBackend', elapsed(), {
        curriculums: remote.length,
      });
      return store.curriculums;
    } catch (error) {
      this.diagnostics.error('CurriculumRepository', 'initializeFromBackend:error', error, {
        durationMs: elapsed(),
        localCurriculums: legacy.length,
      });
      throw error;
    }
  }

  private createLocal(
    name: string,
    description: string,
    status: TeacherCurriculum['status'],
    weeks?: CurriculumWeek[],
  ): TeacherCurriculum {
    const store = this.storeService.getStore();
    const now = new Date().toISOString();
    const curriculum: TeacherCurriculum = {
      id: this.createId('curriculum'),
      name: name.trim(),
      description: description.trim(),
      status,
      weeks: weeks ? this.cloneWeeks(weeks) : [this.createWeek(0)],
      createdAt: now,
      updatedAt: now,
    };
    store.curriculums = [curriculum, ...store.curriculums.filter((item) => item.id !== curriculum.id)];
    this.storeService.saveStore(store);
    return curriculum;
  }

  private saveLocal(curriculum: TeacherCurriculum): TeacherCurriculum {
    const store = this.storeService.getStore();
    const index = store.curriculums.findIndex((item) => item.id === curriculum.id);
    const nextCurriculum: TeacherCurriculum = {
      ...curriculum,
      weeks: this.cloneWeeks(curriculum.weeks),
      updatedAt: new Date().toISOString(),
    };
    if (index === -1) store.curriculums = [nextCurriculum, ...store.curriculums];
    else {
      store.curriculums = [...store.curriculums];
      store.curriculums[index] = nextCurriculum;
    }
    this.storeService.saveStore(store);
    return nextCurriculum;
  }

  private persistQueued(curriculum: TeacherCurriculum, operation: string): Promise<TeacherCurriculum> {
    const previous = this.syncQueues.get(curriculum.id) ?? Promise.resolve(curriculum);
    const next = previous
      .catch(() => curriculum)
      .then(async () => {
        const elapsed = this.diagnostics.start('CurriculumRepository', operation, {
          curriculumId: curriculum.id,
          status: curriculum.status,
        });
        try {
          const saved = await this.api.upsert(curriculum);
          this.replaceLocalFromBackend(saved);
          this.diagnostics.check('CurriculumRepository', `${operation}-roundtrip`, saved.id === curriculum.id, {
            curriculumId: curriculum.id,
            backendUpdatedAt: saved.updatedAt,
          });
          this.diagnostics.success('CurriculumRepository', operation, elapsed(), { curriculumId: curriculum.id });
          return saved;
        } catch (error) {
          this.diagnostics.error('CurriculumRepository', `${operation}:error`, error, {
            curriculumId: curriculum.id,
            durationMs: elapsed(),
          });
          throw error;
        }
      });
    this.syncQueues.set(curriculum.id, next);
    void next.finally(() => {
      if (this.syncQueues.get(curriculum.id) === next) this.syncQueues.delete(curriculum.id);
    }).catch(() => undefined);
    return next;
  }

  private replaceLocalFromBackend(curriculum: TeacherCurriculum): void {
    this.initializePromise = null;
    const store = this.storeService.getStore();
    store.curriculums = [
      this.cloneCurriculum(curriculum),
      ...store.curriculums.filter((item) => item.id !== curriculum.id),
    ];
    this.storeService.saveStore(store);
  }

  private createWeek(index: number): CurriculumWeek {
    return {
      id: this.createId('week'),
      name: `Week ${index + 1}`,
      order: index,
      days: [this.createDay(index, 0)],
    };
  }

  private createDay(weekIndex: number, dayIndex: number): CurriculumDay {
    void weekIndex;
    return {
      id: this.createId('day'),
      name: `Day ${dayIndex + 1}`,
      order: dayIndex,
      lessonSlots: [],
    };
  }

  private findDay(curriculum: TeacherCurriculum, weekId: string, dayId: string): CurriculumDay | null {
    return curriculum.weeks.find((week) => week.id === weekId)?.days.find((day) => day.id === dayId) || null;
  }

  private cloneCurriculum(curriculum: TeacherCurriculum): TeacherCurriculum {
    return { ...curriculum, weeks: this.cloneWeeks(curriculum.weeks) };
  }

  private cloneWeeks(weeks: CurriculumWeek[]): CurriculumWeek[] {
    return weeks.map((week) => ({
      ...week,
      days: week.days.map((day) => ({
        ...day,
        lessonSlots: day.lessonSlots.map((slot) => ({ ...slot })),
      })),
    }));
  }

  private createId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}
