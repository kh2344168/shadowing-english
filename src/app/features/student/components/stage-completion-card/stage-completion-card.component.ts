import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

export interface StageCompletionMetric {
  label: string;
  value: string;
}

export interface StageCompletionInsightSection {
  title: string;
  items: string[];
  tone?: 'focus' | 'review' | 'success';
}

@Component({
  selector: 'app-stage-completion-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './stage-completion-card.component.html',
  styleUrl: './stage-completion-card.component.scss',
})
export class StageCompletionCardComponent {
  @Input() open = false;
  @Input() stageLabel = '';
  @Input() nextStageLabel = '';
  @Input() score: number | null = null;
  @Input() scoreLabel = 'نتيجة المرحلة';
  @Input() qualityLabel = '';
  @Input() note = '';
  @Input() metrics: StageCompletionMetric[] = [];
  @Input() insightSections: StageCompletionInsightSection[] = [];
  @Input() completedStages = 0;
  @Input() totalStages = 0;
  @Input() lessonComplete = false;
  @Input() secondaryActionLabel = 'مراجعة المرحلة';
  @Input() primaryActionLabel = '';

  @Output() continue = new EventEmitter<void>();
  @Output() review = new EventEmitter<void>();

  get normalizedScore(): number | null {
    if (this.score === null || !Number.isFinite(this.score)) return null;
    return Math.max(0, Math.min(100, Math.round(this.score)));
  }

  get resolvedPrimaryActionLabel(): string {
    if (this.primaryActionLabel.trim()) return this.primaryActionLabel;
    return this.lessonComplete ? 'إنهاء الدرس ←' : 'المرحلة التالية ←';
  }

  get progressPercent(): number {
    if (!this.totalStages) return 0;
    return Math.max(0, Math.min(100, Math.round((this.completedStages / this.totalStages) * 100)));
  }
}
