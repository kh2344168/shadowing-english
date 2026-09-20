export interface LearningGroupDto {
  id: string;
  name: string;
  cefrLevel: string;
  supervisorId: string;
  supervisorName: string;
  curriculumId: string;
  curriculumName: string;
  startDate: string;
  draftCurriculumJson: string;
  hasDraftChanges: boolean;
  isActive: boolean;
  updatedAtUtc: string;
}

export interface UpsertLearningGroupRequest {
  id: string;
  name: string;
  cefrLevel: string;
  supervisorId: string;
  supervisorName: string;
  curriculumId: string;
  curriculumName: string;
  startDate: string;
  draftCurriculumJson: string;
  hasDraftChanges: boolean;
}


export interface ImportLegacyStudentRequest {
  id: string;
  name: string;
  email: string;
  groupId: string;
  cefrLevel: string;
  temporaryPassword: string;
  createdAtUtc?: string | null;
}

export interface CreateStudentAccountRequest {
  name: string;
  email: string;
  groupId: string;
  groupName: string;
  cefrLevel: string;
  temporaryPassword?: string | null;
}

export interface StudentDirectoryDto {
  id: string;
  name: string;
  email: string;
  groupId: string;
  groupName: string;
  cefrLevel: string;
  accountStatus: 'active' | 'paused' | 'disabled' | string;
  subscriptionStatus: 'active' | 'paused' | 'expired' | string;
  engagementStatus: 'committed' | 'needs-attention' | 'not-committed' | 'not-started' | string;
  engagementReason: string;
  progressPercent: number;
  completedLessons: number;
  totalLessons: number;
  recordingCount: number;
  lastSeenAtUtc?: string | null;
  createdAtUtc: string;
}

export interface CreateStudentResultDto {
  student: StudentDirectoryDto;
  temporaryPassword: string;
}


export interface RoleLoginDto {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'supervisor' | 'teacher';
  sessionToken: string;
}

export interface AuthSessionDto {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'supervisor' | 'teacher' | 'student';
  studentId?: string | null;
  groupId?: string | null;
  groupName?: string | null;
  cefrLevel?: string | null;
  sessionToken: string;
}

export interface StudentLoginDto {
  studentId: string;
  name: string;
  email: string;
  groupId: string;
  groupName: string;
  cefrLevel: string;
  accountStatus: string;
  subscriptionStatus: string;
  sessionToken: string;
}

export interface TrackStudentEventRequest {
  studentId: string;
  studentName: string;
  groupId: string;
  groupName: string;
  cefrLevel: string;
  lessonId: string;
  lessonTitle: string;
  curriculumSlotId: string;
  stageId: string;
  eventType: string;
  status: string;
  detailsJson?: string | null;
  durationMs?: number | null;
  occurredAtUtc?: string | null;
  correlationId?: string | null;
}

export interface StudentActivityEventDto {
  id: string;
  correlationId: string;
  lessonId: string;
  lessonTitle: string;
  curriculumSlotId: string;
  stageId: string;
  eventType: string;
  status: string;
  detailsJson: string;
  durationMs?: number | null;
  occurredAtUtc: string;
}

export interface StudentEventPageDto {
  items: StudentActivityEventDto[];
  total: number;
  skip: number;
  take: number;
}

export interface StudentRecordingDto {
  id: string;
  clientRecordingId: string;
  lessonId: string;
  lessonTitle: string;
  curriculumSlotId: string;
  stageId: string;
  recordingType: string;
  attemptNumber: number;
  durationMs: number;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAtUtc: string;
}

export interface StudentLessonTrackingDto {
  curriculumSlotId: string;
  lessonId: string;
  lessonTitle: string;
  completedRepetitions: number;
  requiredRepetitions: number;
  recordingCount: number;
  completionPercent: number;
  status: string;
  updatedAtUtc: string;
}

export interface StudentJourneyDetailDto {
  curriculumSlotId: string;
  lessonId: string;
  completedStages: string[];
  currentStage: string;
  startedAt?: string | null;
  updatedAt?: string | null;
  completedAt?: string | null;
  quizScore?: number | null;
}

export interface StudentReviewDetailDto {
  id: string;
  curriculumSlotId: string;
  lessonId: string;
  intervalDays: number;
  dueAt?: string | null;
  status: string;
  completedAt?: string | null;
}

export interface StudentConversationDetailDto {
  id: string;
  curriculumSlotId: string;
  lessonId: string;
  completedAt?: string | null;
  totalStudentTurns: number;
  acceptedTurns: number;
  goodAnswers: number;
  correctionCount: number;
  usedTargetPhrases: string[];
  textTurns?: number;
  voiceTurns?: number;
  grammarFocus?: string[];
  vocabularyFocus?: string[];
  strengths?: string[];
}

export interface StudentLearningSnapshotDto {
  completedStages: string[];
  currentStage: string;
  startedAt?: string | null;
  updatedAt?: string | null;
  completedAt?: string | null;
  quizScore?: number | null;
  reviewCount: number;
  dueReviewCount: number;
  conversationCount: number;
  conversationCorrections: number;
  journeys: StudentJourneyDetailDto[];
  reviews: StudentReviewDetailDto[];
  conversations: StudentConversationDetailDto[];
}

export interface StudentEngagementDto {
  status: string;
  reason: string;
  lastActivityAtUtc?: string | null;
  activeDaysLast14: number;
  eventsLast7Days: number;
  completedStages: number;
  dueReviews: number;
}

export interface AdminStudentDetailDto {
  student: StudentDirectoryDto;
  engagement: StudentEngagementDto;
  lessons: StudentLessonTrackingDto[];
  learning: StudentLearningSnapshotDto;
  recentEvents: StudentActivityEventDto[];
  recordings: StudentRecordingDto[];
  totalEventCount: number;
}
