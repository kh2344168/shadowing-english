import { Injectable } from '@angular/core';

export interface DiagnosticContext {
  [key: string]: unknown;
}

@Injectable({ providedIn: 'root' })
export class AppDiagnosticsService {
  private readonly enabled = true;

  start(scope: string, operation: string, context: DiagnosticContext = {}): () => number {
    const startedAt = performance.now();
    this.info(scope, `${operation}:start`, context);
    return () => Math.round(performance.now() - startedAt);
  }

  check(scope: string, operation: string, passed: boolean, context: DiagnosticContext = {}): void {
    const event = `${operation}:${passed ? 'check-ok' : 'check-failed'}`;
    if (passed) this.info(scope, event, context);
    else this.warn(scope, event, context);
  }

  info(scope: string, event: string, context: DiagnosticContext = {}): void {
    if (!this.enabled) return;
    console.info(`[${scope}] ${event}`, this.safe(context));
  }

  warn(scope: string, event: string, context: DiagnosticContext = {}): void {
    if (!this.enabled) return;
    console.warn(`[${scope}] ${event}`, this.safe(context));
  }

  error(scope: string, event: string, error: unknown, context: DiagnosticContext = {}): void {
    if (!this.enabled) return;
    console.error(`[${scope}] ${event}`, { ...this.safe(context), error: this.describeError(error) });
  }

  success(scope: string, operation: string, durationMs: number, context: DiagnosticContext = {}): void {
    this.info(scope, `${operation}:success`, { ...context, durationMs });
  }

  private safe(context: DiagnosticContext): DiagnosticContext {
    const blocked = new Set(['password', 'temporaryPassword', 'apiKey', 'token', 'audioData', 'blob']);
    return Object.fromEntries(
      Object.entries(context).map(([key, value]) => [key, blocked.has(key) ? '[REDACTED]' : value]),
    );
  }

  private describeError(error: unknown): unknown {
    if (!error || typeof error !== 'object') return error;
    const value = error as Record<string, unknown>;
    return {
      name: value['name'],
      message: value['message'],
      status: value['status'],
      statusText: value['statusText'],
      url: value['url'],
      error: value['error'],
    };
  }
}
