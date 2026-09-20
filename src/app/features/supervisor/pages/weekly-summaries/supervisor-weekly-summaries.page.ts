import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../../core/auth/services/auth.service';
import { PlatformPreviewService } from '../../../platform-preview/data-access/platform-preview.service';
import { WeeklySummaryPreview } from '../../../platform-preview/data-access/platform-preview.models';
import { StudentRepository } from '../../../teacher/data-access/student.repository';
import { TeacherGroupRepository } from '../../../teacher/data-access/teacher-group.repository';

@Component({
  selector: 'app-supervisor-weekly-summaries-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './supervisor-weekly-summaries.page.html',
  styleUrl: './supervisor-weekly-summaries.page.scss',
})
export class SupervisorWeeklySummariesPage implements OnInit {
  summaries: WeeklySummaryPreview[] = [];
  selectedId = '';
  rating = 4;
  note = '';
  action: 'accepted' | 'resubmit' = 'accepted';
  feedback = '';
  searchTerm = '';
  statusFilter: 'all' | 'pending' | 'accepted' | 'resubmit' = 'all';
  groupFilter = 'all';

  constructor(
    private preview: PlatformPreviewService,
    private students: StudentRepository,
    private groups: TeacherGroupRepository,
    private auth: AuthService,
  ) {}

  ngOnInit(): void { this.reload(); }

  get groupsList() { return this.groups.getGroups(); }

  get visibleSummaries(): WeeklySummaryPreview[] {
    const query = this.searchTerm.trim().toLowerCase();
    return this.summaries.filter((item) => {
      const student = this.students.findById(item.studentId);
      const matchesText = !query || !!student && student.name.toLowerCase().includes(query);
      const matchesStatus = this.statusFilter === 'all' || item.status === this.statusFilter;
      const matchesGroup = this.groupFilter === 'all' || item.groupId === this.groupFilter;
      return matchesText && matchesStatus && matchesGroup;
    });
  }

  get selectedSummary(): WeeklySummaryPreview | null {
    return this.summaries.find((item) => item.id === this.selectedId) || null;
  }
  studentName(studentId: string): string { return this.students.findById(studentId)?.name || 'طالب محذوف'; }
  groupName(groupId: string): string { return this.groups.getById(groupId)?.name || 'مجموعة غير موجودة'; }

  select(summary: WeeklySummaryPreview): void {
    this.selectedId = summary.id;
    this.rating = summary.rating || 4;
    this.note = summary.note || '';
    this.action = summary.status === 'resubmit' ? 'resubmit' : 'accepted';
  }

  saveReview(): void {
    if (!this.selectedId) { this.feedback = 'اختر تلخيصًا أولًا.'; return; }
    this.preview.reviewSummary(
      this.selectedId,
      this.action,
      this.rating,
      this.note,
      this.auth.currentUser?.name || 'Reviewer',
    );
    this.feedback = 'تم حفظ التقييم في نسخة الـFrontend.';
    this.reload();
  }

  private reload(): void { this.summaries = this.preview.getWeeklySummaries(); }
}
