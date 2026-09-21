type RuntimeServerConfig = {
  apiBaseUrl?: string;
};

function resolveApiBaseUrl(): string {
  if (typeof window === 'undefined') return '/api';

  const config = (window as typeof window & {
    shadowingServerConfig?: RuntimeServerConfig;
  }).shadowingServerConfig;
  const configured = config?.apiBaseUrl?.trim().replace(/\/+$/, '');
  if (configured) return configured;

  // Local Angular development talks directly to ASP.NET Core. Hosted builds
  // preserve the relative URL and therefore remain same-origin.
  const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  return isLocalHost ? 'http://localhost:5017/api' : '/api';
}

export const API_BASE_URL = resolveApiBaseUrl();
