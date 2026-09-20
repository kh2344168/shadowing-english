import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const supervisorGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isSupervisor()) return true;
  if (auth.isAdmin()) return router.createUrlTree(['/admin/dashboard']);
  if (auth.isTeacher()) return router.createUrlTree(['/teacher/home']);
  if (auth.isStudent()) return router.createUrlTree(['/student/dashboard']);
  return router.createUrlTree(['/auth/login']);
};
