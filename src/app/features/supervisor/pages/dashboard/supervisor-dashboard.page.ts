import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlatformPreviewService } from '../../../platform-preview/data-access/platform-preview.service';
import { StudentRepository } from '../../../teacher/data-access/student.repository';
import { TeacherGroupRepository } from '../../../teacher/data-access/teacher-group.repository';

@Component({
  selector: 'app-supervisor-dashboard-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './supervisor-dashboard.page.html',
  styleUrl: './supervisor-dashboard.page.scss',
})
export class SupervisorDashboardPage implements OnInit {
  students: ReturnType<StudentRepository['getStudents']> = [];
  groups: ReturnType<TeacherGroupRepository['getGroups']> = [];
  activeSubscriptions = 0;
  expiredSubscriptions = 0;
  pendingSummaries = 0;
  unreadMessages = 0;
  studentsWithProgress = 0;

  constructor(
    private studentRepository: StudentRepository,
    private groupRepository: TeacherGroupRepository,
    private preview: PlatformPreviewService,
  ) {}

  ngOnInit(): void {
    this.students = this.studentRepository.getStudents();
    this.groups = this.groupRepository.getGroups();
    const subscriptions = this.preview.getSubscriptions();
    this.activeSubscriptions = subscriptions.filter((item) => item.status === 'active').length;
    this.expiredSubscriptions = subscriptions.filter((item) => item.status === 'expired').length;
    this.pendingSummaries = this.preview.getWeeklySummaries().filter((item) => item.status === 'pending').length;
    this.unreadMessages = this.preview.getMessages().filter((item) => !item.read).length;
    this.studentsWithProgress = this.students.filter((student) =>
      this.studentRepository.getProgressForStudent(student.id).some((item) => item.completedRepetitions > 0),
    ).length;
  }

  groupName(groupId: string): string { return this.groupRepository.getById(groupId)?.name || 'بدون مجموعة'; }
  progressPercent(studentId: string): number {
    const rows = this.studentRepository.getProgressForStudent(studentId);
    if (rows.length === 0) return 0;
    const completed = rows.reduce((sum, item) => sum + Math.min(item.completedRepetitions, item.requiredRepetitions), 0);
    const required = rows.reduce((sum, item) => sum + item.requiredRepetitions, 0);
    return required ? Math.round((completed / required) * 100) : 0;
  }
}
