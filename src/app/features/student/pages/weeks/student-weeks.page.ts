import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StudentCourseFacade } from '../../data-access/student-course.facade';
import { StudentCourseView } from '../../data-access/student-learning.models';

@Component({
  selector: 'app-student-weeks-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './student-weeks.page.html',
  styleUrl: './student-weeks.page.scss',
})
export class StudentWeeksPage implements OnInit {
  course: StudentCourseView | null = null;
  readonly loading = signal(true);

  constructor(
    private courseFacade: StudentCourseFacade,
    private cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit(): Promise<void> {
    this.course = await this.courseFacade.initialize();
    this.loading.set(false);
    this.cdr.detectChanges();
  }
}
