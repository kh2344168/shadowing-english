import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  SaveStudentLearningStateRequest,
  StudentLearningStateDto,
} from '../../../core/api/progress-api.models';
import { ProgressApiService } from '../../../core/api/progress-api.service';
import { StudentTrackingApiService } from '../../../core/api/student-tracking-api.service';
import { AppDiagnosticsService } from '../../../core/diagnostics/app-diagnostics.service';
import {
  StudentConversationSummary,
  StudentLessonJourney,
  StudentReviewScheduleItem,
  StudentStageId,
} from './student-learning.models';

interface StudentLearningStore {
  schemaVersion: 2;
  journeys: StudentLessonJourney[];
  reviews: StudentReviewScheduleItem[];
  conversations: StudentConversationSummary[];
}

interface StudentGroupMeta {
  studentName: string;
  groupName: string;
}

@Injectable({ providedIn: 'root' })
export class StudentLearningRepository {
  private readonly storageKey = 'english-shadowing-student-learning-v1';
  private readonly pendingSyncKey = 'english-shadowing-student-learning-pending-v1';
  private readonly reviewIntervals = [1, 3, 7, 14] as const;
  private readonly groupMeta = new Map<string, StudentGroupMeta>();
  private readonly syncChains = new Map<string, Promise<void>>();

  constructor(
    private progressApi: ProgressApiService,
    private trackingApi: StudentTrackingApiService,
    private diagnostics: AppDiagnosticsService,
  ) {}

  /**
   * Loads the student's learning journey from SQL before the student course is rendered.
   * When an older browser has local-only data and the server has no row yet, that data is
   * migrated to the server once instead of being discarded.
   */
  async hydrateFromBackend(
    studentId: string,
    groupId: string,
    studentName: string,
    groupName: string,
  ): Promise<void> {
    const elapsed = this.diagnostics.start('StudentLearning', 'hydrateFromBackend', { studentId, groupId });
    this.diagnostics.check('StudentLearning', 'hydrate-identity', !!studentId && !!groupId, { studentId, groupId });
    if (!studentId || !groupId) {
      this.diagnostics.warn('StudentLearning', 'hydrateFromBackend:skipped-invalid-identity', {
        studentId,
        groupId,
        durationMs: elapsed(),
      });
      return;
    }

    const key = this.groupKey(studentId, groupId);
    this.groupMeta.set(key, { studentName, groupName });
    // A failed optimistic save from a previous session is replayed before reading remote
    // state, otherwise an older remote snapshot could overwrite newer local work.
    if (this.isPending(key)) {
      this.diagnostics.info('StudentLearning', 'hydrateFromBackend:pending-sync-replay', { studentId, groupId });
      const saved = await this.persistGroup(studentId, groupId);
      if (saved) this.clearPending(key);
      this.diagnostics.success('StudentLearning', 'hydrateFromBackend', elapsed(), {
        studentId,
        groupId,
        source: 'pending-local-sync',
        saved,
      });
      return;
    }

    try {
      const remote = await firstValueFrom(
        this.progressApi.getStudentLearningState(studentId, groupId),
      );
      const local = this.readStore();

      if (remote.revision === 0 && this.hasGroupData(local, studentId, groupId)) {
        this.diagnostics.info('StudentLearning', 'hydrateFromBackend:migrating-local-data', {
          studentId,
          groupId,
        });
        this.markPending(key);
        const saved = await this.persistGroup(studentId, groupId);
        if (saved) this.clearPending(key);
        this.diagnostics.success('StudentLearning', 'hydrateFromBackend', elapsed(), {
          studentId,
          groupId,
          source: 'local-migration',
          saved,
        });
        return;
      }

      this.replaceGroupFromRemote(local, remote);
      this.saveStore(local);
      this.diagnostics.success('StudentLearning', 'hydrateFromBackend', elapsed(), {
        studentId, groupId, revision: remote.revision, journeys: remote.journeys.length,
      });
    } catch (error) {
      this.diagnostics.error('StudentLearning', 'hydrateFromBackend:error', error, {
        studentId, groupId, durationMs: elapsed(),
      });
      // Offline/backend failure: keep the last local cache. The next initialize will retry.
    }
  }

