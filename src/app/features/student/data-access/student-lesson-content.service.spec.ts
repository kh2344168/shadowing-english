import { describe, expect, it } from 'vitest';
import { CourseLesson } from '../../lessons/data-access/lesson.models';
import { StudentLessonContentService } from './student-lesson-content.service';

describe('StudentLessonContentService teacher-reviewed vocabulary', () => {
  it('hides excluded words and exposes only images approved by the teacher', () => {
    const lesson: CourseLesson = {
      id: 'lesson-1',
      title: 'Lesson',
      requiredRepetitions: 1,
      mediaFileName: 'lesson.mp3',
      mediaType: 'audio/mpeg',
      segments: [{ text: 'Hello', translation: 'مرحبًا', start: 0, end: 1 }],
      vocabulary: [
        {
          term: 'hello',
          translation: 'مرحبًا',
          example: 'Hello, Khaled.',
          imageUrl: 'https://example.com/approved.jpg',
          imageApproved: true,
        },
        {
          term: 'welcome',
          translation: 'أهلًا',
          example: 'Welcome back.',
          imageUrl: 'https://example.com/unreviewed.jpg',
          imageApproved: false,
        },
        {
          term: 'car',
          translation: 'سيارة',
          example: 'The car is here.',
          includeForStudent: false,
        },
      ],
      scriptLines: ['Hello'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const cards = new StudentLessonContentService().getVocabulary(lesson);

    expect(cards[0].imageUrl).toBe('https://example.com/approved.jpg');
    expect(cards[1].imageUrl).toBeUndefined();
    expect(cards.map((card) => card.term)).not.toContain('car');
  });

  it('does not recreate fallback cards when the teacher hides every reviewed word', () => {
    const lesson: CourseLesson = {
      id: 'lesson-hidden-words',
      title: 'Hidden words',
      requiredRepetitions: 1,
      mediaFileName: 'lesson.mp3',
      mediaType: 'audio/mpeg',
      segments: [{ text: 'A hidden sentence', start: 0, end: 1 }],
      vocabulary: [
        {
          term: 'hidden',
          translation: 'مخفي',
          example: 'A hidden sentence',
          includeForStudent: false,
        },
      ],
      scriptLines: ['A hidden sentence'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    expect(new StudentLessonContentService().getVocabulary(lesson)).toEqual([]);
  });

  it('uses only the quiz questions approved in the lesson activity', () => {
    const lesson: CourseLesson = {
      id: 'lesson-reviewed-quiz',
      title: 'Reviewed quiz',
      requiredRepetitions: 1,
      mediaFileName: 'lesson.mp3',
      mediaType: 'audio/mpeg',
      segments: [{ text: 'Hello', start: 0, end: 1 }],
      activities: [
        {
          id: 'quiz',
          type: 'quiz',
          title: 'اختبار الدرس',
          order: 0,
          enabled: true,
          quizQuestions: [
            {
              id: 'visible-question',
              type: 'multiple-choice',
              prompt: 'Visible?',
              options: ['Yes', 'No'],
              correctAnswer: 'Yes',
              feedback: 'Correct',
              enabled: true,
            },
            {
              id: 'hidden-question',
              type: 'multiple-choice',
              prompt: 'Hidden?',
              options: ['Yes', 'No'],
              correctAnswer: 'No',
              feedback: '',
              enabled: false,
            },
          ],
        },
      ],
      scriptLines: ['Hello'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const questions = new StudentLessonContentService().getQuiz(lesson, 'quiz');

    expect(questions.map((question) => question.id)).toEqual(['visible-question']);
  });
});
