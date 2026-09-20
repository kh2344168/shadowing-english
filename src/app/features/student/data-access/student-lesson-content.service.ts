import { Injectable } from '@angular/core';
import {
  CourseLesson,
  LessonQuizQuestion,
  getLessonActivities,
} from '../../lessons/data-access/lesson.models';

export interface VocabularyCard {
  id: string;
  kind: 'word' | 'chunk';
  term: string;
  translation: string;
  example: string;
  explanation?: string;
  extraExample?: string;
  usageNote?: string;
  imageAlt?: string;
  imageUrl?: string;
  imageProvider?: string;
}

@Injectable({ providedIn: 'root' })
export class StudentLessonContentService {
  getVocabulary(lesson: CourseLesson): VocabularyCard[] {
    const savedVocabulary = this.mapSavedVocabulary(lesson);
    const vocabularyActivity = getLessonActivities(lesson).find(
      (activity) => activity.type === 'vocabulary',
    );

    // Once the admin approves the vocabulary stage, the student receives the
    // exact saved snapshot only. No fallback extraction or AI regeneration runs here.
    if (vocabularyActivity?.reviewStatus === 'approved') {
      return savedVocabulary;
    }

    if (Array.isArray(lesson.vocabulary)) {
      return savedVocabulary;
    }

    if (lesson.id === 'lesson-demo-call-center') {
      return [
        {
          id: 'demo-customer-service',
          kind: 'chunk',
          term: 'customer service',
          translation: 'خدمة العملاء',
          example: 'Thank you for calling customer service.',
        },
        {
          id: 'demo-concern',
          kind: 'word',
          term: 'concern',
          translation: 'مشكلة أو أمر يسبب القلق',
          example: 'I understand your concern.',
        },
        {
          id: 'demo-check',
          kind: 'chunk',
          term: 'check that for you',
          translation: 'سأتحقق من ذلك من أجلك',
          example: 'I will check that for you.',
        },
        {
          id: 'demo-patience',
          kind: 'word',
          term: 'patience',
          translation: 'الصبر',
          example: 'Thank you for your patience.',
        },
      ];
    }

    return lesson.segments.slice(0, 5).map((segment, index) => ({
      id: `fallback-${index + 1}`,
      kind: segment.text.trim().includes(' ') ? 'chunk' : 'word',
      term: segment.text,
      translation: segment.translation || 'راجع معنى الجملة مع مدرسك.',
      example: segment.text,
    }));
  }

  private mapSavedVocabulary(lesson: CourseLesson): VocabularyCard[] {
    return (lesson.vocabulary || [])
      .filter(
        (item) => item.term.trim() && item.includeForStudent !== false,
      )
      .map((item, index) => ({
        id: item.id || `vocabulary-${index + 1}`,
        kind:
          item.kind === 'chunk' || item.term.trim().includes(' ')
            ? 'chunk'
            : 'word',
        term: item.term,
        translation: item.translation,
        example: item.example || item.term,
        explanation: item.explanation || '',
        extraExample: item.extraExample || '',
        usageNote: item.usageNote || '',
        imageAlt: item.imageAlt || `Context image for ${item.term}`,
        imageUrl:
          item.imageApproved && item.imageUrl ? item.imageUrl : undefined,
        imageProvider: item.imageProvider,
      }));
  }

  getQuiz(lesson: CourseLesson, activityId = ''): LessonQuizQuestion[] {
    const reviewedActivity = getLessonActivities(lesson).find(
      (activity) =>
        activity.type === 'quiz' && (!activityId || activity.id === activityId),
    );
    const reviewedQuestions = (reviewedActivity?.quizQuestions || [])
      .filter((question) => question.enabled !== false)
      .map((question) => ({
        ...question,
        options: [...question.options],
      }));

    if (reviewedActivity) return reviewedQuestions;

    if (lesson.id === 'lesson-demo-call-center') {
      return [
        {
          id: 'demo-quiz-1',
          type: 'multiple-choice',
          prompt: 'ما أنسب افتتاحية لمكالمة خدمة عملاء؟',
          options: [
            'Hello, thank you for calling customer service.',
            'See you next week.',
            'I do not know.',
          ],
          correctAnswer: 'Hello, thank you for calling customer service.',
          feedback: 'هذه افتتاحية مناسبة وواضحة لمكالمة خدمة العملاء.',
          enabled: true,
        },
        {
          id: 'demo-quiz-2',
          type: 'multiple-choice',
          prompt: 'ما معنى “I understand your concern”؟',
          options: ['سأغلق المكالمة', 'أتفهم مشكلتك', 'انتظر غدًا'],
          correctAnswer: 'أتفهم مشكلتك',
          feedback: 'الجملة تُظهر التعاطف مع مشكلة العميل.',
          enabled: true,
        },
        {
          id: 'demo-quiz-3',
          type: 'vocabulary-card',
          prompt: 'أي كلمة تعني «الصبر»؟',
          options: ['service', 'concern', 'patience'],
          correctAnswer: 'patience',
          feedback: 'Patience تعني الصبر.',
          enabled: true,
        },
      ];
    }

    const first = lesson.segments[0];
    return [
      {
        id: 'fallback-quiz-1',
        type: 'multiple-choice',
        prompt: 'أي جملة ظهرت في هذا الدرس؟',
        options: [first?.text || lesson.title, 'This sentence was not in the lesson.', 'Try again tomorrow.'],
        correctAnswer: first?.text || lesson.title,
        feedback: 'الإجابة مأخوذة من محتوى الدرس.',
        enabled: true,
      },
    ];
  }
}
