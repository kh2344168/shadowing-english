import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth/services/auth.service';
import { ProgressApiService } from '../../../core/api/progress-api.service';
import { StudentTrackingApiService } from '../../../core/api/student-tracking-api.service';
import { AppDiagnosticsService } from '../../../core/diagnostics/app-diagnostics.service';
import { CourseLesson } from '../../lessons/data-access/lesson.models';
import { LessonRepository } from '../../lessons/data-access/lesson.repository';
import { GroupCurriculumRepository } from '../../teacher/data-access/group-curriculum.repository';
import { StudentRepository } from '../../teacher/data-access/student.repository';
import { TeacherGroupRepository } from '../../teacher/data-access/teacher-group.repository';
import {
  getStudentStageDefinitions,
  StudentCourseView,
  StudentLessonView,
  StudentReviewView,
  StudentStageId,
  StudentStageView,
  StudentWeekView,
} from './student-learning.models';
import { StudentLearningRepository } from './student-learning.repository';

@Injectable({ providedIn: 'root' })
export class StudentCourseFacade {
  private initializePromise: Promise<void> | null = null;
  private lastInitializedAt = 0;
  private readonly refreshWindowMs = 30_000;

  constructor(
    private auth: AuthService,
    private lessonRepository: LessonRepository,
    private studentRepository: StudentRepository,
    private groupRepository: TeacherGroupRepository,
    private groupCurriculumRepository: GroupCurriculumRepository,
    private learningRepository: StudentLearningRepository,
    private progressApi: ProgressApiService,
    private trackingApi: StudentTrackingApiService,
    private diagnostics: AppDiagnosticsService,
  ) {}

  async initialize(forceRefresh = false): Promise<StudentCourseView> {
    const elapsed = this.diagnostics.start('StudentCourse', 'initialize', { forceRefresh, studentId: this.studentId });
    const cacheIsFresh = Date.now() - this.lastInitializedAt < this.refreshWindowMs;
    if (!forceRefresh && this.lastInitializedAt > 0) {
      const cached = this.getCourse();
      if (!cacheIsFresh && !this.initializePromise) {
        this.diagnostics.info('StudentCourse', 'initialize:stale-cache-background-refresh', {
          studentId: this.studentId,
          ageMs: Date.now() - this.lastInitializedAt,
          lessons: cached.totalLessons,
        });
        this.initializePromise = this.refreshPublishedCourse().finally(() => {
          this.initializePromise = null;
        });
      }
      this.diagnostics.success('StudentCourse', 'initialize', elapsed(), {
        studentId: this.studentId,
        source: cacheIsFresh ? 'memory-cache' : 'stale-memory-cache',
        lessons: cached.totalLessons,
        progressPercent: cached.progressPercent,
      });
      return cached;
    }

    if (!this.initializePromise) {
      this.initializePromise = this.refreshPublishedCourse().finally(() => {
        this.initializePromise = null;
      });
    }
    await this.initializePromise;
    const course = this.getCourse();
    this.diagnostics.success('StudentCourse', 'initialize', elapsed(), {
      studentId: this.studentId, lessons: course.totalLessons, progressPercent: course.progressPercent,
    });
    return course;
  }

