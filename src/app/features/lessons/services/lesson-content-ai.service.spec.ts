import { afterEach, describe, expect, it, vi } from 'vitest';
import { CourseLesson } from '../data-access/lesson.models';
import { LessonContentAiService } from './lesson-content-ai.service';

describe('LessonContentAiService review draft', () => {
  afterEach(() => vi.useRealTimers());

  it('creates the complete six-stage lesson flow for admin review', async () => {
    vi.useFakeTimers();
    const service = new LessonContentAiService();
    const lesson: CourseLesson = {
      id: 'lesson-ai-test',
      title: 'Customer support',
      status: 'draft',
      requiredRepetitions: 1,
      mediaFileName: 'support.mp3',
      mediaType: 'audio/mpeg',
      segments: [
        {
          text: 'Hello, how can I help you?',
          translation: 'مرحبًا، كيف يمكنني مساعدتك؟',
          start: 0,
          end: 2,
        },
        {
          text: 'I understand your concern.',
          translation: 'أتفهم مشكلتك.',
          start: 2,
          end: 4,
        },
      ],
      scriptLines: ['Hello, how can I help you?', 'I understand your concern.'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const generatedPromise = service.generateReviewDraft(lesson);
    await vi.runAllTimersAsync();
    const generated = await generatedPromise;

    expect(generated.status).toBe('draft');
    expect(generated.activities?.map((activity) => activity.type)).toEqual([
      'shadowing',
      'vocabulary',
      'shadowing-review',
      'listen-write',
      'quiz',
      'ai-conversation',
    ]);
    expect(generated.activities?.every((activity) => activity.aiGenerated)).toBe(true);
    expect(
      generated.activities?.find((activity) => activity.type === 'listen-write')
        ?.dictationItems,
    ).toHaveLength(2);
    expect(
      generated.activities?.find((activity) => activity.type === 'quiz')
        ?.quizQuestions?.length,
    ).toBeGreaterThan(0);
    expect(
      generated.activities?.find((activity) => activity.type === 'ai-conversation')
        ?.conversationConfig?.lessonContentOnly,
    ).toBe(true);
    expect(generated.vocabulary?.some((item) => item.kind === 'chunk')).toBe(true);
    expect(
      generated.vocabulary?.every(
        (item) => item.imageUrl?.startsWith('data:image/svg+xml') && !item.imageApproved,
      ),
    ).toBe(true);
    const conversation = generated.activities?.find(
      (activity) => activity.type === 'ai-conversation',
    )?.conversationConfig;
    expect(conversation?.lessonType).toBe('call-center');
    expect(conversation?.roleOptions?.map((role) => role.id)).toEqual([
      'agent',
      'customer',
    ]);
    expect(conversation?.turnPlan).toHaveLength(6);
  });
});
