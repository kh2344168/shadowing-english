import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { StudentCourseFacade } from '../../data-access/student-course.facade';
import { StudentLessonView } from '../../data-access/student-learning.models';

@Component({
  selector: 'app-student-lesson-overview-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './student-lesson-overview.page.html',
  styleUrl: './student-lesson-overview.page.scss',
})
export class StudentLessonOverviewPage implements OnInit {
  lessonView: StudentLessonView | null = null;
  readonly loading = signal(true);

  constructor(
    private route: ActivatedRoute,
    private courseFacade: StudentCourseFacade,
    private cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.courseFacade.initialize();
    this.lessonView = this.courseFacade.getLesson(
      this.route.snapshot.paramMap.get('lessonId') || '',
      this.route.snapshot.queryParamMap.get('slotId') || '',
    );
    this.loading.set(false);
    this.cdr.detectChanges();
  }

  get actionLabel(): string {
    if (!this.lessonView) return '';
    if (this.lessonView.isCompleted) return 'راجع الشادوينج';
    return this.lessonView.completedStageCount ? 'كمّل المرحلة التالية' : 'ابدأ الشادوينج';
  }

  get actionPath(): string {
    if (!this.lessonView) return '/student/dashboard';
    return this.lessonView.isCompleted
      ? this.lessonView.stages.find((stage) => stage.activityType === 'shadowing')?.path ||
        `/student/lessons/${this.lessonView.lesson.id}`
      : this.lessonView.nextPath;
  }
}