  getJourney(
    studentId: string,
    groupId: string,
    curriculumSlotId: string,
  ): StudentLessonJourney | null {
    return (
      this.readStore().journeys.find(
        (item) =>
          item.studentId === studentId &&
          item.groupId === groupId &&
          item.curriculumSlotId === curriculumSlotId,
      ) || null
    );
  }

  completeStage(
    identity: Pick<
      StudentLessonJourney,
      'studentId' | 'groupId' | 'curriculumSlotId' | 'lessonId'
    >,
    stageId: StudentStageId,
    stageOrder: readonly StudentStageId[],
    quizScore?: number,
  ): StudentLessonJourney {
    const store = this.readStore();
    const index = store.journeys.findIndex(
      (item) =>
        item.studentId === identity.studentId &&
        item.groupId === identity.groupId &&
        item.curriculumSlotId === identity.curriculumSlotId,
    );
    const now = new Date().toISOString();
    const normalizedStageOrder = stageOrder.length ? [...stageOrder] : [stageId];
    const current = index === -1
      ? this.createJourney(identity, now, normalizedStageOrder[0])
      : store.journeys[index];
    const completedStages = Array.from(
      new Set<StudentStageId>([...current.completedStages, stageId]),
    );
    const nextStage =
      normalizedStageOrder.find((id) => !completedStages.includes(id)) ||
      normalizedStageOrder[normalizedStageOrder.length - 1];
    const isCompleted = normalizedStageOrder.every((id) => completedStages.includes(id));
    const next: StudentLessonJourney = {
      ...current,
      lessonId: identity.lessonId,
      completedStages,
      currentStage: nextStage,
      updatedAt: now,
      completedAt: isCompleted ? current.completedAt || now : undefined,
      quizScore: quizScore ?? current.quizScore,
    };

    if (index === -1) store.journeys.push(next);
    else store.journeys[index] = next;

    if (isCompleted) this.ensureReviewSchedule(store, next);
    this.saveStore(store);
    this.queueGroupSync(identity.studentId, identity.groupId);
    void this.trackLearningEvent(identity.studentId, identity.groupId, {
      lessonId: identity.lessonId,
      curriculumSlotId: identity.curriculumSlotId,
      stageId,
      eventType: 'stage_completed',
      details: { quizScore: quizScore ?? null, completedStages, lessonCompleted: isCompleted },
    });
    return next;
  }

  getReviews(studentId: string, groupId: string): StudentReviewScheduleItem[] {
    return this.readStore()
      .reviews.filter((item) => item.studentId === studentId && item.groupId === groupId)
      .sort((left, right) => left.dueAt.localeCompare(right.dueAt));
  }

