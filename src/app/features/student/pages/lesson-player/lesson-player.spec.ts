import { ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { ProgressApiService } from '../../../../core/api/progress-api.service';
import { AuthService } from '../../../../core/auth/services/auth.service';
import { LessonRepository } from '../../../lessons/data-access/lesson.repository';
import { RecordingRepository } from '../../../recordings/data-access/recording.repository';
import { StudentRepository } from '../../../teacher/data-access/student.repository';
import { TeacherGroupRepository } from '../../../teacher/data-access/teacher-group.repository';
import { StudentCourseFacade } from '../../data-access/student-course.facade';
import { StudentLessonPlayerPage } from './lesson-player';

describe('StudentLessonPlayerPage established controls', () => {
  it('pauses and resumes the same MediaRecorder and the same active turn timer', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const player = createPlayer();
    const completed = vi.fn();
    const recorder = {
      state: 'recording',
      requestData: vi.fn(),
      pause: vi.fn(function (this: { state: string }) {
        this.state = 'paused';
      }),
      resume: vi.fn(function (this: { state: string }) {
        this.state = 'recording';
      }),
    };

    player.state = 'student';
    (player as any).mediaRecorder = recorder;
    (player as any).studentTurnStartedAt = Date.now();
    (player as any).scheduleActiveTimer(1000, completed);

    vi.advanceTimersByTime(400);
    await player.pauseTraining();
    vi.advanceTimersByTime(2000);

    expect(player.state).toBe('paused');
    expect(recorder.pause).toHaveBeenCalledTimes(1);
    expect(completed).not.toHaveBeenCalled();

    await player.resumeTraining();
    vi.advanceTimersByTime(599);
    expect(completed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(recorder.resume).toHaveBeenCalledTimes(1);
    expect(completed).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('marks the active shadowing stage complete before navigating to the next tool', async () => {
    const lessonView = {
      stages: [
        { id: 'shadowing', path: '/student/lessons/lesson-1/shadowing/shadowing' },
        { id: 'vocabulary', path: '/student/lessons/lesson-1/stage/vocabulary' },
      ],
    };
    const courseFacade = {
      getLesson: vi.fn(() => lessonView),
      completeStage: vi.fn(() => lessonView),
    } as unknown as StudentCourseFacade;
    const router = {
      navigateByUrl: vi.fn().mockResolvedValue(true),
    } as unknown as Router;
    const player = createPlayer(router, courseFacade);

    player.lesson = {
      id: 'lesson-1',
      title: 'Demo lesson',
      requiredRepetitions: 1,
      mediaFileName: 'demo.mp3',
      mediaType: 'audio/mpeg',
      segments: [{ text: 'Hello', start: 0, end: 1 }],
      scriptLines: ['Hello'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    player.curriculumSlotId = 'slot-1';
    (player as any).activeGroupId = 'group-1';
    player.activeStageId = 'shadowing';

    await player.continueToNextStage();

    expect(courseFacade.completeStage).toHaveBeenCalledWith(
      lessonView,
      'shadowing',
    );
    expect(router.navigateByUrl).toHaveBeenCalledWith(
      '/student/lessons/lesson-1/stage/vocabulary?slotId=slot-1',
    );
  });
});

function createPlayer(
  router = { navigateByUrl: vi.fn().mockResolvedValue(true) } as unknown as Router,
  courseFacade = { getLesson: vi.fn(), completeStage: vi.fn() } as unknown as StudentCourseFacade,
): StudentLessonPlayerPage {
  return new StudentLessonPlayerPage(
    {} as ActivatedRoute,
    router,
    { currentUser: { studentId: 'student-1' } } as unknown as AuthService,
    {} as StudentRepository,
    {} as LessonRepository,
    {} as RecordingRepository,
    {} as TeacherGroupRepository,
    courseFacade,
    {} as ProgressApiService,
    { detectChanges: vi.fn() } as unknown as ChangeDetectorRef,
  );
}
