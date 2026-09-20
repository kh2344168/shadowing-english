import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AppDiagnosticsService } from '../../../../core/diagnostics/app-diagnostics.service';
import { CourseLesson } from '../../../lessons/data-access/lesson.models';
import { LessonRepository } from '../../../lessons/data-access/lesson.repository';
import { PlatformPreviewService } from '../../../platform-preview/data-access/platform-preview.service';
import { SupervisorPreview, WeekPublicationPreview } from '../../../platform-preview/data-access/platform-preview.models';
import { CurriculumRepository } from '../../../teacher/data-access/curriculum.repository';
import { TeacherCurriculum } from '../../../teacher/data-access/curriculum.models';
import { GroupCurriculumRepository } from '../../../teacher/data-access/group-curriculum.repository';
import { StudentAccount } from '../../../teacher/data-access/student.models';
import { StudentRepository } from '../../../teacher/data-access/student.repository';
import { TeacherGroup } from '../../../teacher/data-access/teacher-group.models';
import { TeacherGroupRepository } from '../../../teacher/data-access/teacher-group.repository';

@Component({
  selector: 'app-admin-group-details-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-group-details.page.html',
  styleUrl: './admin-group-details.page.scss',
})
export class AdminGroupDetailsPage implements OnInit {
  group: TeacherGroup | null = null;
  lessons: CourseLesson[] = [];
  students: StudentAccount[] = [];
  curriculums: TeacherCurriculum[] = [];
  selectedCurriculumId = '';
  isChangingCurriculum = false;
  supervisors: SupervisorPreview[] = [];
  publications: WeekPublicationPreview[] = [];
  activeTab: 'plan' | 'students' = 'plan';
  weekNumber = 1;
  scheduledAt = '';
  isPublishing = false;
  feedback = '';
  feedbackError = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private groups: TeacherGroupRepository,
    private groupCurriculum: GroupCurriculumRepository,
    private curriculumRepository: CurriculumRepository,
    private lessonsRepository: LessonRepository,
    private studentsRepository: StudentRepository,
    private preview: PlatformPreviewService,
    private diagnostics: AppDiagnosticsService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void { void this.initialize(); }

  private async initialize(): Promise<void> {
    const groupId = this.route.snapshot.paramMap.get('groupId') || '';
    const elapsed = this.diagnostics.start('AdminGroupDetails', 'initialize', { groupId });
    try {
      const [curriculums] = await Promise.all([
        this.curriculumRepository.initializeFromBackend(true),
        this.groups.initializeFromBackend(),
      ]);
      this.curriculums = curriculums.filter((item) => item.status !== 'archived');
      this.group = this.groups.getById(groupId);
      this.diagnostics.check('AdminGroupDetails', 'group-found', !!this.group, { groupId });
      if (!this.group) {
        void this.router.navigate(['/admin/groups']);
        return;
      }
      await this.groupCurriculum.refreshPublishedForGroup(groupId, false);
      this.group = this.groups.getById(groupId);
      this.selectedCurriculumId = this.group?.curriculumId || this.curriculums[0]?.id || '';
      this.reloadRelated();
      this.diagnostics.check('AdminGroupDetails', 'curriculum-selector-ready', this.curriculums.length > 0, {
        groupId,
        linkedCurriculumId: this.group?.curriculumId || '',
        selectedCurriculumId: this.selectedCurriculumId,
        availableCurriculums: this.curriculums.length,
      });
      this.cdr.detectChanges();
      this.diagnostics.success('AdminGroupDetails', 'initialize', elapsed(), { groupId, curriculums: this.curriculums.length });
    } catch (error) {
      this.diagnostics.error('AdminGroupDetails', 'initialize:error', error, { groupId, durationMs: elapsed() });
      this.setFeedback('تعذر تحميل المجموعة أو قائمة المناهج من الـBackend.', true);
      this.cdr.detectChanges();
    }
  }

  get supervisorName(): string {
    if (!this.group) return 'غير معيّن';
    const direct = this.supervisors.find((item) => item.id === this.group?.teacherId);
    const assigned = this.supervisors.find((item) => item.groupIds.includes(this.group!.id));
    return direct?.name || assigned?.name || 'غير معيّن';
  }

  get publishedLessonCount(): number {
    if (!this.group) return 0;
    return this.group.publishedCurriculum.weeks.reduce(
      (sum, week) => sum + week.days.reduce((daySum, day) => daySum + day.lessonSlots.length, 0),
      0,
    );
  }

