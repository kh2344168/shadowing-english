import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { StudentCourseFacade } from '../../data-access/student-course.facade';
import { StudentLessonView } from '../../data-access/student-learning.models';

@Component({
  selector: 'app-student-lesson-complete-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './student-lesson-complete.page.html',
  styleUrl: './student-lesson-complete.page.scss',
})
export class StudentLessonCompletePage implements OnInit {
  lessonView: StudentLessonView | null = null;
  nextLesson: StudentLessonView | null = null;
  readonly loading = signal(true);

  constructor(
    private route: ActivatedRoute,
    private courseFacade: StudentCourseFacade,
    private cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.courseFacade.initialize();
    const course = this.courseFacade.getCourse();
    this.lessonView = this.courseFacade.getLesson(
      this.route.snapshot.paramMap.get('lessonId') || '',
      this.route.snapshot.queryParamMap.get('slotId') || '',
    );
    const index = this.lessonView
      ? course.lessons.findIndex((lesson) => lesson.curriculumSlotId === this.lessonView?.curriculumSlotId)
      : -1;
    this.nextLesson = index >= 0 ? course.lessons[index + 1] || null : null;
    this.loading.set(false);
    this.cdr.detectChanges();
  }
}
