export interface StudentAccount {
  id: string;
  name: string;
  email: string;
  groupId: string;
  temporaryPassword: string;
  createdAt: string;
}

export interface StudentProgress {
  studentId: string;
  groupId?: string;
  lessonId: string;
  curriculumSlotId?: string;
  completedRepetitions: number;
  requiredRepetitions: number;
  recordingIds: string[];
  recordingCount?: number;
  updatedAt: string;
}

export interface StudentCreateResult {
  student: StudentAccount;
  temporaryPassword: string;
}
