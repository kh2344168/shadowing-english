import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PlatformPreviewService } from '../../../platform-preview/data-access/platform-preview.service';
import { SupervisorPreview } from '../../../platform-preview/data-access/platform-preview.models';
import { TeacherGroup } from '../../../teacher/data-access/teacher-group.models';
import { TeacherGroupRepository } from '../../../teacher/data-access/teacher-group.repository';

@Component({
  selector: 'app-admin-supervisors-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-supervisors.page.html',
  styleUrl: './admin-supervisors.page.scss',
})
export class AdminSupervisorsPage implements OnInit {
  supervisors: SupervisorPreview[] = [];
  groups: TeacherGroup[] = [];
  searchTerm = '';
  statusFilter: 'all' | 'active' | 'paused' = 'all';
  groupFilter = 'all';
  createOpen = false;
  name = '';
  email = '';
  phone = '';
  message = '';

  constructor(
    private preview: PlatformPreviewService,
    private groupRepository: TeacherGroupRepository,
  ) {}

  ngOnInit(): void { this.reload(); }

  get visibleSupervisors(): SupervisorPreview[] {
    const query = this.searchTerm.trim().toLowerCase();
    return this.supervisors.filter((item) => {
      const matchesText = !query || item.name.toLowerCase().includes(query) || item.email.toLowerCase().includes(query);
      const matchesStatus = this.statusFilter === 'all' || item.status === this.statusFilter;
      const matchesGroup = this.groupFilter === 'all' || item.groupIds.includes(this.groupFilter);
      return matchesText && matchesStatus && matchesGroup;
    });
  }

  groupNames(supervisor: SupervisorPreview): string[] {
    if (supervisor.canViewAllGroups && supervisor.groupIds.length === 0) return ['كل المجموعات'];
    return supervisor.groupIds.map((id) => this.groups.find((group) => group.id === id)?.name || 'مجموعة غير موجودة');
  }

  studentCount(supervisor: SupervisorPreview): number {
    if (supervisor.canViewAllGroups && supervisor.groupIds.length === 0) {
      return new Set(this.groups.flatMap((group) => group.studentIds)).size;
    }
    return new Set(this.groups.filter((group) => supervisor.groupIds.includes(group.id)).flatMap((group) => group.studentIds)).size;
  }

  addSupervisor(): void {
    const result = this.preview.addSupervisor(this.name, this.email, this.phone);
    this.message = result ? `تمت إضافة ${result.name}.` : 'تأكد من البيانات أو أن البريد غير مستخدم.';
    if (result) { this.name = ''; this.email = ''; this.phone = ''; this.createOpen = false; this.reload(); }
  }

  toggle(supervisorId: string): void { this.preview.toggleSupervisor(supervisorId); this.reload(); }

  private reload(): void {
    this.supervisors = this.preview.getSupervisors();
    this.groups = this.groupRepository.getGroups();
  }
}
