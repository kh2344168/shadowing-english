import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AdminStudentDetailDto, StudentActivityEventDto } from '../../../../core/api/student-tracking-api.models';
import { StudentTrackingApiService } from '../../../../core/api/student-tracking-api.service';
import { AppDiagnosticsService } from '../../../../core/diagnostics/app-diagnostics.service';

@Component({
  selector: 'app-admin-student-details-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './admin-student-details.page.html',
  styleUrl: './admin-student-details.page.scss',
})
export class AdminStudentDetailsPage implements OnInit {
  detail: AdminStudentDetailDto | null = null;
  loading = true;
  error = '';
  loadingMoreEvents = false;

  constructor(
    private route: ActivatedRoute,
    public api: StudentTrackingApiService,
    private diagnostics: AppDiagnosticsService,
  ) {}

  ngOnInit(): void {
    void this.load();
  }

  eventLabel(event: StudentActivityEventDto): string {
    const labels: Record<string, string> = {
      student_login: 'سجل الدخول',
      course_loaded: 'فتح المنهج',
      lesson_opened: 'فتح الدرس',
      stage_opened: 'فتح المرحلة',
      stage_completed: 'أنهى المرحلة',
      shadowing_recording_uploaded: 'رفع تسجيل شادوينج',
      conversation_recording_uploaded: 'رفع تسجيل محادثة',
      conversation_completed: 'أنهى محادثة الذكاء الاصطناعي',
      review_completed: 'أنهى مراجعة',
      progress_synced: 'تمت مزامنة التقدم',
      vocabulary_card_answered: 'راجع بطاقة من بنك الكلمات',
      dictation_answer_submitted: 'أرسل إجابة الاستماع والكتابة',
      dictation_correction_submitted: 'أرسل تصحيح الاستماع',
      quiz_answer_submitted: 'أجاب عن سؤال اختبار',
      conversation_started: 'بدأ محادثة الذكاء الاصطناعي',
      conversation_turn_evaluated: 'تم تقييم إجابة في المحادثة',
      conversation_turn_failed: 'تعذر تقييم إجابة في المحادثة',
      conversation_finish_failed: 'تعذر إنهاء المحادثة',
    };
    return labels[event.eventType] || event.eventType;
  }

  engagementLabel(status: string): string {
    if (status === 'committed') return 'ملتزم';
    if (status === 'needs-attention') return 'يحتاج متابعة';
    if (status === 'not-committed') return 'غير ملتزم';
    return 'لم يبدأ';
  }

  parseDetails(value: string): string {
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      return Object.entries(parsed).map(([key, item]) => `${key}: ${String(item)}`).join(' • ');
    } catch {
      return value;
    }
  }


  lessonTitle(lessonId: string): string {
    return this.detail?.lessons.find((lesson) => lesson.lessonId === lessonId)?.lessonTitle || lessonId || 'درس غير محدد';
  }

  durationLabel(durationMs: number | null | undefined): string {
    if (durationMs == null) return '—';
    if (durationMs < 1000) return `${durationMs} ms`;
    const totalSeconds = Math.round(durationMs / 1000);
    if (totalSeconds < 60) return `${totalSeconds} ثانية`;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes} دقيقة${seconds ? ` و${seconds} ثانية` : ''}`;
  }

  reviewLabel(status: string): string {
    return status === 'completed' ? 'تمت المراجعة' : 'مجدولة';
  }

  async loadMoreEvents(): Promise<void> {
    if (!this.detail || this.loadingMoreEvents || this.detail.recentEvents.length >= this.detail.totalEventCount) return;
    const studentId = this.detail.student.id;
    const skip = this.detail.recentEvents.length;
    const elapsed = this.diagnostics.start('AdminStudentDetails', 'load-more-events', { studentId, skip });
    this.loadingMoreEvents = true;
    try {
      const page = await this.api.getStudentEvents(studentId, skip, 100);
      const known = new Set(this.detail.recentEvents.map((item) => item.id));
      this.detail = {
        ...this.detail,
        recentEvents: [
          ...this.detail.recentEvents,
          ...page.items.filter((item) => !known.has(item.id)),
        ],
        totalEventCount: page.total,
      };
      this.diagnostics.success('AdminStudentDetails', 'load-more-events', elapsed(), {
        studentId,
        loaded: page.items.length,
        visible: this.detail.recentEvents.length,
        total: page.total,
      });
    } catch (error) {
      this.diagnostics.error('AdminStudentDetails', 'load-more-events:error', error, {
        studentId,
        skip,
        durationMs: elapsed(),
      });
    } finally {
      this.loadingMoreEvents = false;
    }
  }

  private async load(): Promise<void> {
    const studentId = this.route.snapshot.paramMap.get('studentId') || '';
    const elapsed = this.diagnostics.start('AdminStudentDetails', 'load', { studentId });
    this.diagnostics.check('AdminStudentDetails', 'student-id', !!studentId, { studentId });
    if (!studentId) {
      this.error = 'معرف الطالب غير موجود.';
      this.loading = false;
      return;
    }
    try {
      this.detail = await this.api.getStudentDetail(studentId);
      this.diagnostics.success('AdminStudentDetails', 'load', elapsed(), {
        studentId,
        events: this.detail.recentEvents.length,
        recordings: this.detail.recordings.length,
        lessons: this.detail.lessons.length,
      });
    } catch (error) {
      this.error = 'تعذر تحميل ملف الطالب من الـBackend.';
      this.diagnostics.error('AdminStudentDetails', 'load:error', error, { studentId, durationMs: elapsed() });
    } finally {
      this.loading = false;
    }
  }
}
