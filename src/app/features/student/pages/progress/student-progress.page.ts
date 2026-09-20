import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StudentCourseFacade } from '../../data-access/student-course.facade';
import { StudentCourseView } from '../../data-access/student-learning.models';

@Component({
  selector: 'app-student-progress-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './student-progress.page.html',
  styleUrl: './student-progress.page.scss',
})
export class StudentProgressPage implements OnInit {
  course: StudentCourseView | null = null;
  reviewCount = 0;
  recordingCount = 0;
  readonly loading = signal(true);

  constructor(
    private courseFacade: StudentCourseFacade,
    private cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit(): Promise<void> {
    this.course = await this.courseFacade.initialize();
    this.reviewCount = this.courseFacade.getReviews(true).length;
    this.recordingCount = this.course.lessons.reduce(
      (total, lesson) => total + (lesson.progress?.recordingIds.length || 0),
      0,
    );
    this.loading.set(false);
    this.cdr.detectChanges();
  }
}
