import { describe, expect, it } from 'vitest';
import { StudentLessonContentService } from './student-lesson-content.service';
import { StudentKnowledgeBankService } from './student-knowledge-bank.service';
import { StudentCourseView } from './student-learning.models';

describe('StudentKnowledgeBankService', () => {
  it('collects completed vocabulary and shadowing content without duplicates', () => {
    const service = new StudentKnowledgeBankService(new StudentLessonContentService());
    const course = {
      courseName: 'A1',
      groupName: 'Group A',
      weeks: [],
      currentLesson: null,
      completedLessons: 1,
      totalLessons: 1,
      progressPercent: 100,
      lessons: [
        {
          lesson: {
            id: 'lesson-1',
            title: 'Free Time',
            status: 'ready',
            requiredRepetitions: 1,
            mediaFileName: '',
            mediaType: 'audio/mpeg',
            segments: [
              { text: 'I play football on Fridays.', translation: 'ألعب كرة القدم يوم الجمعة.', start: 0, end: 2 },
            ],
            vocabulary: [
              { term: 'football', translation: 'كرة القدم', example: 'I play football.', kind: 'word' },
              { term: 'football', translation: 'كرة القدم', example: 'I play football.', kind: 'word' },
              { term: 'free time', translation: 'وقت الفراغ', example: 'In my free time...', kind: 'chunk' },
            ],
            activities: [
              { id: 'shadowing', type: 'shadowing', title: 'Shadowing', order: 0, enabled: true },
              { id: 'vocabulary', type: 'vocabulary', title: 'Vocabulary', order: 1, enabled: true },
            ],
            scriptLines: [],
            createdAt: '2026-09-17T00:00:00.000Z',
            updatedAt: '2026-09-17T00:00:00.000Z',
          },
          progress: null,
          groupId: 'group-1',
          curriculumSlotId: 'slot-1',
          weekId: 'week-1',
          weekName: 'Week 1',
          weekOrder: 1,
          lessonOrder: 1,
          required: true,
          status: 'completed',
          stages: [
            { id: 'shadowing', activityType: 'shadowing', label: 'Shadowing', shortLabel: 'ردد', description: '', durationMinutes: 1, status: 'completed', path: '' },
            { id: 'vocabulary', activityType: 'vocabulary', label: 'Vocabulary', shortLabel: 'افهم', description: '', durationMinutes: 1, status: 'completed', path: '' },
          ],
          currentStage: 'vocabulary',
          completedStageCount: 2,
          progressPercent: 100,
          isLocked: false,
          isCompleted: true,
          nextPath: '',
        },
      ],
    } as StudentCourseView;

    const bank = service.buildBank(course);
    expect(bank.words.map((item) => item.text)).toEqual(['football']);
    expect(bank.chunks.map((item) => item.text)).toEqual(['free time']);
    expect(bank.sentences.map((item) => item.text)).toEqual(['I play football on Fridays.']);
  });
});
