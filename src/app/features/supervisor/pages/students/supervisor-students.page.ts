import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PlatformPreviewService } from '../../../platform-preview/data-access/platform-preview.service';
import { SubscriptionPreview } from '../../../platform-preview/data-access/platform-preview.models';
import { StudentAccount } from '../../../teacher/data-access/student.models';
import { StudentRepository } from '../../../teacher/data-access/student.repository';
import { TeacherGroup } from '../../../teacher/data-access/teacher-group.models';
import { TeacherGroupRepository } from '../../../teacher/data-access/teacher-group.repository';

@Component({
  selector: 'app-supervisor-students-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './supervisor-students.page.html',
  styleUrl: './supervisor-students.page.scss',
})
export class SupervisorStudentsPage implements OnInit {
  students: StudentAccount[] = [];
  groups: TeacherGroup[] = [];
  selectedGroupByStudent: Record<string, string> = {};
  name = '';
  email = '';
  groupId = '';
  feedback = '';

  constructor(
    private studentRepository: StudentRepository,
    private groupRepository: TeacherGroupRepository,
    private preview: PlatformPreviewService,
  ) {}

  ngOnInit(): void { this.reload(); }
  addStudent(): void {
    const result = this.studentRepository.addStudent(this.name, this.email, this.groupId);
    this.feedback = result ? `تمت الإضافة. كلمة المرور: ${result.temporaryPassword}` : 'تعذر إضافة الطالب.';
    if (result) { this.name = ''; this.email = ''; this.reload(); }
  }
  move(studentId: string): void { const groupId = this.selectedGroupByStudent[studentId]; if (groupId) { this.studentRepository.moveStudent(studentId, groupId); this.feedback = 'تم نقل الطالب.'; this.reload(); } }
  renew(studentId: string): void { this.preview.renewSubscription(studentId); this.reload(); }
  pause(studentId: string): void { this.preview.setSubscriptionStatus(studentId, 'paused'); this.reload(); }
  activate(studentId: string): void { this.preview.setSubscriptionStatus(studentId, 'active'); this.reload(); }
  resetPassword(studentId: string): void { const password = this.studentRepository.resetTemporaryPassword(studentId); this.feedback = password ? `كلمة المرور الجديدة: ${password}` : 'تعذر التغيير.'; }
  groupName(groupId: string): string { return this.groups.find((item) => item.id === groupId)?.name || 'بدون مجموعة'; }
  subscription(studentId: string): SubscriptionPreview | null { return this.preview.getSubscription(studentId); }
  private reload(): void { this.groups = this.groupRepository.getGroups(); this.students = this.studentRepository.getStudents(); this.groupId ||= this.groups[0]?.id || ''; for (const student of this.students) this.selectedGroupByStudent[student.id] = student.groupId; this.preview.getSubscriptions(); }
}
