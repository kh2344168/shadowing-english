import { Injectable } from '@angular/core';
import { IndexedDbService } from '../../../core/storage/indexed-db.service';
import { StudentTrackingApiService } from '../../../core/api/student-tracking-api.service';
import { AppDiagnosticsService } from '../../../core/diagnostics/app-diagnostics.service';
import { LessonRepository } from '../../lessons/data-access/lesson.repository';
import { PlatformStoreService } from '../../shared-data-access/platform-store.service';
import { RecordingMeta } from './recording.models';

@Injectable({ providedIn: 'root' })
export class RecordingRepository {
  constructor(
    private storeService: PlatformStoreService,
    private indexedDb: IndexedDbService,
    private trackingApi: StudentTrackingApiService,
    private lessons: LessonRepository,
    private diagnostics: AppDiagnosticsService,
  ) {}

  getByLessonAndStudent(
    lessonId: string,
    studentId: string,
    curriculumSlotId?: string,
    groupId?: string,
  ): RecordingMeta[] {
    return this.storeService
      .getStore()
      .recordings
      .filter(
        (recording) =>
          recording.lessonId === lessonId &&
          recording.studentId === studentId &&
          (!groupId || !recording.groupId || recording.groupId === groupId) &&
          (curriculumSlotId
            ? recording.curriculumSlotId === curriculumSlotId
            : !recording.curriculumSlotId),
      );
  }

  async saveRecording(meta: RecordingMeta, blob: Blob): Promise<void> {
    const elapsed = this.diagnostics.start('RecordingRepository', 'saveRecording', {
      recordingId: meta.id, studentId: meta.studentId, lessonId: meta.lessonId, sizeBytes: blob.size,
    });
    this.diagnostics.check('RecordingRepository', 'recording-input', blob.size > 0 && !!meta.studentId && !!meta.groupId, {
      recordingId: meta.id, studentId: meta.studentId, groupId: meta.groupId, sizeBytes: blob.size,
    });
    const store = this.storeService.getStore();
    store.recordings = [...store.recordings, meta];

    const progress = store.progress.find(
      (row) =>
        row.studentId === meta.studentId &&
        row.lessonId === meta.lessonId &&
        (!meta.groupId || !row.groupId || row.groupId === meta.groupId) &&
        (meta.curriculumSlotId
          ? row.curriculumSlotId === meta.curriculumSlotId
          : !row.curriculumSlotId),
    );
    if (progress && meta.countsTowardProgress !== false) {
      progress.recordingIds = [...progress.recordingIds, meta.id];
      progress.recordingCount = Math.max(
        progress.recordingCount || 0,
        progress.recordingIds.length,
      );
      progress.completedRepetitions = Math.max(progress.completedRepetitions, meta.repetitionTo);
      progress.updatedAt = new Date().toISOString();
    }

    this.storeService.saveStore(store);
    await this.indexedDb.putBlob(`recording-${meta.id}`, blob);

    const lesson = this.lessons.getById(meta.lessonId);
    const remote = await this.trackingApi.uploadRecording({
      studentId: meta.studentId,
      groupId: meta.groupId || '',
      lessonId: meta.lessonId,
      lessonTitle: lesson?.title || meta.lessonId,
      curriculumSlotId: meta.curriculumSlotId || '',
      stageId: 'shadowing',
      recordingType: meta.countsTowardProgress === false ? 'shadowing-review' : 'shadowing',
      clientRecordingId: meta.id,
      attemptNumber: Math.max(1, meta.repetitionTo),
      durationMs: this.durationLabelToMs(meta.durationLabel),
    }, blob);

    if (remote) {
      // The recording itself is already persisted remotely at this point. Analytics must
      // not add another network round-trip to the student's "saving" pause between reps.
      void this.trackingApi.trackEvent({
        studentId: meta.studentId,
        studentName: meta.studentId,
        groupId: meta.groupId || '',
        groupName: meta.groupId || '',
        cefrLevel: 'A1',
        lessonId: meta.lessonId,
        lessonTitle: lesson?.title || meta.lessonId,
        curriculumSlotId: meta.curriculumSlotId || '',
        stageId: 'shadowing',
        eventType: 'shadowing_recording_uploaded',
        status: 'success',
        detailsJson: JSON.stringify({ recordingId: remote.id, attemptNumber: meta.repetitionTo, sizeBytes: blob.size }),
        durationMs: this.durationLabelToMs(meta.durationLabel),
        occurredAtUtc: meta.createdAt,
        correlationId: `recording-${meta.id}`,
      });
    }
    this.diagnostics.success('RecordingRepository', 'saveRecording', elapsed(), {
      recordingId: meta.id, remoteSaved: !!remote, sizeBytes: blob.size,
    });
  }

  getRecordingBlob(recordingId: string): Promise<Blob | null> {
    return this.indexedDb.getBlob(`recording-${recordingId}`);
  }

  async deleteRecording(recordingId: string): Promise<void> {
    const elapsed = this.diagnostics.start('RecordingRepository', 'deleteRecording', { recordingId });
    const store = this.storeService.getStore();
    const recording = store.recordings.find((item) => item.id === recordingId);
    this.diagnostics.check('RecordingRepository', 'delete-recording-found', !!recording, { recordingId });

    if (!recording) {
      await this.indexedDb.deleteBlob(`recording-${recordingId}`);
      this.diagnostics.success('RecordingRepository', 'deleteRecording', elapsed(), {
        recordingId,
        remoteDeleted: false,
        reason: 'local-metadata-not-found',
      });
      return;
    }

    let remoteDeleted = false;
    try {
      remoteDeleted = await this.trackingApi.deleteRecordingByClientId(recording.studentId, recording.id);
    } catch (error) {
      this.diagnostics.error('RecordingRepository', 'deleteRecording:remote-error', error, {
        recordingId,
        studentId: recording.studentId,
        durationMs: elapsed(),
      });
      throw error;
    }

    store.recordings = store.recordings.filter((item) => item.id !== recordingId);
    store.progress = store.progress.map((row) => {
      if (!row.recordingIds.includes(recordingId)) return row;

      const recordingIds = row.recordingIds.filter((id) => id !== recordingId);
      return {
        ...row,
        recordingIds,
        recordingCount: Math.max(0, recordingIds.length),
        completedRepetitions: Math.min(recordingIds.length, row.requiredRepetitions),
        updatedAt: new Date().toISOString(),
      };
    });

    this.storeService.saveStore(store);
    await this.indexedDb.deleteBlob(`recording-${recordingId}`);
    this.diagnostics.success('RecordingRepository', 'deleteRecording', elapsed(), {
      recordingId,
      remoteDeleted,
    });
  }
  private durationLabelToMs(label: string): number {
    const parts = label.split(':').map((value) => Number(value));
    if (parts.length === 2 && parts.every(Number.isFinite)) {
      return Math.max(0, (parts[0] * 60 + parts[1]) * 1000);
    }
    return 0;
  }

}
