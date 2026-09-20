import { Routes } from '@angular/router';
import { LessonBuilderPage } from '../lessons/pages/lesson-builder/lesson-builder.page';
import { SupervisorReportsPage } from '../supervisor/pages/reports/supervisor-reports.page';
import { SupervisorWeeklySummariesPage } from '../supervisor/pages/weekly-summaries/supervisor-weekly-summaries.page';
import { TeacherLessonsPage } from '../teacher/pages/teacher-lessons.page/teacher-lessons.page';
import { AdminDashboardPage } from './pages/dashboard/admin-dashboard.page';
import { AdminGroupsPage } from './pages/groups/admin-groups.page';
import { AdminSettingsPage } from './pages/settings/admin-settings.page';
import { AdminStudentsPage } from './pages/students/admin-students.page';
import { AdminSubscriptionsPage } from './pages/subscriptions/admin-subscriptions.page';
import { AdminSupervisorsPage } from './pages/supervisors/admin-supervisors.page';
import { AdminLessonContentReviewPage } from './pages/lesson-content-review/lesson-content-review.page';
import { StudentLessonPlayerPage } from '../student/pages/lesson-player/lesson-player';
import { AdminLessonProcessingPage } from './pages/lesson-processing/lesson-processing.page';
import { AdminCurriculumsPage } from './pages/curriculums/admin-curriculums.page';
import { AdminCurriculumDetailsPage } from './pages/curriculum-details/admin-curriculum-details.page';
import { AdminGroupDetailsPage } from './pages/group-details/admin-group-details.page';
import { AdminStudentDetailsPage } from './pages/student-details/admin-student-details.page';

export const adminRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: 'dashboard', component: AdminDashboardPage },
  { path: 'lessons', component: TeacherLessonsPage },
  { path: 'lessons/builder', component: LessonBuilderPage },
  {
    path: 'lessons/:lessonId/processing',
    component: AdminLessonProcessingPage,
    data: { contentBasePath: '/admin' },
  },
  {
    path: 'lessons/:lessonId/content-review/:activityId',
    component: AdminLessonContentReviewPage,
    data: { contentBasePath: '/admin' },
  },
  {
    path: 'lessons/:lessonId/content-review',
    component: AdminLessonContentReviewPage,
    data: { contentBasePath: '/admin' },
  },
  {
    path: 'lessons/:lessonId/preview-shadowing/:stageId',
    component: StudentLessonPlayerPage,
    data: { teacherPreview: true },
  },
  { path: 'curriculums', component: AdminCurriculumsPage },
  { path: 'curriculums/:curriculumId', component: AdminCurriculumDetailsPage },
  { path: 'groups', component: AdminGroupsPage },
  { path: 'groups/:groupId', component: AdminGroupDetailsPage },
  { path: 'supervisors', component: AdminSupervisorsPage },
  { path: 'students', component: AdminStudentsPage },
  { path: 'students/:studentId', component: AdminStudentDetailsPage },
  { path: 'subscriptions', component: AdminSubscriptionsPage },
  { path: 'weekly-summaries', component: SupervisorWeeklySummariesPage },
  { path: 'reports', component: SupervisorReportsPage },
  { path: 'settings', component: AdminSettingsPage },
  { path: 'teachers', pathMatch: 'full', redirectTo: 'supervisors' },
  { path: 'courses', pathMatch: 'full', redirectTo: 'lessons' },
];
