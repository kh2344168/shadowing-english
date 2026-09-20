import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { StudentTrackingApiService } from '../../api/student-tracking-api.service';
import { AppDiagnosticsService } from '../../diagnostics/app-diagnostics.service';
import { PlatformPreviewService } from '../../../features/platform-preview/data-access/platform-preview.service';
import { StudentRepository } from '../../../features/teacher/data-access/student.repository';
import { LessonRepository } from '../../../features/lessons/data-access/lesson.repository';
import { AuthUser } from '../models/auth.models';
import { TAB_SESSION_STORAGE_KEY } from '../interceptors/tab-session.interceptor';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly currentUserKey = 'english-shadowing-current-user-v2';

  currentUser: AuthUser | null = this.readCurrentUser();

  constructor(
    private router: Router,
    private studentRepository: StudentRepository,
    private platformPreview: PlatformPreviewService,
    private lessonRepository: LessonRepository,
    private trackingApi: StudentTrackingApiService,
    private diagnostics: AppDiagnosticsService,
  ) {}

  async initializeSession(): Promise<boolean> {
    const elapsed = this.diagnostics.start('Auth', 'initialize-session', {
      cachedRole: this.currentUser?.role ?? null,
    });
    try {
      const session = await this.trackingApi.getSession();
      this.setTabSessionToken(session.sessionToken);
      const user: AuthUser = session.role === 'student'
        ? {
            id: `user-${session.studentId || session.id}`,
            name: session.name,
            email: session.email,
            role: 'student',
            studentId: session.studentId || session.id,
            groupId: session.groupId || undefined,
            groupName: session.groupName || undefined,
            cefrLevel: session.cefrLevel || undefined,
          }
        : {
            id: session.id,
            name: session.name,
            email: session.email,
            role: session.role,
          };

      if (user.role === 'student' && user.studentId && user.groupId) {
        this.studentRepository.upsertRemoteStudent({
          id: user.studentId,
          name: user.name,
          email: user.email,
          groupId: user.groupId,
          groupName: user.groupName || user.groupId,
          cefrLevel: user.cefrLevel || 'A1',
        });
      }
      this.setCurrentUser(user);
      this.diagnostics.success('Auth', 'initialize-session', elapsed(), {
        userId: user.id,
        role: user.role,
      });
      return true;
    } catch (error) {
      this.clearCurrentUser();
      this.clearTabSessionToken();
      this.diagnostics.warn('Auth', 'initialize-session:none', {
        durationMs: elapsed(),
        reason: error instanceof Error ? error.message : 'No active backend session',
      });
      return false;
    }
  }

  async login(email: string, password: string): Promise<{ ok: boolean; message: string }> {
    const elapsed = this.diagnostics.start('Auth', 'login', { email: email.trim().toLowerCase() });
    const normalizedEmail = email.trim().toLowerCase();

    this.diagnostics.check('Auth', 'login-input', !!normalizedEmail && !!password, { email: normalizedEmail });
    if (!normalizedEmail || !password) {
      return { ok: false, message: 'اكتب البريد الإلكتروني وكلمة المرور.' };
    }

    const demoRole = this.demoRole(normalizedEmail);
    if (demoRole) {
      try {
        const remoteDemo = await this.trackingApi.loginDemo(normalizedEmail, password);
        const demo: AuthUser = {
          id: remoteDemo.id,
          name: remoteDemo.name,
          email: remoteDemo.email,
          role: remoteDemo.role,
        };
        this.setTabSessionToken(remoteDemo.sessionToken);
        this.setCurrentUser(demo);
        await this.reloadHostedLessonsAfterLogin(demo.role);
        this.diagnostics.success('Auth', 'login-demo', elapsed(), { email: normalizedEmail, role: demo.role });
        void this.router.navigateByUrl(this.homePath(demo.role));
        return { ok: true, message: '' };
      } catch (error) {
        this.diagnostics.error('Auth', 'login-demo:error', error, { email: normalizedEmail, durationMs: elapsed() });
        return { ok: false, message: this.describeLoginFailure(error, true) };
      }
    }

    try {
      const remote = await this.trackingApi.loginStudent(normalizedEmail, password);
      this.diagnostics.check('Auth', 'remote-student-access', remote.accountStatus === 'active' && remote.subscriptionStatus === 'active', {
        studentId: remote.studentId,
        accountStatus: remote.accountStatus,
        subscriptionStatus: remote.subscriptionStatus,
      });
      this.studentRepository.upsertRemoteStudent({
        id: remote.studentId,
        name: remote.name,
        email: remote.email,
        groupId: remote.groupId,
        groupName: remote.groupName,
        cefrLevel: remote.cefrLevel,
      });
      const user: AuthUser = {
        id: `user-${remote.studentId}`,
        name: remote.name,
        email: remote.email,
        role: 'student',
        studentId: remote.studentId,
        groupId: remote.groupId,
        groupName: remote.groupName,
        cefrLevel: remote.cefrLevel,
      };
      this.setTabSessionToken(remote.sessionToken);
      this.setCurrentUser(user);
      await this.reloadHostedLessonsAfterLogin(user.role);
      this.diagnostics.success('Auth', 'login-student', elapsed(), {
        studentId: remote.studentId,
        groupId: remote.groupId,
      });
      void this.router.navigateByUrl('/student/dashboard');
      return { ok: true, message: '' };
    } catch (error) {
      this.diagnostics.error('Auth', 'login-student:error', error, { email: normalizedEmail, durationMs: elapsed() });
      return { ok: false, message: this.describeLoginFailure(error, false) };
    }
  }

  logout(): void {
    this.diagnostics.info('Auth', 'logout', { userId: this.currentUser?.id, role: this.currentUser?.role });
    this.lessonRepository.clearSessionCache('logout');
    void this.trackingApi.logout().catch((error) =>
      this.diagnostics.error('Auth', 'logout:backend-error', error, { userId: this.currentUser?.id }),
    );
    this.clearCurrentUser();
    this.clearTabSessionToken();
    void this.router.navigateByUrl('/auth/login');
  }

  isLoggedIn(): boolean { return !!this.currentUser; }
  isAdmin(): boolean { return this.currentUser?.role === 'admin'; }
  isSupervisor(): boolean { return this.currentUser?.role === 'supervisor'; }
  isTeacher(): boolean { return this.currentUser?.role === 'teacher'; }
  isStudent(): boolean { return this.currentUser?.role === 'student'; }


  private async reloadHostedLessonsAfterLogin(role: AuthUser['role']): Promise<void> {
    const elapsed = this.diagnostics.start('Auth', 'reload-hosted-lessons', { role });
    await this.lessonRepository.reloadFromDatabase(`login:${role}`);
    const lessonCount = this.lessonRepository.getAll().length;
    this.diagnostics.check('Auth', 'reload-hosted-lessons-result', lessonCount > 0, {
      role,
      lessonCount,
    });
    this.diagnostics.success('Auth', 'reload-hosted-lessons', elapsed(), {
      role,
      lessonCount,
    });
  }

  private demoRole(email: string): AuthUser['role'] | null {
    if (email === 'admin@demo.com') return 'admin';
    if (email === 'supervisor@demo.com') return 'supervisor';
    if (email === 'teacher@demo.com') return 'teacher';
    return null;
  }

  private homePath(role: AuthUser['role']): string {
    if (role === 'admin') return '/admin/dashboard';
    if (role === 'supervisor') return '/supervisor/dashboard';
    if (role === 'teacher') return '/teacher/home';
    return '/student/dashboard';
  }

  private clearCurrentUser(): void {
    sessionStorage.removeItem(this.currentUserKey);
    localStorage.removeItem(this.currentUserKey);
    this.currentUser = null;
  }

  private setCurrentUser(user: AuthUser): void {
    this.currentUser = user;
    sessionStorage.setItem(this.currentUserKey, JSON.stringify(user));
    localStorage.removeItem(this.currentUserKey);
  }

  private readCurrentUser(): AuthUser | null {
    try {
      const raw = sessionStorage.getItem(this.currentUserKey);
      if (!raw) return null;
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  }

  private setTabSessionToken(token: string | null | undefined): void {
    if (!token) return;
    sessionStorage.setItem(TAB_SESSION_STORAGE_KEY, token);
    this.diagnostics.info('Auth', 'tab-session:set', { role: this.currentUser?.role ?? null });
  }

  private clearTabSessionToken(): void {
    sessionStorage.removeItem(TAB_SESSION_STORAGE_KEY);
  }

  private describeLoginFailure(error: unknown, demo: boolean): string {
    if (!(error instanceof HttpErrorResponse)) {
      return 'حدث خطأ غير متوقع أثناء تسجيل الدخول.';
    }

    if (error.status === 0) {
      return 'الـBackend غير متاح. شغّل scripts\\run-api.cmd وتأكد أن http://localhost:5017 يعمل.';
    }

    if (error.status === 503) {
      const backendMessage = typeof error.error?.message === 'string' ? error.error.message : '';
      return backendMessage
        ? `قاعدة البيانات غير جاهزة: ${backendMessage}`
        : 'قاعدة البيانات غير جاهزة. راجع Console الـBackend وسجل [DB][MIGRATION][ERROR].';
    }

    if (error.status === 500) {
      const correlationId = typeof error.error?.correlationId === 'string' ? error.error.correlationId : '';
      return correlationId
        ? `خطأ داخلي في الـBackend. Correlation ID: ${correlationId}`
        : 'خطأ داخلي في الـBackend. راجع نافذة run-api.cmd لمعرفة السبب.';
    }

    if (error.status === 401) {
      return demo
        ? 'بيانات حساب العرض غير صحيحة.'
        : 'البريد الإلكتروني أو كلمة المرور غير صحيحة، أو الحساب غير نشط.';
    }

    if (error.status === 404 && demo) {
      return 'حسابات العرض مقفولة في إعدادات الـBackend.';
    }

    return `تعذر تسجيل الدخول (HTTP ${error.status}).`;
  }

}
