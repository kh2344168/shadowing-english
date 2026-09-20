export interface CourseLessonProgressInput {
  curriculumSlotId: string;
  lessonId: string;
  lessonTitle: string;
  completedRepetitions: number;
  requiredRepetitions: number;
  recordingCount: number;
}

export interface SyncStudentCourseRequest {
  studentId: string;
  studentName: string;
  groupId: string;
  groupName: string;
  lessons: CourseLessonProgressInput[];
}

export interface SaveStudentProgressRequest {
  studentId: string;
  studentName: string;
  groupId: string;
  groupName: string;
  curriculumSlotId: string;
  lessonId: string;
  lessonTitle: string;
  completedRepetitions: number;
  requiredRepetitions: number;
  recordingCount: number;
}

export interface StudentProgressDto {
  studentId: string;
  studentName: string;
  groupId: string;
  groupName: string;
  curriculumSlotId: string;
  lessonId: string;
  lessonTitle: string;
  completedRepetitions: number;
  requiredRepetitions: number;
  recordingCount: number;
  completionPercent: number;
  status: 'Completed' | 'InProgress' | 'NotStarted';
  updatedAtUtc: string;
}

export interface TeacherStudentProgressSummaryDto {
  studentId: string;
  studentName: string;
  groupId: string;
  groupName: string;
  completedLessons: number;
  totalLessons: number;
  inProgressLessons: number;
  progressPercent: number;
  status: 'Completed' | 'InProgress' | 'NotStarted';
  lessons: StudentProgressDto[];
}

export interface TeacherGroupProgressSummaryDto {
  groupId: string;
  groupName: string;
  studentsCount: number;
  completedStudentsCount: number;
  inProgressStudentsCount: number;
  progressPercent: number;
  students: TeacherStudentProgressSummaryDto[];
}

export interface StudentLearningJourneyDto {
  studentId: string;
  groupId: string;
  curriculumSlotId: string;
  lessonId: string;
  completedStages: string[];
  currentStage: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string | null;
  quizScore?: number | null;
}

export interface StudentReviewScheduleItemDto {
  id: string;
  studentId: string;
  groupId: string;
  curriculumSlotId: string;
  lessonId: string;
  intervalDays: number;
  dueAt: string;
  status: 'scheduled' | 'completed';
  completedAt?: string | null;
}

export interface StudentConversationSummaryDto {
  id: string;
  studentId: string;
  groupId: string;
  curriculumSlotId: string;
  lessonId: string;
  completedAt: string;
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

export interface SaveStudentLearningStateRequest {
  schemaVersion: number;
  studentId: string;
  studentName: string;
  groupId: string;
  groupName: string;
  journeys: StudentLearningJourneyDto[];
  reviews: StudentReviewScheduleItemDto[];
  conversations: StudentConversationSummaryDto[];
}

export interface StudentLearningStateDto extends SaveStudentLearningStateRequest {
  revision: number;
  updatedAtUtc: string;
}
