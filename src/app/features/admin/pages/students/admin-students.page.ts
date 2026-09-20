import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  LearningGroupDto,
  StudentDirectoryDto,
} from '../../../../core/api/student-tracking-api.models';
import { StudentTrackingApiService } from '../../../../core/api/student-tracking-api.service';
import { AppDiagnosticsService } from '../../../../core/diagnostics/app-diagnostics.service';
import { TeacherGroupRepository } from '../../../teacher/data-access/teacher-group.repository';

@Component({
  selector: 'app-admin-students-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-students.page.html',
  styleUrl: './admin-students.page.scss',
})
export class AdminStudentsPage implements OnInit {
  students: StudentDirectoryDto[] = [];
  groups: LearningGroupDto[] = [];
  selectedGroupByStudent: Record<string, string> = {};
  name = '';
  email = '';
  groupId = '';
  cefrLevel = 'A1';
  feedback = '';
  searchTerm = '';
  groupFilter = 'all';
  subscriptionFilter = 'all';
  engagementFilter = 'all';
  createOpen = false;
  loading = true;
  busy = false;

  constructor(
    private api: StudentTrackingApiService,
    private localGroups: TeacherGroupRepository,
    private diagnostics: AppDiagnosticsService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    void this.reload();
  }

  get visibleStudents(): StudentDirectoryDto[] {
    const query = this.searchTerm.trim().toLowerCase();
    return this.students.filter((student) => {
      const matchesText = !query || `${student.name} ${student.email}`.toLowerCase().includes(query);
      const matchesGroup = this.groupFilter === 'all' || student.groupId === this.groupFilter;
      const matchesSubscription = this.subscriptionFilter === 'all' || student.subscriptionStatus === this.subscriptionFilter;
      const matchesEngagement = this.engagementFilter === 'all' || student.engagementStatus === this.engagementFilter;
      return matchesText && matchesGroup && matchesSubscription && matchesEngagement;
    });
  }

  async addStudent(): Promise<void> {
    const group = this.groups.find((item) => item.id === this.groupId);
    this.diagnostics.check('AdminStudents', 'addStudent-input', !!this.name.trim() && !!this.email.trim() && !!group, {
      email: this.email,
      groupId: this.groupId,
    });
    if (!group || !this.name.trim() || !this.email.trim()) {
      this.feedback = 'اكتب الاسم والبريد واختر المجموعة.';
      return;
    }
    this.busy = true;
    try {
      const result = await this.api.createStudent({
        name: this.name,
        email: this.email,
        groupId: group.id,
        groupName: group.name,
        cefrLevel: this.cefrLevel || group.cefrLevel,
      });
      this.feedback = `تمت إضافة الطالب. كلمة المرور المؤقتة: ${result.temporaryPassword}`;
      this.name = '';
      this.email = '';
      this.createOpen = false;
      await this.reload(true);
    } catch {
      this.feedback = 'تعذر إضافة الطالب. قد يكون البريد مستخدمًا أو السيرفر غير متاح.';
    } finally {
      this.busy = false;
    }
  }

  async moveStudent(studentId: string): Promise<void> {
    const targetGroupId = this.selectedGroupByStudent[studentId] || '';
    const group = this.groups.find((item) => item.id === targetGroupId);
    const elapsed = this.diagnostics.start('AdminStudents', 'moveStudent', {
      studentId,
      targetGroupId,
      availableBackendGroups: this.groups.length,
    });
    this.diagnostics.check('AdminStudents', 'moveStudent-target-group', !!group, {
      studentId,
      targetGroupId,
      availableBackendGroupIds: this.groups.map((item) => item.id),
    });
    if (!group) {
      this.feedback = 'المجموعة المختارة غير موجودة في الـBackend. أعد تحميل الصفحة.';
      return;
    }

    this.busy = true;
    try {
      const moved = await this.api.moveStudent(studentId, group);
      this.diagnostics.check('AdminStudents', 'moveStudent-backend-result', moved.groupId === group.id, {
        studentId,
        expectedGroupId: group.id,
        actualGroupId: moved.groupId,
      });
      this.feedback = 'تم نقل الطالب على الـBackend مع الاحتفاظ بتاريخ التقدم القديم.';
      await this.reload(true);
      this.diagnostics.success('AdminStudents', 'moveStudent', elapsed(), {
        studentId,
        targetGroupId: group.id,
      });
    } catch (error) {
      this.diagnostics.error('AdminStudents', 'moveStudent:error', error, {
        studentId,
        targetGroupId: group.id,
        durationMs: elapsed(),
      });
      this.feedback = 'تعذر نقل الطالب. راجع Logs الـBackend للمجموعة والطالب.';
    } finally {
      this.busy = false;
    }
  }

