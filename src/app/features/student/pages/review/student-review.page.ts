import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { StudentCourseFacade } from '../../data-access/student-course.facade';
import { StudentReviewView } from '../../data-access/student-learning.models';

@Component({
  selector: 'app-student-review-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './student-review.page.html',
  styleUrl: './student-review.page.scss',
})
export class StudentReviewPage implements OnInit {
  reviews: StudentReviewView[] = [];
  activeReview: StudentReviewView | null = null;
  activeSegmentIndex = 0;
  mediaUrl = '';
  readonly loading = signal(true);
  started = false;
  completed = false;
  previewMode = false;

  constructor(
    private route: ActivatedRoute,
    private courseFacade: StudentCourseFacade,
    private cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.courseFacade.initialize();
    this.previewMode = this.route.snapshot.queryParamMap.get('preview') === '1';
    this.reviews = this.courseFacade.getReviews(this.previewMode);
    const requestedSlotId = this.route.snapshot.queryParamMap.get('slotId') || '';
    this.activeReview =
      this.reviews.find((review) => review.curriculumSlotId === requestedSlotId) ||
      this.reviews[0] ||
      null;
    if (this.activeReview) {
      this.mediaUrl = this.activeReview.lessonView.lesson.mediaUrl?.trim() ||
        `/api/lessons/${encodeURIComponent(this.activeReview.lessonId)}/media`;
    }
    this.loading.set(false);
    this.cdr.detectChanges();
  }

  get activeSegment() {
    return this.activeReview?.lessonView.lesson.segments[this.activeSegmentIndex] || null;
  }

  begin(): void {
    this.started = true;
  }

  nextSegment(): void {
    if (!this.activeReview) return;
    const lastIndex = this.activeReview.lessonView.lesson.segments.length - 1;
    if (this.activeSegmentIndex < lastIndex) {
      this.activeSegmentIndex += 1;
      return;
    }
    if (!this.previewMode) this.courseFacade.completeReview(this.activeReview.id);
    this.completed = true;
  }
}
