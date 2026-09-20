import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/auth/services/auth.service';
import { StudentCourseFacade } from '../../data-access/student-course.facade';
import {
  StudentCourseView,
  StudentLessonView,
  StudentReviewView,
  StudentWeekView,
} from '../../data-access/student-learning.models';

@Component({
  selector: 'app-student-dashboard-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './student-dashboard.page.html',
  styleUrl: './student-dashboard.page.scss',
})
export class StudentDashboardPage implements OnInit {
  readonly loading = signal(true);
  course: StudentCourseView | null = null;
  reviews: StudentReviewView[] = [];

  constructor(
    public auth: AuthService,
    private courseFacade: StudentCourseFacade,
    private cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit(): Promise<void> {
    this.course = await this.courseFacade.initialize();
    this.reviews = this.courseFacade.getReviews();
    this.loading.set(false);
    this.cdr.detectChanges();
  }

  get studentFirstName(): string {
    return (this.auth.currentUser?.name || 'يا بطل').split(' ')[0];
  }

  get currentLesson(): StudentLessonView | null {
    return this.course?.currentLesson || null;
  }

  get currentWeek(): StudentWeekView | null {
    if (!this.course) return null;
    return (
      this.course.weeks.find((week) =>
        week.lessons.some((lesson) => !lesson.isLocked && !lesson.isCompleted),
      ) ||
      this.course.weeks.find((week) => week.status !== 'locked') ||
      null
    );
  }

  get primaryActionLabel(): string {
    if (!this.currentLesson) return 'استعرض الأسابيع';
    if (this.currentLesson.isCompleted) return 'راجع الدرس';
    return this.currentLesson.completedStageCount > 0 ? 'كمّل من مكانك' : 'ابدأ درس اليوم';
  }
}