  async setSubscription(student: StudentDirectoryDto, status: string): Promise<void> {
    await this.updateStudent(student, { subscriptionStatus: status });
  }

  async setAccount(student: StudentDirectoryDto, status: string): Promise<void> {
    await this.updateStudent(student, { accountStatus: status });
  }

  async resetPassword(studentId: string): Promise<void> {
    this.busy = true;
    try {
      const password = await this.api.resetPassword(studentId);
      this.feedback = `كلمة المرور المؤقتة الجديدة: ${password}`;
    } catch {
      this.feedback = 'تعذر إعادة تعيين كلمة المرور.';
    } finally {
      this.busy = false;
    }
  }

  engagementLabel(status: string): string {
    if (status === 'committed') return 'ملتزم';
    if (status === 'needs-attention') return 'يحتاج متابعة';
    if (status === 'not-committed') return 'غير ملتزم';
    return 'لم يبدأ';
  }

  subscriptionLabel(status: string): string {
    if (status === 'active') return 'نشط';
    if (status === 'expired') return 'منتهي';
    return 'موقوف';
  }

  private async updateStudent(
    student: StudentDirectoryDto,
    values: Partial<Pick<StudentDirectoryDto, 'accountStatus' | 'subscriptionStatus' | 'cefrLevel'>>,
  ): Promise<void> {
    this.busy = true;
    try {
      await this.api.updateStudent(student.id, {
        accountStatus: values.accountStatus || student.accountStatus,
        subscriptionStatus: values.subscriptionStatus || student.subscriptionStatus,
        cefrLevel: values.cefrLevel || student.cefrLevel,
      });
      this.feedback = 'تم تحديث حالة الطالب على الـBackend.';
      await this.reload(true);
    } finally {
      this.busy = false;
    }
  }

  private async reload(syncGroups = true): Promise<void> {
    const elapsed = this.diagnostics.start('AdminStudents', 'reload', { syncGroups });
    this.loading = true;
    try {
      if (syncGroups) await this.localGroups.initializeFromBackend();
      [this.groups, this.students] = await Promise.all([
        this.api.getGroups(),
        this.api.getStudents(),
      ]);
      this.groupId ||= this.groups[0]?.id || '';
      this.cefrLevel = this.groups.find((item) => item.id === this.groupId)?.cefrLevel || 'A1';
      for (const student of this.students) this.selectedGroupByStudent[student.id] = student.groupId;
      this.diagnostics.check('AdminStudents', 'backend-data-loaded', true, {
        groups: this.groups.length,
        students: this.students.length,
      });
      this.diagnostics.success('AdminStudents', 'reload', elapsed(), {
        groups: this.groups.length,
        students: this.students.length,
      });
    } catch (error) {
      this.diagnostics.error('AdminStudents', 'reload:error', error, { durationMs: elapsed() });
      this.feedback = 'تعذر تحميل الطلاب من الـBackend. تأكد أن API وSQL يعملان.';
    } finally {
      this.loading = false;
      // This application uses zoneless change detection. The arrays above are
      // populated after awaited HTTP calls, so explicitly repaint the view.
      // Otherwise the data may stay invisible until the next button click.
      this.cdr.detectChanges();
      this.diagnostics.check('AdminStudents', 'initial-render-complete', true, {
        loading: this.loading,
        renderedGroups: this.groups.length,
        renderedStudents: this.students.length,
      });
    }
  }

}
