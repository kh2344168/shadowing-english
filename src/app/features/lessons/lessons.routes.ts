import { Routes } from '@angular/router';
import { teacherGuard } from '../../core/auth/guards/teacher.guard';
import { LessonBuilderPage } from './pages/lesson-builder/lesson-builder.page';

export const lessonRoutes: Routes = [
  {
    path: '',
    canActivate: [teacherGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'builder' },
      { path: 'builder', component: LessonBuilderPage },
    ],
  },
];
