export type CurriculumStatus = 'draft' | 'ready' | 'archived';

export interface CurriculumLessonSlot {
  id: string;
  lessonId: string;
  repetitionCount: number;
  required: boolean;
  order: number;
}

export interface CurriculumDay {
  id: string;
  name: string;
  order: number;
  lessonSlots: CurriculumLessonSlot[];
}

export interface CurriculumWeek {
  id: string;
  name: string;
  order: number;
  days: CurriculumDay[];
}

export interface TeacherCurriculum {
  id: string;
  name: string;
  description: string;
  status: CurriculumStatus;
  weeks: CurriculumWeek[];
  createdAt: string;
  updatedAt: string;
}