  getCourse(): StudentCourseView {
    const group = this.getStudentGroup();
    const empty: StudentCourseView = {
      courseName: 'منهجك',
      groupName: '',
      weeks: [],
      lessons: [],
      currentLesson: null,
      completedLessons: 0,
      totalLessons: 0,
      progressPercent: 0,
    };
    if (!group) return empty;

    const lessonsById = new Map(
      this.lessonRepository.getAll().map((lesson) => [lesson.id, lesson]),
    );
    const weeks: StudentWeekView[] = [];
    const allLessons: StudentLessonView[] = [];
    let previousRequiredCompleted = true;

    for (const week of [...group.publishedCurriculum.weeks].sort(
      (left, right) => left.order - right.order,
    )) {
      const weekLessons: StudentLessonView[] = [];
      let lessonOrder = 0;
      for (const day of [...week.days].sort((left, right) => left.order - right.order)) {
        for (const slot of [...day.lessonSlots].sort((left, right) => left.order - right.order)) {
          const source = lessonsById.get(slot.lessonId);
          // The group Published Snapshot is the exposure gate for students. Once an
          // admin explicitly publishes a slot, library metadata such as legacy
          // `draft`/`archived` must not make the published course silently disappear.
          // Only a genuinely missing lesson row is skipped.
          if (!source) {
            this.diagnostics.warn('StudentCourse', 'published-lesson-missing', {
              studentId: this.studentId,
              groupId: group.id,
              curriculumSlotId: slot.id,
              lessonId: slot.lessonId,
            });
            if (slot.required) previousRequiredCompleted = false;
            continue;
          }
          const lesson: CourseLesson = {
            ...source,
            weekName: week.name,
            dayName: day.name,
            requiredRepetitions: Math.max(1, slot.repetitionCount),
          };
          const view = this.createLessonView(
            lesson,
            group.id,
            week.id,
            week.name,
            week.order,
            lessonOrder,
            slot.id,
            slot.required,
            previousRequiredCompleted,
          );
          weekLessons.push(view);
          allLessons.push(view);
          lessonOrder += 1;
          if (slot.required) previousRequiredCompleted = view.isCompleted;
        }
      }

      const completed = weekLessons.filter((lesson) => lesson.isCompleted).length;
      const progressPercent = weekLessons.length
        ? Math.round((completed / weekLessons.length) * 100)
        : 0;
      const hasStarted = weekLessons.some((lesson) => lesson.completedStageCount > 0);
      weeks.push({
        id: week.id,
        name: week.name,
        order: week.order,
        lessons: weekLessons,
        progressPercent,
        status:
          weekLessons.length > 0 && completed === weekLessons.length
            ? 'completed'
            : weekLessons.some((lesson) => !lesson.isLocked)
              ? hasStarted
                ? 'in-progress'
                : 'available'
              : 'locked',
      });
    }

    const completedLessons = allLessons.filter((lesson) => lesson.isCompleted).length;
    const currentLesson =
      allLessons.find((lesson) => !lesson.isLocked && !lesson.isCompleted) ||
      [...allLessons].reverse().find((lesson) => lesson.isCompleted) ||
      null;

    return {
      courseName: group.curriculumName || group.publishedCurriculum.sourceCurriculumName,
      groupName: group.name,
      weeks,
      lessons: allLessons,
      currentLesson,
      completedLessons,
      totalLessons: allLessons.length,
      progressPercent: allLessons.length
        ? Math.round((completedLessons / allLessons.length) * 100)
        : 0,
    };
  }

  getWeek(weekId: string): StudentWeekView | null {
    return this.getCourse().weeks.find((week) => week.id === weekId) || null;
  }

  getLesson(lessonId: string, curriculumSlotId: string): StudentLessonView | null {
    const course = this.getCourse();
    return (
      course.lessons.find(
        (item) =>
          item.lesson.id === lessonId &&
          (!curriculumSlotId || item.curriculumSlotId === curriculumSlotId),
      ) || null
    );
  }

  completeStage(
    lesson: StudentLessonView,
    stageId: StudentStageId,
    quizScore?: number,
  ): StudentLessonView | null {
    const requestedIndex = lesson.stages.findIndex((stage) => stage.id === stageId);
    const firstIncompleteIndex = lesson.stages.findIndex((stage) => stage.status !== 'completed');
    if (
      lesson.isLocked ||
      requestedIndex === -1 ||
      requestedIndex > Math.max(firstIncompleteIndex, 0)
    ) return lesson;

    const stageOrder = lesson.stages.map((stage) => stage.id);
    const identity = {
      studentId: this.studentId,
      groupId: lesson.groupId,
      curriculumSlotId: lesson.curriculumSlotId,
      lessonId: lesson.lesson.id,
    };

    // Shadowing completion lives in the established progress repository. Mirror every
    // completed stage into the journey store before advancing so review scheduling is
    // complete without duplicating the sensitive recording/player logic.
    for (const completed of lesson.stages.filter((item) => item.status === 'completed')) {
      this.learningRepository.completeStage(identity, completed.id, stageOrder);
    }
    this.learningRepository.completeStage(identity, stageId, stageOrder, quizScore);
    return this.getLesson(lesson.lesson.id, lesson.curriculumSlotId);
  }

