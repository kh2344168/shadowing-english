import { Injectable } from '@angular/core';
import { CourseLesson } from '../../features/lessons/data-access/lesson.models';
import { LessonRepository } from '../../features/lessons/data-access/lesson.repository';
import { CurriculumRepository } from '../../features/teacher/data-access/curriculum.repository';
import { TeacherGroupRepository } from '../../features/teacher/data-access/teacher-group.repository';

@Injectable({ providedIn: 'root' })
export class DemoContentService {
  private readonly demoLessonId = 'lesson-demo-call-center';
  private readonly manifestUrl = '/demo/call-center-introduction.json';
  private readonly audioUrl = '/demo/call-center-introduction.wav';

  constructor(
    private lessonRepository: LessonRepository,
    private curriculumRepository: CurriculumRepository,
    private groupRepository: TeacherGroupRepository,
  ) {}

  async initialize(): Promise<void> {
    if (this.lessonRepository.getAll().length > 0) {
      return;
    }

    try {
      const [manifestResponse, audioResponse] = await Promise.all([
        fetch(this.manifestUrl, { cache: 'no-store' }),
        fetch(this.audioUrl, { cache: 'no-store' }),
      ]);

      if (!manifestResponse.ok || !audioResponse.ok) {
        console.info(
          '[Demo lesson] Static demo files are not generated yet. Run scripts/create-demo-lesson.cmd.',
        );
        return;
      }

      const lesson = (await manifestResponse.json()) as CourseLesson;
      const audioBlob = await audioResponse.blob();

      if (!this.isValidDemoLesson(lesson) || audioBlob.size === 0) {
        console.warn('[Demo lesson] The generated demo files are invalid.');
        return;
      }

      try {
        await this.lessonRepository.saveLessonToDatabase(lesson, audioBlob);
      } catch (error) {
        console.warn(
          '[Demo lesson] The API is unavailable; demo lesson seeding was skipped.',
          error,
        );
        return;
      }

      this.ensureDemoLessonIsPublished();
    } catch (error) {
      console.warn('[Demo lesson] The app started without static demo content.', error);
    }
  }

  private ensureDemoLessonIsPublished(): void {
    const groups = this.groupRepository.getGroups();
    const targetCurriculum =
      this.curriculumRepository.getById(groups[0]?.curriculumId || '') ||
      this.curriculumRepository.getAll()[0];

    if (!targetCurriculum) return;

    const alreadyPublished = targetCurriculum.weeks.some((week) =>
      week.days.some((day) =>
        day.lessonSlots.some((slot) => slot.lessonId === this.demoLessonId),
      ),
    );

    if (alreadyPublished) return;

    const firstWeek = targetCurriculum.weeks[0];
    const firstDay = firstWeek?.days[0];
    const lesson = this.lessonRepository.getById(this.demoLessonId);

    if (!firstWeek || !firstDay || !lesson) return;

    const updatedCurriculum = this.curriculumRepository.addLessonToDay(
      targetCurriculum,
      firstWeek.id,
      firstDay.id,
      lesson,
      lesson.requiredRepetitions,
      true,
    );

    for (const group of groups) {
      if (group.curriculumId === updatedCurriculum.id) {
        this.groupRepository.changeCurriculum(group.id, updatedCurriculum.id);
      }
    }
  }

  private isValidDemoLesson(lesson: CourseLesson): boolean {
    return (
      lesson?.id === this.demoLessonId &&
      lesson.title?.trim().length > 0 &&
      lesson.requiredRepetitions > 0 &&
      Array.isArray(lesson.segments) &&
      lesson.segments.length > 0
    );
  }
}
