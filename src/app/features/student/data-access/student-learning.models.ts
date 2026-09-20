import {
  CourseLesson,
  LessonActivityType,
  getLessonActivities,
} from '../../lessons/data-access/lesson.models';
import { StudentProgress } from '../../teacher/data-access/student.models';

export type StudentStageId = string;

export interface StudentStageDefinition {
  id: StudentStageId;
  activityType: LessonActivityType;
  label: string;
  shortLabel: string;
  description: string;
  durationMinutes: number;
}

export interface StudentStageView extends StudentStageDefinition {
  status: 'locked' | 'available' | 'current' | 'completed';
  path: string;
}

export interface StudentLessonJourney {
  studentId: string;
  groupId: string;
  curriculumSlotId: string;
  lessonId: string;
  completedStages: StudentStageId[];
  currentStage: StudentStageId;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  quizScore?: number;
}


export interface StudentConversationSummary {
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

export interface StudentReviewScheduleItem {
  id: string;
  studentId: string;
  groupId: string;
  curriculumSlotId: string;
  lessonId: string;
  intervalDays: number;
  dueAt: string;
  status: 'scheduled' | 'completed';
  completedAt?: string;
}

export interface StudentLessonView {
  lesson: CourseLesson;
  progress: StudentProgress | null;
  groupId: string;
  curriculumSlotId: string;
  weekId: string;
  weekName: string;
  weekOrder: number;
  lessonOrder: number;
  required: boolean;
  status: 'locked' | 'available' | 'in-progress' | 'completed';
  stages: StudentStageView[];
  currentStage: StudentStageId;
  completedStageCount: number;
  progressPercent: number;
  isLocked: boolean;
  isCompleted: boolean;
  nextPath: string;
}

export interface StudentWeekView {
  id: string;
  name: string;
  order: number;
  lessons: StudentLessonView[];
  status: 'locked' | 'available' | 'in-progress' | 'completed';
  progressPercent: number;
}

export interface StudentCourseView {
  courseName: string;
  groupName: string;
  weeks: StudentWeekView[];
  lessons: StudentLessonView[];
  currentLesson: StudentLessonView | null;
  completedLessons: number;
  totalLessons: number;
  progressPercent: number;
}

export interface StudentReviewView extends StudentReviewScheduleItem {
  lessonView: StudentLessonView;
  isDue: boolean;
}

export function getStudentStageDefinitions(lesson: CourseLesson): StudentStageDefinition[] {
  return getLessonActivities(lesson).map((activity) => {
    const copy: Record<LessonActivityType, Omit<StudentStageDefinition, 'id' | 'label' | 'activityType'>> = {
      shadowing: {
        shortLabel: 'ردد',
        description: 'اسمع كل جملة وكررها بصوتك حتى تكمل العدد المطلوب.',
        durationMinutes: 8,
      },
      vocabulary: {
        shortLabel: 'افهم',
        description: 'راجع الكلمات والصور التي اعتمدها المدرس لهذا الدرس.',
        durationMinutes: 5,
      },
      'shadowing-review': {
        shortLabel: 'طبّق',
        description: 'أعد الشادوينج بعد فهم الكلمات لتثبيت النطق والمعنى.',
        durationMinutes: 5,
      },
      'listen-write': {
        shortLabel: 'اكتب',
        description: 'اسمع الجملة ثم اكتب ما سمعته، وصحح الكلمات المختلفة.',
        durationMinutes: 6,
      },
      quiz: {
        shortLabel: 'اختبر',
        description: 'حل اختبارًا قصيرًا على جمل وكلمات الدرس.',
        durationMinutes: 4,
      },
      'ai-conversation': {
        shortLabel: 'اتكلم',
        description: 'استخدم جمل الدرس في محادثة قصيرة عن نفس الموقف.',
        durationMinutes: 5,
      },
    };

    return {
      id: activity.id,
      activityType: activity.type,
      label: activity.title,
      ...copy[activity.type],
    };
  });
}
