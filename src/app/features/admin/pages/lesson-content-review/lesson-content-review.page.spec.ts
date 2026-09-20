import { ActivatedRoute, Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { CourseLesson } from '../../../lessons/data-access/lesson.models';
import { LessonRepository } from '../../../lessons/data-access/lesson.repository';
import { LessonAiApiService } from '../../../lessons/data-access/lesson-ai-api.service';
import { LessonContentAiService } from '../../../lessons/services/lesson-content-ai.service';
import { AdminLessonContentReviewPage } from './lesson-content-review.page';

describe('AdminLessonContentReviewPage', () => {
  it('keeps an activity pending until its student content is valid', async () => {
    const lesson: CourseLesson = {
      id: 'lesson-1',
      title: 'Call center',
      requiredRepetitions: 1,
      mediaFileName: 'lesson.mp3',
      mediaType: 'audio/mpeg',
      segments: [
        {
          text: 'How can I help you?',
          translation: 'كيف يمكنني مساعدتك؟',
          start: 0,
          end: 2,
        },
      ],
      vocabulary: [
        {
          term: 'help',
          translation: 'يساعد',
          example: 'How can I help you?',
          imageUrl: 'https://example.com/help.jpg',
          imageApproved: false,
          includeForStudent: true,
        },
      ],
      activities: [
        {
          id: 'vocabulary',
          type: 'vocabulary',
          title: 'الكلمات والصور',
          order: 0,
          enabled: true,
          reviewStatus: 'pending',
        },
      ],
      scriptLines: ['How can I help you?'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const repository = {
      initializeFromDatabase: vi.fn().mockResolvedValue(undefined),
      getById: vi.fn(() => lesson),
      getAll: vi.fn(() => [lesson]),
    } as unknown as LessonRepository;
    const route = {
      snapshot: {
        paramMap: { get: (key: string) => key === 'lessonId' ? 'lesson-1' : null },
        queryParamMap: { get: () => null },
      },
    } as unknown as ActivatedRoute;
    const router = { navigate: vi.fn() } as unknown as Router;
    const lessonContentAi = {
      createVocabularyDraft: vi.fn(() => []),
    } as unknown as LessonContentAiService;
    const lessonAiApi = {
      generateImage: vi.fn(),
      getStatus: vi.fn().mockResolvedValue({
        content: { state: 'configured', model: 'text-model', message: 'configured' },
        conversation: { state: 'configured', model: 'text-model', message: 'configured' },
        images: { state: 'configured', model: 'image-model', message: 'configured' },
        usesDedicatedImageKey: true,
      }),
      getUserMessage: vi.fn(() => 'AI error'),
    } as unknown as LessonAiApiService;
    const page = new AdminLessonContentReviewPage(
      route,
      router,
      repository,
      lessonContentAi,
      lessonAiApi,
    );

    await page.ngOnInit();
    page.approveSelectedActivity();
    expect(page.selectedActivity?.reviewStatus).toBe('pending');
    expect(page.saveError).toContain('اعتمد الصور');

    page.approveImage(page.vocabulary[0]);
    page.approveSelectedActivity();
    expect(page.selectedActivity?.reviewStatus).toBe('approved');
  });
});
