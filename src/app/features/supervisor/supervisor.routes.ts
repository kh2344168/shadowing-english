import { Routes } from '@angular/router';
import { AdminSubscriptionsPage } from '../admin/pages/subscriptions/admin-subscriptions.page';
import { TeacherDashboardPage } from '../teacher/pages/dashboard/teacher-dashboard.page';
import { SupervisorDashboardPage } from './pages/dashboard/supervisor-dashboard.page';
import { SupervisorMessagesPage } from './pages/messages/supervisor-messages.page';
import { SupervisorReportsPage } from './pages/reports/supervisor-reports.page';
import { SupervisorStudentsPage } from './pages/students/supervisor-students.page';
import { SupervisorWeeklySummariesPage } from './pages/weekly-summaries/supervisor-weekly-summaries.page';

export const supervisorRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: 'dashboard', component: SupervisorDashboardPage },
  { path: 'students', component: SupervisorStudentsPage },
  { path: 'groups', component: TeacherDashboardPage },
  { path: 'subscriptions', component: AdminSubscriptionsPage },
  { path: 'weekly-summaries', component: SupervisorWeeklySummariesPage },
  { path: 'messages', component: SupervisorMessagesPage },
  { path: 'reports', component: SupervisorReportsPage },
];
