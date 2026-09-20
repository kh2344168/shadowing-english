import { Routes } from '@angular/router';
import { LessonBuilderPage } from '../lessons/pages/lesson-builder/lesson-builder.page';
import { TeacherCurriculumPage } from './pages/curriculum/curriculum';
import { TeacherDashboardPage } from './pages/dashboard/teacher-dashboard.page';
import { TeacherGroupsPage } from './pages/groups/teacher-groups.page';
import { TeacherStudentsPage } from './pages/students/teacher-students.page';
import { TeacherLessonsPage } from './pages/teacher-lessons.page/teacher-lessons.page';
import { TeacherProgressPage } from './pages/progress/teacher-progress.page';
import { StudentLessonPlayerPage } from '../student/pages/lesson-player/lesson-player';
import { AdminLessonContentReviewPage } from '../admin/pages/lesson-content-review/lesson-content-review.page';
import { AdminLessonProcessingPage } from '../admin/pages/lesson-processing/lesson-processing.page';

export const teacherRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'home' },
  { path: 'home', component: TeacherDashboardPage },
  { path: 'lessons', component: TeacherLessonsPage },
  { path: 'lessons/builder', component: LessonBuilderPage },
  {
    path: 'lessons/:lessonId/processing',
    component: AdminLessonProcessingPage,
    data: { contentBasePath: '/teacher' },
  },
  {
    path: 'lessons/:lessonId/content-review/:activityId',
    component: AdminLessonContentReviewPage,
    data: { contentBasePath: '/teacher' },
  },
  {
    path: 'lessons/:lessonId/content-review',
    component: AdminLessonContentReviewPage,
    data: { contentBasePath: '/teacher' },
  },
  {
    path: 'lessons/:lessonId/preview-shadowing/:stageId',
    component: StudentLessonPlayerPage,
    data: { teacherPreview: true },
  },
  { path: 'curriculum', component: TeacherCurriculumPage },
  { path: 'groups', component: TeacherGroupsPage },
  { path: 'students', component: TeacherStudentsPage },

  { path: 'dashboard', pathMatch: 'full', redirectTo: 'home' },
  { path: 'progress', component: TeacherProgressPage },
];
