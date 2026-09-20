import { Routes } from '@angular/router';
import { adminGuard } from './core/auth/guards/admin.guard';
import { authGuard } from './core/auth/guards/auth.guard';
import { studentGuard } from './core/auth/guards/student.guard';
import { supervisorGuard } from './core/auth/guards/supervisor.guard';
import { teacherGuard } from './core/auth/guards/teacher.guard';

export const routes: Routes = [
  {
    path: 'auth',
    loadComponent: () =>
      import('./layouts/auth-layout/auth-layout').then((module) => module.AuthLayout),
    loadChildren: () =>
      import('./features/auth/auth.routes').then((module) => module.authRoutes),
  },
  {
    path: 'admin',
    canActivate: [authGuard, adminGuard],
    loadComponent: () =>
      import('./layouts/admin-layout/admin-layout').then((module) => module.AdminLayout),
    loadChildren: () =>
      import('./features/admin/admin.routes').then((module) => module.adminRoutes),
  },
  {
    path: 'supervisor',
    canActivate: [authGuard, supervisorGuard],
    loadComponent: () =>
      import('./layouts/supervisor-layout/supervisor-layout').then(
        (module) => module.SupervisorLayout,
      ),
    loadChildren: () =>
      import('./features/supervisor/supervisor.routes').then(
        (module) => module.supervisorRoutes,
      ),
  },
  {
    path: 'student',
    canActivate: [authGuard, studentGuard],
    loadComponent: () =>
      import('./layouts/student-layout/student-layout').then(
        (module) => module.StudentLayout,
      ),
    loadChildren: () =>
      import('./features/student/student.routes').then((module) => module.studentRoutes),
  },
  {
    path: 'teacher',
    canActivate: [authGuard, teacherGuard],
    loadComponent: () =>
      import('./layouts/teacher-layout/teacher-layout').then(
        (module) => module.TeacherLayout,
      ),
    loadChildren: () =>
      import('./features/teacher/teacher.routes').then(
        (module) => module.teacherRoutes,
      ),
  },
  { path: '', pathMatch: 'full', redirectTo: 'auth/login' },
  { path: '**', redirectTo: 'auth/login' },
];