  get draftLessonCount(): number {
    if (!this.group) return 0;
    return this.group.draftCurriculum.weeks.reduce(
      (sum, week) => sum + week.days.reduce((daySum, day) => daySum + day.lessonSlots.length, 0),
      0,
    );
  }

  get averageProgress(): number {
    if (!this.group || this.students.length === 0) return 0;
    const total = this.students.reduce((sum, student) => sum + this.studentProgress(student), 0);
    return Math.round(total / this.students.length);
  }

  lessonTitle(lessonId: string): string {
    return this.lessons.find((lesson) => lesson.id === lessonId)?.title || 'درس غير موجود';
  }

  lessonLevel(lessonId: string): string {
    const lesson = this.lessons.find((item) => item.id === lessonId);
    return lesson?.activities?.find((activity) => activity.type === 'ai-conversation')?.conversationConfig?.level || '—';
  }

  publicationsForWeek(weekNumber: number): WeekPublicationPreview[] {
    return this.publications.filter((item) => item.weekNumber === weekNumber);
  }

  studentProgress(student: StudentAccount): number {
    if (!this.group) return 0;
    const slots = this.group.publishedCurriculum.weeks.flatMap((week) =>
      week.days.flatMap((day) => day.lessonSlots),
    );
    if (slots.length === 0) return 0;

    let completed = 0;
    let required = 0;
    for (const slot of slots) {
      const row = this.studentsRepository.getProgress(
        student.id,
        slot.lessonId,
        slot.id,
        this.group.id,
      );
      const target = Math.max(1, row?.requiredRepetitions || slot.repetitionCount || 1);
      required += target;
      completed += Math.min(target, row?.completedRepetitions || 0);
    }
    return required > 0 ? Math.min(100, Math.round((completed / required) * 100)) : 0;
  }

  lastRecordingLabel(student: StudentAccount): string {
    const rows = this.studentsRepository
      .getProgressForStudent(student.id)
      .filter((item) => !this.group || !item.groupId || item.groupId === this.group.id)
      .filter((item) => item.recordingIds.length > 0);
    if (rows.length === 0) return 'لا يوجد تسجيل';
    const latest = rows.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
    return new Date(latest.updatedAt).toLocaleDateString('ar-EG');
  }

  studentStatus(student: StudentAccount): string {
    const subscription = this.preview.getSubscription(student.id);
    if (!subscription) return 'بدون اشتراك';
    if (subscription.status === 'active') return 'نشط';
    if (subscription.status === 'paused') return 'موقوف';
    return 'منتهي';
  }


  async deleteGroup(): Promise<void> {
    if (!this.group || !window.confirm(`حذف المجموعة «${this.group.name}»؟ يجب نقل كل الطلاب منها أولًا.`)) return;
    const groupId = this.group.id;
    const elapsed = this.diagnostics.start('AdminGroupDetails', 'deleteGroup', { groupId });
    try {
      await this.groups.deleteGroupPersisted(groupId);
      this.diagnostics.success('AdminGroupDetails', 'deleteGroup', elapsed(), { groupId });
      await this.router.navigate(['/admin/groups']);
    } catch (error) {
      const serverMessage = error instanceof HttpErrorResponse
        ? (typeof error.error === 'string' ? error.error : error.error?.message)
        : '';
      this.setFeedback(serverMessage || 'تعذر حذف المجموعة. انقل الطلاب منها أولًا.', true);
      this.diagnostics.error('AdminGroupDetails', 'deleteGroup:error', error, { groupId, durationMs: elapsed() });
      this.cdr.detectChanges();
    }
  }

