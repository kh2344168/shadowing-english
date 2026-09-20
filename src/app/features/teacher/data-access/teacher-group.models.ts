import { GroupCurriculumSnapshot } from './group-curriculum.models';

export interface TeacherGroup {
  id: string;
  /** Empty for legacy/admin-created groups until an admin assigns a teacher. */
  teacherId?: string;
  name: string;
  curriculumId: string;
  curriculumName: string;
  startDate: string;
  studentIds: string[];
  draftCurriculum: GroupCurriculumSnapshot;
  publishedCurriculum: GroupCurriculumSnapshot;
  hasDraftChanges: boolean;
  createdAt: string;
  updatedAt: string;
}
