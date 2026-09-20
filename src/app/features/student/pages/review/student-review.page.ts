import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LessonRepository } from '../../../lessons/data-access/lesson.repository';
import { StudentCourseFacade } from '../../data-access/student-course.facade';
import { StudentReviewView } from '../../data-access/student-learning.models';

@Component({
  selector: 'app-student-review-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './student-review.page.html',
  styleUrl: './student-review.page.scss',
})
export class StudentReviewPage implements OnInit, OnDestroy {
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
    private lessonRepository: LessonRepository,
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
      const mediaBlob = await this.lessonRepository.getMediaBlob(this.activeReview.lessonId);
      if (mediaBlob) this.mediaUrl = URL.createObjectURL(mediaBlob);
    }
    this.loading.set(false);
    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    if (this.mediaUrl) URL.revokeObjectURL(this.mediaUrl);
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