  getReviews(includeUpcoming = false): StudentReviewView[] {
    const group = this.getStudentGroup();
    if (!group) return [];
    const now = Date.now();
    const course = this.getCourse();

    return this.learningRepository
      .getReviews(this.studentId, group.id)
      .filter(
        (review) =>
          review.status === 'scheduled' &&
          (includeUpcoming || new Date(review.dueAt).getTime() <= now),
      )
      .map((review) => {
        const lessonView = course.lessons.find(
          (lesson) => lesson.curriculumSlotId === review.curriculumSlotId,
        );
        if (!lessonView) return null;
        return {
          ...review,
          lessonView,
          isDue: new Date(review.dueAt).getTime() <= now,
        };
      })
      .filter((review): review is StudentReviewView => review !== null);
  }

  completeReview(reviewId: string): void {
    this.learningRepository.completeReview(reviewId);
  }

  private createLessonView(
    lesson: CourseLesson,
    groupId: string,
    weekId: string,
    weekName: string,
    weekOrder: number,
    lessonOrder: number,
    curriculumSlotId: string,
    required: boolean,
    sequenceUnlocked: boolean,
  ): StudentLessonView {
    const progress = this.studentRepository.getProgress(
      this.studentId,
      lesson.id,
      curriculumSlotId,
      groupId,
    );
    const journey = this.learningRepository.getJourney(
      this.studentId,
      groupId,
      curriculumSlotId,
    );
    const stageDefinitions = getStudentStageDefinitions(lesson);
    const completedStages = new Set<StudentStageId>(journey?.completedStages || []);
    if (
      progress &&
      progress.requiredRepetitions > 0 &&
      progress.completedRepetitions >= progress.requiredRepetitions
    ) {
      const primaryShadowing = stageDefinitions.find(
        (stage) => stage.activityType === 'shadowing',
      );
      if (primaryShadowing) completedStages.add(primaryShadowing.id);
    }

    const completedStageCount = stageDefinitions.filter((stage) =>
      completedStages.has(stage.id),
    ).length;
    const isCompleted =
      stageDefinitions.length > 0 && completedStageCount === stageDefinitions.length;
    const isLocked = !sequenceUnlocked && !isCompleted;
    const firstIncompleteIndex = stageDefinitions.findIndex(
      (stage) => !completedStages.has(stage.id),
    );
    const currentStage =
      stageDefinitions[firstIncompleteIndex < 0 ? stageDefinitions.length - 1 : firstIncompleteIndex].id;
    const stages: StudentStageView[] = stageDefinitions.map((stage, index) => ({
      ...stage,
      path: this.stagePath(lesson.id, stage),
      status: completedStages.has(stage.id)
        ? 'completed'
        : isLocked || index > firstIncompleteIndex
          ? 'locked'
          : completedStageCount > 0
            ? 'current'
            : 'available',
    }));
    const nextPath = isCompleted
      ? `/student/lessons/${lesson.id}/complete`
      : stages.find((stage) => stage.id === currentStage)?.path ||
        `/student/lessons/${lesson.id}`;

    return {
      lesson,
      progress,
      groupId,
      curriculumSlotId,
      weekId,
      weekName,
      weekOrder,
      lessonOrder,
      required,
      status: isCompleted
        ? 'completed'
        : isLocked
          ? 'locked'
          : completedStageCount > 0
            ? 'in-progress'
            : 'available',
      stages,
      currentStage,
      completedStageCount,
      progressPercent: Math.round(
        (completedStageCount / Math.max(stageDefinitions.length, 1)) * 100,
      ),
      isLocked,
      isCompleted,
      nextPath,
    };
  }

  private stagePath(
    lessonId: string,
    stage: StudentStageView | ReturnType<typeof getStudentStageDefinitions>[number],
  ): string {
    return stage.activityType === 'shadowing' || stage.activityType === 'shadowing-review'
      ? `/student/lessons/${lessonId}/shadowing/${stage.id}`
      : `/student/lessons/${lessonId}/stage/${stage.id}`;
  }

  private get studentId(): string {
    return this.auth.currentUser?.studentId || '';
  }

  private getStudentGroup() {
    const student = this.studentRepository.findById(this.studentId);
    return student ? this.groupRepository.getById(student.groupId) : null;
  }

