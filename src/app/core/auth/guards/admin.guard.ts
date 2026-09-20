import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAdmin()) return true;
  if (auth.isTeacher()) return router.createUrlTree(['/teacher/home']);
  if (auth.isSupervisor()) return router.createUrlTree(['/supervisor/dashboard']);
  if (auth.isStudent()) return router.createUrlTree(['/student/dashboard']);
  return router.createUrlTree(['/auth/login']);
};
