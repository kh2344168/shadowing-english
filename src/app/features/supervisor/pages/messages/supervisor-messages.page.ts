import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../../core/auth/services/auth.service';
import { PlatformPreviewService } from '../../../platform-preview/data-access/platform-preview.service';
import { StudentMessagePreview } from '../../../platform-preview/data-access/platform-preview.models';
import { StudentAccount } from '../../../teacher/data-access/student.models';
import { StudentRepository } from '../../../teacher/data-access/student.repository';

@Component({
  selector: 'app-supervisor-messages-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './supervisor-messages.page.html',
  styleUrl: './supervisor-messages.page.scss',
})
export class SupervisorMessagesPage implements OnInit {
  students: StudentAccount[] = [];
  messages: StudentMessagePreview[] = [];
  studentId = '';
  subject = '';
  body = '';
  feedback = '';

  constructor(
    private preview: PlatformPreviewService,
    private studentRepository: StudentRepository,
    private auth: AuthService,
  ) {}

  ngOnInit(): void { this.students = this.studentRepository.getStudents(); this.studentId = this.students[0]?.id || ''; this.reload(); }
  send(): void {
    const result = this.preview.sendMessage(this.studentId, this.subject, this.body, this.auth.currentUser?.name || 'Supervisor');
    this.feedback = result ? 'تم إرسال الرسالة داخل نسخة الـFrontend.' : 'أكمل بيانات الرسالة.';
    if (result) { this.subject = ''; this.body = ''; this.reload(); }
  }
  studentName(studentId: string): string { return this.studentRepository.findById(studentId)?.name || 'طالب محذوف'; }
  private reload(): void { this.messages = this.preview.getMessages(); }
}
