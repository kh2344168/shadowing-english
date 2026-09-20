import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const teacherGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isTeacher()) return true;
  if (auth.isAdmin()) return router.createUrlTree(['/admin/dashboard']);
  if (auth.isSupervisor()) return router.createUrlTree(['/supervisor/dashboard']);
  if (auth.isStudent()) return router.createUrlTree(['/student/dashboard']);
  return router.createUrlTree(['/auth/login']);
};