  private async refreshPublishedCourse(): Promise<void> {
    const elapsed = this.diagnostics.start('StudentCourse', 'refresh-published-course', {
      studentId: this.studentId,
      authGroupId: this.auth.currentUser?.groupId || '',
    });

    const authUser = this.auth.currentUser;
    const authGroupId = authUser?.role === 'student' ? (authUser.groupId || '') : '';
    const authGroupName = authUser?.role === 'student' ? (authUser.groupName || authGroupId) : '';
    if (authGroupId) {
      // A student must be able to build the course on a brand-new browser where the
      // admin directory has never been cached. Bootstrap only the student's own group
      // from the authenticated backend session, then hydrate its published snapshot.
      this.groupRepository.ensureRemoteGroup(
        authGroupId,
        authGroupName,
        authUser?.cefrLevel || 'A1',
      );
      this.diagnostics.check('StudentCourse', 'session-group-bootstrap', true, {
        studentId: this.studentId,
        groupId: authGroupId,
        groupName: authGroupName,
      });
    }

    const student = this.studentRepository.findById(this.studentId);
    const effectiveGroupId = authGroupId || student?.groupId || '';
    const group = effectiveGroupId ? this.groupRepository.getById(effectiveGroupId) : null;
    this.diagnostics.check('StudentCourse', 'student-group-resolved', !!group && !!student, {
      studentId: this.studentId,
      authGroupId,
      studentGroupId: student?.groupId || '',
      effectiveGroupId,
      groupFound: !!group,
      studentFound: !!student,
    });

    if (group && student) {
      // Student reads the server-published snapshot. Do not seed a missing backend
      // publication from the student's local cache; publishing belongs to admin/teacher.
      // Lesson metadata and the published curriculum are independent reads, so start
      // them together instead of paying two backend round-trips serially.
      const [, refreshedGroup] = await Promise.all([
        this.lessonRepository.initializeFromDatabase(),
        this.groupCurriculumRepository.refreshPublishedForGroup(group.id, false),
      ]);
      const publishedGroup = refreshedGroup || this.groupRepository.getById(effectiveGroupId) || group;
      const publishedSlotIds = publishedGroup.publishedCurriculum.weeks.flatMap((week) =>
        week.days.flatMap((day) => day.lessonSlots.map((slot) => slot.lessonId)),
      );
      const loadedLessonIds = new Set(this.lessonRepository.getAll().map((lesson) => lesson.id));
      const missingLessonIds = [...new Set(publishedSlotIds)].filter((lessonId) => !loadedLessonIds.has(lessonId));
      this.diagnostics.check('StudentCourse', 'published-snapshot-loaded', publishedGroup.publishedCurriculum.version > 0, {
        studentId: this.studentId,
        groupId: publishedGroup.id,
        curriculumId: publishedGroup.publishedCurriculum.sourceCurriculumId,
        version: publishedGroup.publishedCurriculum.version,
        publishedSlots: publishedSlotIds.length,
        loadedLessons: loadedLessonIds.size,
        missingLessonIds,
      });

      void this.trackingApi.trackEvent({
        studentId: this.studentId,
        studentName: student.name,
        groupId: publishedGroup.id,
        groupName: publishedGroup.name,
        cefrLevel: this.auth.currentUser?.cefrLevel || 'A1',
        lessonId: '',
        lessonTitle: '',
        curriculumSlotId: '',
        stageId: '',
        eventType: 'course_loaded',
        status: 'success',
        detailsJson: JSON.stringify({ curriculum: publishedGroup.curriculumName, version: publishedGroup.publishedCurriculum.version }),
        occurredAtUtc: new Date().toISOString(),
        correlationId: `course-loaded-${this.studentId}-${Date.now()}`,
      });

      // Learning-state and repetition progress are independent reads. Running them in
      // parallel removes another full network wait from the student's critical path.
      await Promise.all([
        this.learningRepository.hydrateFromBackend(
          this.studentId,
          publishedGroup.id,
          student.name,
          publishedGroup.name,
        ),
        this.loadRemoteProgress(publishedGroup.id),
      ]);

      const courseRows: {
        curriculumSlotId: string;
        lessonId: string;
        lessonTitle: string;
        completedRepetitions: number;
        requiredRepetitions: number;
        recordingCount: number;
      }[] = [];

      for (const week of publishedGroup.publishedCurriculum.weeks) {
        for (const day of week.days) {
          for (const slot of day.lessonSlots) {
            this.studentRepository.ensureProgressRowForCurriculumSlot(
              this.studentId,
              publishedGroup.id,
              slot.lessonId,
              slot.id,
              slot.repetitionCount,
            );
            const lesson = this.lessonRepository.getById(slot.lessonId);
            const progress = this.studentRepository.getProgress(
              this.studentId,
              slot.lessonId,
              slot.id,
              publishedGroup.id,
            );
            if (!lesson) continue;
            courseRows.push({
              curriculumSlotId: slot.id,
              lessonId: slot.lessonId,
              lessonTitle: lesson.title,
              completedRepetitions: progress?.completedRepetitions || 0,
              requiredRepetitions: Math.max(1, slot.repetitionCount),
              recordingCount: Math.max(
                progress?.recordingCount || 0,
                progress?.recordingIds.length || 0,
              ),
            });
          }
        }
      }

      // The GET above already provided the progress needed to render. Creating any new
      // SQL rows is maintenance work, so do it after the UI is allowed to become usable.
      void this.syncCourseProgressInBackground(
        publishedGroup.id,
        publishedGroup.name,
        student.name,
        courseRows,
      );
    } else {
      // Keep lesson metadata warm even when the group relationship is temporarily missing.
      await this.lessonRepository.initializeFromDatabase();
      this.diagnostics.warn('StudentCourse', 'refresh-published-course:no-group', {
        studentId: this.studentId,
        authGroupId,
        studentGroupId: student?.groupId || '',
      });
    }
    this.lastInitializedAt = Date.now();
    const course = this.getCourse();
    this.diagnostics.success('StudentCourse', 'refresh-published-course', elapsed(), {
      studentId: this.studentId,
      groupId: effectiveGroupId,
      renderedLessons: course.totalLessons,
      renderedWeeks: course.weeks.length,
    });
  }

