import { Routes } from '@angular/router';

export const studentRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'dashboard',
    title: 'مساري | Shadowing English',
    loadComponent: () =>
      import('./pages/dashboard/student-dashboard.page').then(
        (module) => module.StudentDashboardPage,
      ),
  },
  {
    path: 'weeks',
    title: 'الأسابيع | Shadowing English',
    loadComponent: () =>
      import('./pages/weeks/student-weeks.page').then(
        (module) => module.StudentWeeksPage,
      ),
  },
  {
    path: 'weeks/:weekId',
    title: 'دروس الأسبوع | Shadowing English',
    loadComponent: () =>
      import('./pages/week/student-week.page').then(
        (module) => module.StudentWeekPage,
      ),
  },
  {
    path: 'lessons/:lessonId',
    title: 'مراحل الدرس | Shadowing English',
    loadComponent: () =>
      import('./pages/lesson-overview/student-lesson-overview.page').then(
        (module) => module.StudentLessonOverviewPage,
      ),
  },
  {
    path: 'lessons/:lessonId/shadowing',
    title: 'الشادوينج | Shadowing English',
    loadComponent: () =>
      import('./pages/lesson-player/lesson-player').then(
        (module) => module.StudentLessonPlayerPage,
      ),
  },
  {
    path: 'lessons/:lessonId/shadowing/:stageId',
    title: 'الشادوينج | Shadowing English',
    loadComponent: () =>
      import('./pages/lesson-player/lesson-player').then(
        (module) => module.StudentLessonPlayerPage,
      ),
  },
  {
    path: 'lessons/:lessonId/stage/:stageId',
    title: 'مرحلة الدرس | Shadowing English',
    loadComponent: () =>
      import('./pages/lesson-stage/student-lesson-stage.page').then(
        (module) => module.StudentLessonStagePage,
      ),
  },
  {
    path: 'lessons/:lessonId/vocabulary',
    title: 'الكلمات والجمل | Shadowing English',
    data: { stage: 'vocabulary' },
    loadComponent: () =>
      import('./pages/lesson-stage/student-lesson-stage.page').then(
        (module) => module.StudentLessonStagePage,
      ),
  },
  {
    path: 'lessons/:lessonId/listen',
    title: 'الاستماع الكامل | Shadowing English',
    data: { stage: 'listen' },
    loadComponent: () =>
      import('./pages/lesson-stage/student-lesson-stage.page').then(
        (module) => module.StudentLessonStagePage,
      ),
  },
  {
    path: 'lessons/:lessonId/quiz',
    title: 'المراجعة السريعة | Shadowing English',
    data: { stage: 'quiz' },
    loadComponent: () =>
      import('./pages/lesson-stage/student-lesson-stage.page').then(
        (module) => module.StudentLessonStagePage,
      ),
  },
  {
    path: 'lessons/:lessonId/complete',
    title: 'أكملت الدرس | Shadowing English',
    loadComponent: () =>
      import('./pages/lesson-complete/student-lesson-complete.page').then(
        (module) => module.StudentLessonCompletePage,
      ),
  },
  {
    path: 'review',
    title: 'مراجعة اليوم | Shadowing English',
    loadComponent: () =>
      import('./pages/review/student-review.page').then(
        (module) => module.StudentReviewPage,
      ),
  },
  {
    path: 'knowledge-bank',
    title: 'بنك الكلمات والجمل | Shadowing English',
    loadComponent: () =>
      import('./pages/knowledge-bank/student-knowledge-bank.page').then(
        (module) => module.StudentKnowledgeBankPage,
      ),
  },
  {
    path: 'report',
    title: 'تقرير الطالب | Shadowing English',
    loadComponent: () =>
      import('./pages/report/student-report.page').then(
        (module) => module.StudentReportPage,
      ),
  },
  {
    path: 'progress',
    title: 'تقدمي | Shadowing English',
    loadComponent: () =>
      import('./pages/progress/student-progress.page').then(
        (module) => module.StudentProgressPage,
      ),
  },
  {
    path: 'lesson/:lessonId',
    title: 'الشادوينج | Shadowing English',
    loadComponent: () =>
      import('./pages/lesson-player/lesson-player').then(
        (module) => module.StudentLessonPlayerPage,
      ),
  },
  {
    path: 'recordings',
    title: 'تسجيلاتي | Shadowing English',
    loadComponent: () =>
      import('./pages/recordings/student-recordings.page').then(
        (module) => module.StudentRecordingsPage,
      ),
  },
  {
    path: 'weekly-summary',
    title: 'التلخيص الأسبوعي | Shadowing English',
    loadComponent: () =>
      import('./pages/weekly-summary/student-weekly-summary.page').then(
        (module) => module.StudentWeeklySummaryPage,
      ),
  },
  {
    path: 'messages',
    title: 'الرسائل | Shadowing English',
    loadComponent: () =>
      import('./pages/messages/student-messages.page').then(
        (module) => module.StudentMessagesPage,
      ),
  },
  {
    path: 'profile',
    title: 'حسابي | Shadowing English',
    loadComponent: () =>
      import('./pages/profile/student-profile.page').then(
        (module) => module.StudentProfilePage,
      ),
  },
];
