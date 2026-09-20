import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { StudentCourseFacade } from '../../data-access/student-course.facade';
import { StudentWeekView } from '../../data-access/student-learning.models';

@Component({
  selector: 'app-student-week-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './student-week.page.html',
  styleUrl: './student-week.page.scss',
})
export class StudentWeekPage implements OnInit {
  week: StudentWeekView | null = null;
  readonly loading = signal(true);

  constructor(
    private route: ActivatedRoute,
    private courseFacade: StudentCourseFacade,
    private cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.courseFacade.initialize();
    this.week = this.courseFacade.getWeek(this.route.snapshot.paramMap.get('weekId') || '');
    this.loading.set(false);
    this.cdr.detectChanges();
  }
}