  async changeLinkedCurriculum(): Promise<void> {
    if (!this.group || !this.selectedCurriculumId || this.isChangingCurriculum) return;
    const target = this.curriculums.find((item) => item.id === this.selectedCurriculumId);
    if (!target) {
      this.setFeedback('المنهج المحدد غير موجود في الـBackend.', true);
      return;
    }
    if (target.id === this.group.curriculumId) {
      this.setFeedback(`المجموعة مرتبطة بالفعل بمنهج «${target.name}».`);
      return;
    }

    const elapsed = this.diagnostics.start('AdminGroupDetails', 'changeCurriculum', {
      groupId: this.group.id,
      fromCurriculumId: this.group.curriculumId,
      toCurriculumId: target.id,
    });
    this.isChangingCurriculum = true;
    try {
      const updated = await this.groups.changeCurriculumPersisted(this.group.id, target.id);
      this.diagnostics.check('AdminGroupDetails', 'changeCurriculum-backend', !!updated && updated.curriculumId === target.id, {
        groupId: this.group.id,
        expectedCurriculumId: target.id,
        actualCurriculumId: updated?.curriculumId || '',
      });
      if (!updated) {
        this.setFeedback('تعذر ربط المنهج بالمجموعة.', true);
        return;
      }
      this.group = updated;
      this.selectedCurriculumId = updated.curriculumId;
      this.reloadRelated();
      this.setFeedback(`تم ربط «${target.name}» بالمجموعة كمسودة. الطالب سيظل على النسخة المنشورة الحالية حتى تضغط «نشر التغييرات».`);
      this.diagnostics.success('AdminGroupDetails', 'changeCurriculum', elapsed(), { groupId: updated.id, curriculumId: target.id });
      this.cdr.detectChanges();
    } catch (error) {
      this.diagnostics.error('AdminGroupDetails', 'changeCurriculum:error', error, {
        groupId: this.group.id,
        curriculumId: target.id,
        durationMs: elapsed(),
      });
      this.setFeedback('تعذر ربط المنهج بالمجموعة في الـBackend.', true);
      this.cdr.detectChanges();
    } finally {
      this.isChangingCurriculum = false;
    }
  }

  async publishNow(): Promise<void> {
    if (!this.group || this.isPublishing) return;
    this.isPublishing = true;
    this.setFeedback('جاري نشر آخر نسخة من المنهج...');
    try {
      if (!this.group.hasDraftChanges) {
        const staged = this.groupCurriculum.syncDraftFromCurriculum(this.group.id, this.group.curriculumId);
        if (!staged) {
          this.setFeedback('تعذر تجهيز آخر نسخة من المنهج.', true);
          return;
        }
      }
      const published = await this.groupCurriculum.publish(this.group.id);
      if (!published) {
        this.setFeedback('لم يكتمل النشر. حاول مرة أخرى.', true);
        return;
      }
      this.preview.publishWeekNow(this.group.id, Math.max(1, this.weekNumber));
      this.group = published;
      this.setFeedback(`تم نشر الإصدار v${published.publishedCurriculum.version} وفتح الأسبوع ${this.weekNumber}.`);
      this.reloadRelated();
    } catch (error) {
      this.setFeedback(this.describePublishError(error), true);
    } finally {
      this.isPublishing = false;
    }
  }

  schedule(): void {
    if (!this.group || !this.scheduledAt || this.weekNumber < 1) {
      this.setFeedback('حدد الأسبوع وموعد النشر.', true);
      return;
    }
    this.preview.scheduleWeek(this.group.id, this.weekNumber, this.scheduledAt);
    this.setFeedback(`تمت جدولة الأسبوع ${this.weekNumber}.`);
    this.reloadRelated();
  }

  refreshDraftFromCurriculum(): void {
    if (!this.group) return;
    const source = this.curriculumRepository.getById(this.group.curriculumId);
    if (!source) {
      this.setFeedback('المنهج الأصلي غير موجود.', true);
      return;
    }
    const result = this.groupCurriculum.syncDraftFromCurriculum(this.group.id, source.id);
    if (!result) {
      this.setFeedback('تعذر تحديث المسودة.', true);
      return;
    }
    this.group = this.groups.getById(this.group.id);
    this.setFeedback('تم تحديث مسودة المجموعة من آخر نسخة محفوظة في المنهج.');
  }

  private reloadRelated(): void {
    if (!this.group) return;
    this.lessons = this.lessonsRepository.getAll();
    this.students = this.groups.getStudentsForGroup(this.group.id);
    this.supervisors = this.preview.getSupervisors();
    this.publications = this.preview
      .getPublications()
      .filter((item) => item.groupId === this.group!.id)
      .sort((a, b) => a.weekNumber - b.weekNumber);
  }

  private describePublishError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const httpError = error as HttpErrorResponse & { error?: string | { message?: string; detail?: string } };
      const body = httpError.error;
      const serverMessage = typeof body === 'string' ? body : body?.message || body?.detail || httpError.message;
      return `تعذر نشر المنهج في الـBackend (HTTP ${httpError.status || 0})${serverMessage ? `: ${serverMessage}` : '.'}`;
    }
    if (error instanceof Error && error.message) return `تعذر نشر المنهج: ${error.message}`;
    return 'تعذر نشر المنهج الآن.';
  }

  private setFeedback(message: string, error = false): void {
    this.feedback = message;
    this.feedbackError = error;
  }
}
