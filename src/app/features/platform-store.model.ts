import { CourseLesson } from './lessons/data-access/lesson.models';
import { RecordingMeta } from './recordings/data-access/recording.models';
import { StudentAccount, StudentProgress } from './teacher/data-access/student.models';
import { TeacherGroup } from './teacher/data-access/teacher-group.models';
import { TeacherCurriculum } from './teacher/data-access/curriculum.models';

export interface PlatformStore {
  lessons: CourseLesson[];
  students: StudentAccount[];
  progress: StudentProgress[];
  recordings: RecordingMeta[];
  groups: TeacherGroup[];
  curriculums: TeacherCurriculum[];
}
