import { HttpInterceptorFn } from '@angular/common/http';

export const TAB_SESSION_STORAGE_KEY = 'english-shadowing-tab-session-v1';

export const tabSessionInterceptor: HttpInterceptorFn = (request, next) => {
  const token = sessionStorage.getItem(TAB_SESSION_STORAGE_KEY);
  const isApiRequest = request.url.startsWith('/api') || request.url.includes('/api/');
  if (!token || !isApiRequest) return next(request);

  return next(request.clone({
    setHeaders: {
      'X-Shadowing-Session': token,
    },
  }));
};