  getJourneys(studentId: string, groupId = ''): StudentLessonJourney[] {
    return this.readStore()
      .journeys.filter(
        (item) => item.studentId === studentId && (!groupId || item.groupId === groupId),
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  getConversationSummaries(studentId: string, groupId = ''): StudentConversationSummary[] {
    return this.readStore()
      .conversations.filter(
        (item) => item.studentId === studentId && (!groupId || item.groupId === groupId),
      )
      .sort((left, right) => right.completedAt.localeCompare(left.completedAt));
  }

  saveConversationSummary(
    summary: Omit<StudentConversationSummary, 'id' | 'completedAt'> &
      Partial<Pick<StudentConversationSummary, 'id' | 'completedAt'>>,
  ): StudentConversationSummary {
    const store = this.readStore();
    const now = summary.completedAt || new Date().toISOString();
    const id = summary.id || `conversation-${summary.curriculumSlotId}-${now}`;
    const value: StudentConversationSummary = {
      ...summary,
      id,
      completedAt: now,
      usedTargetPhrases: Array.from(new Set(summary.usedTargetPhrases || [])),
    };
    const index = store.conversations.findIndex((item) => item.id === id);
    if (index === -1) store.conversations.push(value);
    else store.conversations[index] = value;
    this.saveStore(store);
    this.queueGroupSync(value.studentId, value.groupId);
    void this.trackLearningEvent(value.studentId, value.groupId, {
      lessonId: value.lessonId,
      curriculumSlotId: value.curriculumSlotId,
      stageId: 'ai-conversation',
      eventType: 'conversation_completed',
      details: {
        totalStudentTurns: value.totalStudentTurns,
        acceptedTurns: value.acceptedTurns,
        goodAnswers: value.goodAnswers,
        correctionCount: value.correctionCount,
        textTurns: value.textTurns || 0,
        voiceTurns: value.voiceTurns || 0,
        grammarFocus: value.grammarFocus || [],
        vocabularyFocus: value.vocabularyFocus || [],
        strengths: value.strengths || [],
      },
    });
    return value;
  }

  completeReview(reviewId: string): void {
    const store = this.readStore();
    const index = store.reviews.findIndex((item) => item.id === reviewId);
    if (index === -1) return;
    const current = store.reviews[index];
    store.reviews[index] = {
      ...current,
      status: 'completed',
      completedAt: new Date().toISOString(),
    };
    this.saveStore(store);
    this.queueGroupSync(current.studentId, current.groupId);
    void this.trackLearningEvent(current.studentId, current.groupId, {
      lessonId: current.lessonId,
      curriculumSlotId: current.curriculumSlotId,
      stageId: 'review',
      eventType: 'review_completed',
      details: { reviewId, intervalDays: current.intervalDays },
    });
  }

  private createJourney(
    identity: Pick<
      StudentLessonJourney,
      'studentId' | 'groupId' | 'curriculumSlotId' | 'lessonId'
    >,
    now: string,
    firstStage: StudentStageId,
  ): StudentLessonJourney {
    return {
      ...identity,
      completedStages: [],
      currentStage: firstStage,
      startedAt: now,
      updatedAt: now,
    };
  }

  private ensureReviewSchedule(
    store: StudentLearningStore,
    journey: StudentLessonJourney,
  ): void {
    const anchor = new Date(journey.completedAt || journey.updatedAt);

    for (const intervalDays of this.reviewIntervals) {
      const alreadyExists = store.reviews.some(
        (item) =>
          item.studentId === journey.studentId &&
          item.groupId === journey.groupId &&
          item.curriculumSlotId === journey.curriculumSlotId &&
          item.intervalDays === intervalDays,
      );
      if (alreadyExists) continue;

      const dueAt = new Date(anchor);
      dueAt.setDate(dueAt.getDate() + intervalDays);
      store.reviews.push({
        id: `review-${journey.curriculumSlotId}-${intervalDays}`,
        studentId: journey.studentId,
        groupId: journey.groupId,
        curriculumSlotId: journey.curriculumSlotId,
        lessonId: journey.lessonId,
        intervalDays,
        dueAt: dueAt.toISOString(),
        status: 'scheduled',
      });
    }
  }

  private queueGroupSync(studentId: string, groupId: string): void {
    if (!this.progressApi || !studentId || !groupId) return;
    const key = this.groupKey(studentId, groupId);
    this.markPending(key);

    const previous = this.syncChains.get(key) || Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        const saved = await this.persistGroup(studentId, groupId);
        if (saved) this.clearPending(key);
      });

    this.syncChains.set(key, next);
    void next.finally(() => {
      if (this.syncChains.get(key) === next) this.syncChains.delete(key);
    });
  }

  private async persistGroup(studentId: string, groupId: string): Promise<boolean> {
    if (!this.progressApi) return false;
    const store = this.readStore();
    const key = this.groupKey(studentId, groupId);
    const meta = this.groupMeta.get(key);
    const request: SaveStudentLearningStateRequest = {
      schemaVersion: 2,
      studentId,
      studentName: meta?.studentName || studentId,
      groupId,
      groupName: meta?.groupName || groupId,
      journeys: store.journeys
        .filter((item) => item.studentId === studentId && item.groupId === groupId)
        .map((item) => ({ ...item })),
      reviews: store.reviews
        .filter((item) => item.studentId === studentId && item.groupId === groupId)
        .map((item) => ({ ...item })),
      conversations: store.conversations
        .filter((item) => item.studentId === studentId && item.groupId === groupId)
        .map((item) => ({ ...item })),
    };

    try {
      const remote = await firstValueFrom(
        this.progressApi.saveStudentLearningState(request),
      );
      const latest = this.readStore();
      this.replaceGroupFromRemote(latest, remote);
      this.saveStore(latest);
      return true;
    } catch {
      return false;
    }
  }