  private async loadRemoteProgress(groupId: string): Promise<void> {
    const elapsed = this.diagnostics.start('StudentCourse', 'load-remote-progress', {
      studentId: this.studentId,
      groupId,
    });
    try {
      const remoteProgress = await firstValueFrom(
        this.progressApi.getStudentProgress(this.studentId),
      );
      const groupRows = remoteProgress.filter((item) => item.groupId === groupId);
      this.studentRepository.applyRemoteProgress(groupRows);
      this.diagnostics.success('StudentCourse', 'load-remote-progress', elapsed(), {
        studentId: this.studentId,
        groupId,
        rows: groupRows.length,
      });
    } catch (error) {
      this.diagnostics.error('StudentCourse', 'load-remote-progress:error', error, {
        studentId: this.studentId,
        groupId,
        durationMs: elapsed(),
      });
      // Keep the local cache when the backend is temporarily unavailable.
    }
  }

  private async syncCourseProgressInBackground(
    groupId: string,
    groupName: string,
    studentName: string,
    lessons: {
      curriculumSlotId: string;
      lessonId: string;
      lessonTitle: string;
      completedRepetitions: number;
      requiredRepetitions: number;
      recordingCount: number;
    }[],
  ): Promise<void> {
    const elapsed = this.diagnostics.start('StudentCourse', 'progress-sync-background', {
      studentId: this.studentId,
      groupId,
      lessonCount: lessons.length,
    });
    try {
      const synced = await firstValueFrom(
        this.progressApi.syncStudentCourse({
          studentId: this.studentId,
          studentName,
          groupId,
          groupName,
          lessons,
        }),
      );
      this.studentRepository.applyRemoteProgress(synced);
      this.diagnostics.success('StudentCourse', 'progress-sync-background', elapsed(), {
        studentId: this.studentId,
        groupId,
        rows: synced.length,
      });
      void this.trackingApi.trackEvent({
        studentId: this.studentId,
        studentName,
        groupId,
        groupName,
        cefrLevel: this.auth.currentUser?.cefrLevel || 'A1',
        lessonId: '',
        lessonTitle: '',
        curriculumSlotId: '',
        stageId: '',
        eventType: 'progress_synced',
        status: 'success',
        detailsJson: JSON.stringify({ rows: synced.length }),
        occurredAtUtc: new Date().toISOString(),
        correlationId: `progress-synced-${this.studentId}-${Date.now()}`,
      });
    } catch (error) {
      this.diagnostics.error('StudentCourse', 'progress-sync-background:error', error, {
        studentId: this.studentId,
        groupId,
        durationMs: elapsed(),
      });
    }
  }
}
