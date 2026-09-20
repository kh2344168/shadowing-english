export type RecordingMode = 'per-repetition' | 'one-session';

export interface RecordingMeta {
  id: string;
  studentId: string;
  groupId?: string;
  lessonId: string;
  curriculumSlotId?: string;
  repetitionFrom: number;
  repetitionTo: number;
  mode: RecordingMode;
  /** Review recordings stay available without incrementing required lesson progress. */
  countsTowardProgress?: boolean;
  durationLabel: string;
  createdAt: string;
}
