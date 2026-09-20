import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PlatformPreviewService } from '../../../platform-preview/data-access/platform-preview.service';
import { SubscriptionPreview } from '../../../platform-preview/data-access/platform-preview.models';
import { StudentRepository } from '../../../teacher/data-access/student.repository';
import { TeacherGroupRepository } from '../../../teacher/data-access/teacher-group.repository';

@Component({
  selector: 'app-admin-subscriptions-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-subscriptions.page.html',
  styleUrl: './admin-subscriptions.page.scss',
})
export class AdminSubscriptionsPage implements OnInit {
  subscriptions: SubscriptionPreview[] = [];
  filter: 'all' | 'active' | 'expired' | 'paused' = 'all';
  searchTerm = '';
  groupFilter = 'all';

  constructor(
    private preview: PlatformPreviewService,
    private students: StudentRepository,
    private groups: TeacherGroupRepository,
  ) {}

  ngOnInit(): void { this.reload(); }

  get activeCount(): number { return this.subscriptions.filter((item) => item.status === 'active').length; }
  get expiredCount(): number { return this.subscriptions.filter((item) => item.status === 'expired').length; }
  get pausedCount(): number { return this.subscriptions.filter((item) => item.status === 'paused').length; }

  get visibleSubscriptions(): SubscriptionPreview[] {
    const query = this.searchTerm.trim().toLowerCase();
    return this.subscriptions.filter((item) => {
      const matchesStatus = this.filter === 'all' || item.status === this.filter;
      const student = this.students.findById(item.studentId);
      const matchesText = !query || !!student && (student.name.toLowerCase().includes(query) || student.email.toLowerCase().includes(query));
      const matchesGroup = this.groupFilter === 'all' || student?.groupId === this.groupFilter;
      return matchesStatus && matchesText && matchesGroup;
    });
  }

  get groupOptions() { return this.groups.getGroups(); }

  studentName(studentId: string): string { return this.students.findById(studentId)?.name || 'طالب محذوف'; }
  groupName(studentId: string): string {
    const student = this.students.findById(studentId);
    return student ? this.groups.getById(student.groupId)?.name || 'بدون مجموعة' : '-';
  }

  renew(studentId: string): void { this.preview.renewSubscription(studentId, 1); this.reload(); }
  pause(studentId: string): void { this.preview.setSubscriptionStatus(studentId, 'paused'); this.reload(); }
  activate(studentId: string): void { this.preview.setSubscriptionStatus(studentId, 'active'); this.reload(); }

  private reload(): void { this.subscriptions = this.preview.getSubscriptions(); }
}
