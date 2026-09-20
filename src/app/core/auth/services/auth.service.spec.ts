import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentTrackingApiService } from '../../api/student-tracking-api.service';
import { AppDiagnosticsService } from '../../diagnostics/app-diagnostics.service';
import { PlatformPreviewService } from '../../../features/platform-preview/data-access/platform-preview.service';
import { StudentRepository } from '../../../features/teacher/data-access/student.repository';
import { LessonRepository } from '../../../features/lessons/data-access/lesson.repository';
import { AuthService } from './auth.service';

describe('AuthService tab-scoped session', () => {
  const storageKey = 'english-shadowing-current-user-v2';

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('keeps the active role in sessionStorage and restores it after refresh', async () => {
    const router = { navigateByUrl: vi.fn().mockResolvedValue(true) } as unknown as Router;
    const students = {} as StudentRepository;
    const preview = {} as PlatformPreviewService;
    const lessons = {
      initializeFromDatabase: vi.fn().mockResolvedValue(undefined),
      getAll: vi.fn().mockReturnValue([{ id: 'lesson-1' }]),
    } as unknown as LessonRepository;
    const tracking = {
      getSession: vi.fn().mockResolvedValue({
        id: 'teacher-demo',
        name: 'Teacher Demo',
        email: 'teacher@demo.com',
        role: 'teacher',
      }),
      loginDemo: vi.fn().mockResolvedValue({
        id: 'teacher-demo',
        name: 'Teacher Demo',
        email: 'teacher@demo.com',
        role: 'teacher',
      }),
    } as unknown as StudentTrackingApiService;
    const diagnostics = {
      start: vi.fn(() => () => 1),
      check: vi.fn(),
      success: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    } as unknown as AppDiagnosticsService;
    const auth = new AuthService(router, students, preview, lessons, tracking, diagnostics);

    expect((await auth.login('teacher@demo.com', '123456')).ok).toBe(true);
    expect(auth.currentUser?.role).toBe('teacher');
    expect(localStorage.getItem(storageKey)).toBeNull();

    const afterRefresh = new AuthService(router, students, preview, lessons, tracking, diagnostics);
    expect(afterRefresh.currentUser?.role).toBe('teacher');
    expect(afterRefresh.currentUser?.id).toBe('teacher-demo');
  });
});
