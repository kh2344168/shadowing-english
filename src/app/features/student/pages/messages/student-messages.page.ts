import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { AuthService } from '../../../../core/auth/services/auth.service';
import { PlatformPreviewService } from '../../../platform-preview/data-access/platform-preview.service';
import { StudentMessagePreview } from '../../../platform-preview/data-access/platform-preview.models';

@Component({
  selector: 'app-student-messages-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './student-messages.page.html',
  styleUrl: './student-messages.page.scss',
})
export class StudentMessagesPage implements OnInit {
  messages: StudentMessagePreview[] = [];
  constructor(private auth: AuthService, private preview: PlatformPreviewService) {}
  ngOnInit(): void { this.reload(); }
  open(messageId: string): void { this.preview.markMessageRead(messageId); this.reload(); }
  private reload(): void { const studentId = this.auth.currentUser?.studentId; this.messages = studentId ? this.preview.getMessages(studentId) : []; }
}
