import { CurriculumWeek } from './curriculum.models';

export interface GroupCurriculumSnapshot {
  sourceCurriculumId: string;
  sourceCurriculumName: string;
  version: number;
  weeks: CurriculumWeek[];
  updatedAt: string;
  publishedAt?: string;
}
