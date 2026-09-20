import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/auth/services/auth.service';
import { StudentCourseFacade } from '../../data-access/student-course.facade';
import { StudentKnowledgeBankService } from '../../data-access/student-knowledge-bank.service';
import { StudentReportService, StudentReportView } from '../../data-access/student-report.service';
import { StudentCourseView } from '../../data-access/student-learning.models';

@Component({
  selector: 'app-student-report-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './student-report.page.html',
  styleUrl: './student-report.page.scss',
})
export class StudentReportPage implements OnInit {
  course: StudentCourseView | null = null;
  report: StudentReportView | null = null;
  readonly loading = signal(true);
  readonly exporting = signal(false);
  copied = false;

  constructor(
    private courseFacade: StudentCourseFacade,
    private reportService: StudentReportService,
    private knowledgeBank: StudentKnowledgeBankService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit(): Promise<void> {
    this.course = await this.courseFacade.initialize();
    this.report = this.reportService.buildReport(this.course);
    this.loading.set(false);
    this.cdr.detectChanges();
  }

  async downloadPdf(): Promise<void> {
    if (!this.report || this.exporting()) return;
    this.exporting.set(true);
    this.cdr.detectChanges();
    try {
      await this.reportService.downloadPdf(this.report);
    } finally {
      this.exporting.set(false);
      this.cdr.detectChanges();
    }
  }

  async copyAiContext(): Promise<void> {
    if (!this.course) return;
    const text = this.knowledgeBank.buildAiContextText(
      this.course,
      this.auth.currentUser?.name || 'Student',
    );
    try {
      await navigator.clipboard.writeText(text);
      this.copied = true;
      window.setTimeout(() => {
        this.copied = false;
        this.cdr.detectChanges();
      }, 1800);
    } catch {
      this.copied = false;
    }
  }

  formatDate(value?: string): string {
    if (!value) return '—';
    try {
      return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
    } catch {
      return value;
    }
  }
}
