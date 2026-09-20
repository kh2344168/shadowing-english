import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { AuthService } from '../../../../core/auth/services/auth.service';
import { PlatformPreviewService } from '../../../platform-preview/data-access/platform-preview.service';
import { StudentRepository } from '../../../teacher/data-access/student.repository';
import { TeacherGroupRepository } from '../../../teacher/data-access/teacher-group.repository';

@Component({
  selector: 'app-student-profile-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './student-profile.page.html',
  styleUrl: './student-profile.page.scss',
})
export class StudentProfilePage {
  constructor(
    public auth: AuthService,
    public preview: PlatformPreviewService,
    private students: StudentRepository,
    private groups: TeacherGroupRepository,
  ) {}

  get student() { const id = this.auth.currentUser?.studentId; return id ? this.students.findById(id) : null; }
  get subscription() { return this.student ? this.preview.getSubscription(this.student.id) : null; }
  get groupName(): string { return this.student ? this.groups.getById(this.student.groupId)?.name || 'بدون مجموعة' : '-'; }
}