  private replaceGroupFromRemote(
    store: StudentLearningStore,
    remote: StudentLearningStateDto,
  ): void {
    const belongsToRemoteGroup = (studentId: string, groupId: string) =>
      studentId === remote.studentId && groupId === remote.groupId;

    store.journeys = [
      ...store.journeys.filter(
        (item) => !belongsToRemoteGroup(item.studentId, item.groupId),
      ),
      ...(remote.journeys || []).map((item) => ({
        ...item,
        completedAt: item.completedAt || undefined,
        quizScore: item.quizScore ?? undefined,
      })),
    ];
    store.reviews = [
      ...store.reviews.filter(
        (item) => !belongsToRemoteGroup(item.studentId, item.groupId),
      ),
      ...(remote.reviews || []).map((item) => ({
        ...item,
        completedAt: item.completedAt || undefined,
      })),
    ];
    store.conversations = [
      ...store.conversations.filter(
        (item) => !belongsToRemoteGroup(item.studentId, item.groupId),
      ),
      ...(remote.conversations || []).map((item) => ({
        ...item,
        usedTargetPhrases: [...(item.usedTargetPhrases || [])],
        grammarFocus: [...(item.grammarFocus || [])],
        vocabularyFocus: [...(item.vocabularyFocus || [])],
        strengths: [...(item.strengths || [])],
      })),
    ];
  }

  private hasGroupData(
    store: StudentLearningStore,
    studentId: string,
    groupId: string,
  ): boolean {
    return (
      store.journeys.some((item) => item.studentId === studentId && item.groupId === groupId) ||
      store.reviews.some((item) => item.studentId === studentId && item.groupId === groupId) ||
      store.conversations.some((item) => item.studentId === studentId && item.groupId === groupId)
    );
  }

  private async trackLearningEvent(
    studentId: string,
    groupId: string,
    event: {
      lessonId: string;
      curriculumSlotId: string;
      stageId: string;
      eventType: string;
      details: Record<string, unknown>;
    },
  ): Promise<void> {
    const meta = this.groupMeta.get(this.groupKey(studentId, groupId));
    await this.trackingApi.trackEvent({
      studentId,
      studentName: meta?.studentName || studentId,
      groupId,
      groupName: meta?.groupName || groupId,
      cefrLevel: 'A1',
      lessonId: event.lessonId,
      lessonTitle: event.lessonId,
      curriculumSlotId: event.curriculumSlotId,
      stageId: event.stageId,
      eventType: event.eventType,
      status: 'success',
      detailsJson: JSON.stringify(event.details),
      occurredAtUtc: new Date().toISOString(),
      correlationId: `${event.eventType}-${studentId}-${Date.now()}`,
    });
  }

  private groupKey(studentId: string, groupId: string): string {
    return `${studentId}::${groupId}`;
  }

  private getPendingKeys(): string[] {
    try {
      const parsed = JSON.parse(localStorage.getItem(this.pendingSyncKey) || '[]');
      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }

  private isPending(key: string): boolean {
    return this.getPendingKeys().includes(key);
  }

  private markPending(key: string): void {
    const keys = new Set(this.getPendingKeys());
    keys.add(key);
    localStorage.setItem(this.pendingSyncKey, JSON.stringify([...keys]));
  }

  private clearPending(key: string): void {
    const keys = this.getPendingKeys().filter((item) => item !== key);
    localStorage.setItem(this.pendingSyncKey, JSON.stringify(keys));
  }

  private readStore(): StudentLearningStore {
    try {
      const parsed = JSON.parse(
        localStorage.getItem(this.storageKey) || '',
      ) as {
        schemaVersion?: number;
        journeys?: StudentLessonJourney[];
        reviews?: StudentReviewScheduleItem[];
        conversations?: StudentConversationSummary[];
      };
      if (parsed.schemaVersion === 2) {
        return {
          schemaVersion: 2,
          journeys: Array.isArray(parsed.journeys) ? parsed.journeys : [],
          reviews: Array.isArray(parsed.reviews) ? parsed.reviews : [],
          conversations: Array.isArray(parsed.conversations) ? parsed.conversations : [],
        };
      }
      if (parsed.schemaVersion === 1) {
        return {
          schemaVersion: 2,
          journeys: Array.isArray(parsed.journeys) ? parsed.journeys : [],
          reviews: Array.isArray(parsed.reviews) ? parsed.reviews : [],
          conversations: [],
        };
      }
    } catch {
      // Invalid or missing cache starts with a clean versioned store.
    }

    return { schemaVersion: 2, journeys: [], reviews: [], conversations: [] };
  }

  private saveStore(store: StudentLearningStore): void {
    localStorage.setItem(this.storageKey, JSON.stringify(store));
  }
}
