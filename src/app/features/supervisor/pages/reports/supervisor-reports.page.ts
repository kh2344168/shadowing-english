import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PlatformPreviewService } from '../../../platform-preview/data-access/platform-preview.service';
import { StudentRepository } from '../../../teacher/data-access/student.repository';
import { TeacherGroupRepository } from '../../../teacher/data-access/teacher-group.repository';

@Component({
  selector: 'app-supervisor-reports-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './supervisor-reports.page.html',
  styleUrl: './supervisor-reports.page.scss',
})
export class SupervisorReportsPage implements OnInit {
  students: ReturnType<StudentRepository['getStudents']> = [];
  groups: ReturnType<TeacherGroupRepository['getGroups']> = [];
  reportType: 'students' | 'subscriptions' | 'groups' | 'summaries' = 'students';
  feedback = '';

  get activeSubscriptionsCount(): number {
    return this.preview.getSubscriptions().filter((item) => item.status === 'active').length;
  }

  get pendingSummariesCount(): number {
    return this.preview.getWeeklySummaries().filter((item) => item.status === 'pending').length;
  }

  get groupsWithStudentsCount(): number {
    return this.groups.filter((group) => group.studentIds.length > 0).length;
  }

  constructor(
    private studentRepository: StudentRepository,
    private groupRepository: TeacherGroupRepository,
    public preview: PlatformPreviewService,
  ) {}

  ngOnInit(): void {
    this.students = this.studentRepository.getStudents();
    this.groups = this.groupRepository.getGroups();
  }

  exportCsv(): void {
    const rows = this.createRows();
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `shadowing-${this.reportType}-report.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    this.feedback = 'تم إنشاء ملف CSV يمكن فتحه في Excel.';
  }

  printPdf(): void { this.feedback = 'اختر Save as PDF من نافذة الطباعة.'; window.print(); }

  private createRows(): Array<Array<string | number>> {
    if (this.reportType === 'subscriptions') {
      return [['الطالب', 'الحالة', 'الشهر الحالي', 'تاريخ النهاية'], ...this.preview.getSubscriptions().map((item) => [this.studentRepository.findById(item.studentId)?.name || '-', item.status, item.currentMonth, item.endDate])];
    }
    if (this.reportType === 'groups') {
      return [['المجموعة', 'المنهج', 'عدد الطلاب'], ...this.groups.map((item) => [item.name, item.curriculumName, item.studentIds.length])];
    }
    if (this.reportType === 'summaries') {
      return [['الطالب', 'الأسبوع', 'الحالة', 'الدرجة'], ...this.preview.getWeeklySummaries().map((item) => [this.studentRepository.findById(item.studentId)?.name || '-', item.weekNumber, item.status, item.rating || '-'])];
    }
    return [['الطالب', 'البريد', 'المجموعة'], ...this.students.map((item) => [item.name, item.email, this.groupRepository.getById(item.groupId)?.name || '-'])];
  }
}
