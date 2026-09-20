import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { DemoContentService } from './core/demo/demo-content.service';
import { LessonRepository } from './features/lessons/data-access/lesson.repository';
import { GroupCurriculumRepository } from './features/teacher/data-access/group-curriculum.repository';
import { TeacherGroupRepository } from './features/teacher/data-access/teacher-group.repository';
import { AuthService } from './core/auth/services/auth.service';
import { routes } from './app.routes';
import { tabSessionInterceptor } from './core/auth/interceptors/tab-session.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([tabSessionInterceptor])),
    provideAppInitializer(() => {
      const auth = inject(AuthService);
      const lessonRepository = inject(LessonRepository);
      const demoContent = inject(DemoContentService);
      const groupCurriculumRepository = inject(GroupCurriculumRepository);
      const groupRepository = inject(TeacherGroupRepository);

      return auth.initializeSession().then(async (hasSession) => {
        if (!hasSession) return;
        await lessonRepository.initializeFromDatabase();
        if (auth.isAdmin() || auth.isTeacher() || auth.isSupervisor()) {
          await groupRepository.initializeFromBackend();
        }
        if (auth.isAdmin()) await demoContent.initialize();
        await groupCurriculumRepository.initializeFromDatabase();
      });
    }),
    provideRouter(routes, withComponentInputBinding()),
  ],
};
