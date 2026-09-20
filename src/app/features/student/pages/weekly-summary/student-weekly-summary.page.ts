import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../../core/auth/services/auth.service';
import { PlatformPreviewService } from '../../../platform-preview/data-access/platform-preview.service';
import { WeeklySummaryPreview } from '../../../platform-preview/data-access/platform-preview.models';
import { StudentRepository } from '../../../teacher/data-access/student.repository';

@Component({
  selector: 'app-student-weekly-summary-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './student-weekly-summary.page.html',
  styleUrl: './student-weekly-summary.page.scss',
})
export class StudentWeeklySummaryPage implements OnInit {
  summaries: WeeklySummaryPreview[] = [];
  weekNumber = 1;
  isRecording = false;
  hasLocalRecording = false;
  feedback = '';

  constructor(
    public auth: AuthService,
    private preview: PlatformPreviewService,
    private students: StudentRepository,
  ) {}

  ngOnInit(): void { this.reload(); }

  startRecording(): void {
    this.isRecording = true;
    this.feedback = 'محاكاة التسجيل تعمل الآن. في النسخة النهائية سيُستخدم MediaRecorder.';
  }

  stopRecording(): void {
    this.isRecording = false;
    this.hasLocalRecording = true;
    this.feedback = 'تم حفظ التسجيل المؤقت على الجهاز ويمكن إعادة تسجيله قبل الإرسال.';
  }

  resetRecording(): void {
    this.hasLocalRecording = false;
    this.feedback = 'تم حذف التسجيل المؤقت، ويمكنك التسجيل من جديد.';
  }

  submit(): void {
    const studentId = this.auth.currentUser?.studentId;
    const student = studentId ? this.students.findById(studentId) : null;
    if (!student || !this.hasLocalRecording) {
      this.feedback = 'سجّل التلخيص أولًا قبل الإرسال.';
      return;
    }
    this.preview.submitWeeklySummary(student.id, student.groupId, this.weekNumber);
    this.hasLocalRecording = false;
    this.feedback = 'تم إرسال التلخيص الأسبوعي للمشرف.';
    this.reload();
  }

  private reload(): void {
    const studentId = this.auth.currentUser?.studentId;
    this.summaries = studentId ? this.preview.getWeeklySummaries().filter((item) => item.studentId === studentId) : [];
  }
}
