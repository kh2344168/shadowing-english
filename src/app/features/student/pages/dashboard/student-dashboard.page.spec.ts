import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { AuthService } from '../../../../core/auth/services/auth.service';
import { StudentCourseFacade } from '../../data-access/student-course.facade';
import { StudentCourseView } from '../../data-access/student-learning.models';
import { StudentDashboardPage } from './student-dashboard.page';

const emptyCourse: StudentCourseView = {
  courseName: 'Demo course',
  groupName: 'Group A',
  weeks: [],
  lessons: [],
  currentLesson: null,
  completedLessons: 0,
  totalLessons: 0,
  progressPercent: 0,
};

describe('StudentDashboardPage', () => {
  it('renders automatically when the asynchronous course load finishes', async () => {
    await TestBed.configureTestingModule({
      imports: [StudentDashboardPage],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { currentUser: { name: 'Khaled Demo' } },
        },
        {
          provide: StudentCourseFacade,
          useValue: {
            initialize: async () => emptyCourse,
            getReviews: () => [],
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(StudentDashboardPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('بنجهز مسارك');

    // Let the mocked async repository resolve; the signal must then schedule
    // the render by itself, without a click or a manual detectChanges call.
    await Promise.resolve();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).not.toContain('بنجهز مسارك');
    expect(fixture.nativeElement.textContent).toContain('أهلًا يا Khaled');
  });
});
