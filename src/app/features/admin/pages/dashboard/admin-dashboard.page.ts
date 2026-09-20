import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LessonRepository } from '../../../lessons/data-access/lesson.repository';
import { PlatformPreviewService } from '../../../platform-preview/data-access/platform-preview.service';
import { StudentRepository } from '../../../teacher/data-access/student.repository';
import { TeacherGroupRepository } from '../../../teacher/data-access/teacher-group.repository';

interface DashboardStat {
  label: string;
  value: number;
  hint: string;
  tone: 'blue' | 'green' | 'orange' | 'purple';
}

@Component({
  selector: 'app-admin-dashboard-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './admin-dashboard.page.html',
  styleUrl: './admin-dashboard.page.scss',
})
export class AdminDashboardPage implements OnInit {
  stats: DashboardStat[] = [];
  recentStudents: ReturnType<StudentRepository['getStudents']> = [];
  pendingSummaries = 0;
  publications: ReturnType<PlatformPreviewService['getPublications']> = [];

  constructor(
    private lessonRepository: LessonRepository,
    private studentRepository: StudentRepository,
    private groupRepository: TeacherGroupRepository,
    private preview: PlatformPreviewService,
  ) {}

  ngOnInit(): void {
    const students = this.studentRepository.getStudents();
    const groups = this.groupRepository.getGroups();
    const supervisors = this.preview.getSupervisors();
    const subscriptions = this.preview.getSubscriptions();
    const summaries = this.preview.getWeeklySummaries();
    this.publications = this.preview.getPublications();
    const today = new Date().toDateString();

    this.pendingSummaries = summaries.filter((item) => item.status === 'pending').length;
    this.recentStudents = [...students]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5);

    this.stats = [
      { label: 'الطلاب', value: students.length, hint: `${students.filter((item) => new Date(item.createdAt).toDateString() === today).length} تمت إضافتهم اليوم`, tone: 'blue' },
      { label: 'المجموعات', value: groups.length, hint: 'كل طالب في مجموعة واحدة', tone: 'purple' },
      { label: 'المشرفون', value: supervisors.filter((item) => item.status === 'active').length, hint: 'يرون كل المجموعات في النسخة الأولى', tone: 'green' },
      { label: 'اشتراكات منتهية', value: subscriptions.filter((item) => item.status === 'expired').length, hint: 'يُمنع أصحابها من الدخول', tone: 'orange' },
      { label: 'الدروس', value: this.lessonRepository.getAll().length, hint: 'داخل مكتبة المحتوى', tone: 'blue' },
      { label: 'تلخيصات تنتظر التقييم', value: this.pendingSummaries, hint: 'يمكن للأدمن والمشرف مراجعتها', tone: 'green' },
    ];
  }

  groupName(groupId: string): string {
    return this.groupRepository.getById(groupId)?.name || 'بدون مجموعة';
  }
}
