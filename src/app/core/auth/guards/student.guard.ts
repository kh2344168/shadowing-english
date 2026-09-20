import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const studentGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isStudent()) return true;
  if (auth.isAdmin()) return router.createUrlTree(['/admin/dashboard']);
  if (auth.isTeacher()) return router.createUrlTree(['/teacher/home']);
  if (auth.isSupervisor()) return router.createUrlTree(['/supervisor/dashboard']);
  return router.createUrlTree(['/auth/login']);
};
