import { afterEach, describe, expect, it, vi } from 'vitest';
import { LessonAiApiService, LessonAiRequestError } from './lesson-ai-api.service';

describe('LessonAiApiService backend-only AI', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends lesson AI through the ASP.NET backend and never provider URLs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: 'backend unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const service = new LessonAiApiService();

    await expect(
      service.generateLessonDraft({
        lessonId: 'lesson-1',
        lessonTitle: 'Call center',
        contentProfile: { type: 'call-center', topic: 'account issue' },
        segments: [{ text: 'How may I help you?', translation: 'كيف يمكنني مساعدتك؟' }],
      }),
    ).rejects.toMatchObject({
      name: 'LessonAiRequestError',
      status: 503,
    } satisfies Partial<LessonAiRequestError>);

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/lesson-ai/structured');
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/__ai/'))).toBe(false);
  });

  it('reports backend ProblemDetails to the UI', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: 'لا يوجد مفتاح AI في الـBackend.' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const service = new LessonAiApiService();

    await expect(service.getStatus(true)).rejects.toThrow('لا يوجد مفتاح AI في الـBackend.');
  });
});
