import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProgressApiService } from '../../../core/api/progress-api.service';
import { StudentTrackingApiService } from '../../../core/api/student-tracking-api.service';
import { AppDiagnosticsService } from '../../../core/diagnostics/app-diagnostics.service';
import { StudentLearningRepository } from './student-learning.repository';

function createRepository(): StudentLearningRepository {
  const progressApi = undefined as unknown as ProgressApiService;
  const trackingApi = {
    trackEvent: vi.fn().mockResolvedValue(null),
  } as unknown as StudentTrackingApiService;
  const diagnostics = {
    start: vi.fn(() => () => 1),
    check: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  } as unknown as AppDiagnosticsService;
  return new StudentLearningRepository(progressApi, trackingApi, diagnostics);
}

describe('StudentLearningRepository', () => {
  let repository: StudentLearningRepository;
  const identity = {
    studentId: 'student-1',
    groupId: 'group-1',
    curriculumSlotId: 'slot-1',
    lessonId: 'lesson-1',
  };
  const stageOrder = [
    'shadowing',
    'vocabulary',
    'shadowing-review',
    'listen-write',
    'quiz',
    'ai-conversation',
  ];

  beforeEach(() => {
    localStorage.clear();
    repository = createRepository();
  });

  it('stores stage progress against the stable curriculum slot', () => {
    repository.completeStage(identity, 'shadowing', stageOrder);
    repository.completeStage(identity, 'vocabulary', stageOrder);

    const journey = repository.getJourney('student-1', 'group-1', 'slot-1');
    expect(journey?.lessonId).toBe('lesson-1');
    expect(journey?.completedStages).toEqual(['shadowing', 'vocabulary']);
    expect(journey?.currentStage).toBe('shadowing-review');
  });

  it('is idempotent when the same stage is completed again', () => {
    repository.completeStage(identity, 'shadowing', stageOrder);
    repository.completeStage(identity, 'shadowing', stageOrder);

    expect(
      repository.getJourney('student-1', 'group-1', 'slot-1')?.completedStages,
    ).toEqual(['shadowing']);
  });

  it('schedules spaced shadowing reviews after the full lesson is complete', () => {
    repository.completeStage(identity, 'shadowing', stageOrder);
    repository.completeStage(identity, 'vocabulary', stageOrder);
    repository.completeStage(identity, 'shadowing-review', stageOrder);
    repository.completeStage(identity, 'listen-write', stageOrder);
    repository.completeStage(identity, 'quiz', stageOrder, 100);
    repository.completeStage(identity, 'ai-conversation', stageOrder, 100);

    const reviews = repository.getReviews('student-1', 'group-1');
    expect(reviews.map((review) => review.intervalDays)).toEqual([1, 3, 7, 14]);
    expect(reviews.every((review) => review.curriculumSlotId === 'slot-1')).toBe(true);
    expect(
      repository.getJourney('student-1', 'group-1', 'slot-1')?.completedAt,
    ).toBeTruthy();
  });

  it('marks one review complete without changing later reviews', () => {
    repository.completeStage(identity, 'shadowing', stageOrder);
    repository.completeStage(identity, 'vocabulary', stageOrder);
    repository.completeStage(identity, 'shadowing-review', stageOrder);
    repository.completeStage(identity, 'listen-write', stageOrder);
    repository.completeStage(identity, 'quiz', stageOrder, 80);
    repository.completeStage(identity, 'ai-conversation', stageOrder);
    const reviews = repository.getReviews('student-1', 'group-1');

    repository.completeReview(reviews[0].id);
    const updated = repository.getReviews('student-1', 'group-1');

    expect(updated[0].status).toBe('completed');
    expect(updated.slice(1).every((review) => review.status === 'scheduled')).toBe(true);
  });
});

it('stores one conversation summary for the curriculum slot', () => {
  localStorage.clear();
  const repository = createRepository();
  repository.saveConversationSummary({
    id: 'conversation-slot-1',
    studentId: 'student-1',
    groupId: 'group-1',
    curriculumSlotId: 'slot-1',
    lessonId: 'lesson-1',
    totalStudentTurns: 7,
    acceptedTurns: 6,
    goodAnswers: 4,
    correctionCount: 2,
    usedTargetPhrases: ['right now', 'at the moment', 'right now'],
  });

  const summaries = repository.getConversationSummaries('student-1', 'group-1');
  expect(summaries).toHaveLength(1);
  expect(summaries[0].acceptedTurns).toBe(6);
  expect(summaries[0].usedTargetPhrases).toEqual(['right now', 'at the moment']);
});
