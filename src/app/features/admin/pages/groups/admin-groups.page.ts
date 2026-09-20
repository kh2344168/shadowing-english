import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AppDiagnosticsService } from '../../../../core/diagnostics/app-diagnostics.service';
import { PlatformPreviewService } from '../../../platform-preview/data-access/platform-preview.service';
import { WeekPublicationPreview } from '../../../platform-preview/data-access/platform-preview.models';
import { CurriculumRepository } from '../../../teacher/data-access/curriculum.repository';
import { TeacherCurriculum } from '../../../teacher/data-access/curriculum.models';
import { GroupCurriculumRepository } from '../../../teacher/data-access/group-curriculum.repository';
import { TeacherGroup } from '../../../teacher/data-access/teacher-group.models';
import { TeacherGroupRepository } from '../../../teacher/data-access/teacher-group.repository';

@Component({
  selector: 'app-admin-groups-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-groups.page.html',
  styleUrl: './admin-groups.page.scss',
})
export class AdminGroupsPage implements OnInit {
  groups: TeacherGroup[] = [];
  curriculums: TeacherCurriculum[] = [];
  publications: WeekPublicationPreview[] = [];
  name = '';
  curriculumId = '';
  startDate = new Date().toISOString().slice(0, 10);
  selectedGroupId = '';
  weekNumber = 1;
  scheduledAt = '';
  feedback = '';
  feedbackError = false;
  isPublishing = false;
  searchTerm = '';
  statusFilter: 'all' | 'published' | 'draft' = 'all';
  createOpen = false;

  constructor(
    private groupRepository: TeacherGroupRepository,
    private groupCurriculumRepository: GroupCurriculumRepository,
    private curriculumRepository: CurriculumRepository,
    private preview: PlatformPreviewService,
    private diagnostics: AppDiagnosticsService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void { void this.initialize(); }

  private async initialize(): Promise<void> {
    const elapsed = this.diagnostics.start('AdminGroups', 'initialize');
    try {
      const curriculums = await this.curriculumRepository.initializeFromBackend(true);
      this.diagnostics.check('AdminGroups', 'curriculums-from-backend', curriculums.length > 0, { curriculums: curriculums.length });
      const groups = await this.groupRepository.initializeFromBackend();
      await Promise.all(
        groups.map((group) => this.groupCurriculumRepository.refreshPublishedForGroup(group.id, false)),
      );
      this.reload();
      this.diagnostics.check('AdminGroups', 'backend-data-loaded', groups.length > 0, {
        backendGroups: groups.length,
        renderedGroups: this.groups.length,
      });
      // Angular is running zoneless in this project. Data loaded after `await` does
      // not always repaint a plain-array template until another UI event occurs.
      // Force the first server-backed render so existing groups are visible
      // immediately, without requiring the user to click "Create group".
      this.cdr.detectChanges();
      this.diagnostics.success('AdminGroups', 'initialize', elapsed(), {
        groups: groups.length,
        renderedGroups: this.groups.length,
      });
    } catch (error) {
      this.diagnostics.error('AdminGroups', 'initialize:error', error, {
        durationMs: elapsed(),
      });
      this.feedback = 'تعذر تحميل المجموعات من الـBackend. لن يتم استخدام LocalStorage كمصدر بديل.';
      this.feedbackError = true;
      this.groups = [];
      this.publications = [];
      this.cdr.detectChanges();
    }
  }

  get visibleGroups(): TeacherGroup[] {
    const query = this.searchTerm.trim().toLowerCase();
    return this.groups.filter((group) => {
      const matchesText = !query || group.name.toLowerCase().includes(query) || group.curriculumName.toLowerCase().includes(query);
      const matchesStatus = this.statusFilter === 'all' || (this.statusFilter === 'draft' ? group.hasDraftChanges : !group.hasDraftChanges);
      return matchesText && matchesStatus;
    });
  }

  supervisorName(group: TeacherGroup): string {
    const supervisors = this.preview.getSupervisors();
    const direct = supervisors.find((item) => item.id === group.teacherId);
    const assigned = supervisors.find((item) => item.groupIds.includes(group.id));
    return direct?.name || assigned?.name || 'غير معيّن';
  }

  openPublish(groupId: string): void {
    this.selectedGroupId = groupId;
    this.weekNumber = 1;
  }

  async createGroup(): Promise<void> {
    const elapsed = this.diagnostics.start('AdminGroups', 'createGroup', {
      name: this.name.trim(),
      curriculumId: this.curriculumId,
      startDate: this.startDate,
    });
    this.diagnostics.check('AdminGroups', 'createGroup-input', !!this.name.trim() && !!this.curriculumId, {
      curriculumId: this.curriculumId,
    });
    try {
      const group = await this.groupRepository.createGroup(this.name, this.curriculumId, this.startDate);
      this.feedback = group ? `تم إنشاء ${group.name}.` : 'أكمل بيانات المجموعة والمنهج.';
      this.feedbackError = !group;
      if (group) {
        this.name = '';
        this.createOpen = false;
        this.selectedGroupId = group.id;
        this.reload();
        this.cdr.detectChanges();
        this.diagnostics.success('AdminGroups', 'createGroup', elapsed(), { groupId: group.id });
      }
    } catch (error) {
      this.feedback = 'تعذر إنشاء المجموعة على الـBackend.';
      this.feedbackError = true;
      this.diagnostics.error('AdminGroups', 'createGroup:error', error, { durationMs: elapsed() });
      this.cdr.detectChanges();
    }
  }

  async deleteGroup(group: TeacherGroup): Promise<void> {
    if (!window.confirm(`حذف المجموعة «${group.name}»؟ يجب نقل كل الطلاب منها أولًا.`)) return;
    const elapsed = this.diagnostics.start('AdminGroups', 'deleteGroup', { groupId: group.id });
    try {
      await this.groupRepository.deleteGroupPersisted(group.id);
      this.feedback = `تم حذف المجموعة «${group.name}» من الـBackend.`;
      this.feedbackError = false;
      if (this.selectedGroupId === group.id) this.selectedGroupId = '';
      await this.groupRepository.initializeFromBackend();
      this.reload();
      this.cdr.detectChanges();
      this.diagnostics.success('AdminGroups', 'deleteGroup', elapsed(), { groupId: group.id });
    } catch (error) {
      const serverMessage = error instanceof HttpErrorResponse
        ? (typeof error.error === 'string' ? error.error : error.error?.message)
        : '';
      this.feedback = serverMessage || 'تعذر حذف المجموعة. انقل الطلاب المرتبطين بها أولًا.';
      this.feedbackError = true;
      this.diagnostics.error('AdminGroups', 'deleteGroup:error', error, { groupId: group.id, durationMs: elapsed() });
      this.cdr.detectChanges();
    }
  }

  async publishNow(): Promise<void> {
    console.log('[PUBLISH][ADMIN] Publish button clicked', {
      selectedGroupId: this.selectedGroupId,
      weekNumber: this.weekNumber,
      isPublishing: this.isPublishing,
    });
    if (!this.selectedGroupId || this.weekNumber < 1 || this.isPublishing) {
      console.warn('[PUBLISH][ADMIN] Publish aborted before request.', {
        selectedGroupId: this.selectedGroupId,
        weekNumber: this.weekNumber,
        isPublishing: this.isPublishing,
      });
      return;
    }

    const group = this.groupRepository.getById(this.selectedGroupId);
    console.log('[PUBLISH][ADMIN] Selected group state', group);
    if (!group) {
      this.setFeedback('المجموعة المحددة غير موجودة.', true);
      return;
    }

    this.isPublishing = true;
    this.setFeedback('جاري أخذ آخر تعديلات المنهج ونشرها للطلاب...');

    try {
      // If the group draft already has explicit edits (for example a lesson was
      // added directly to the group), publish that exact draft. Re-syncing here used
      // to overwrite those edits with the source curriculum immediately before PUT.
      if (!group.hasDraftChanges) {
        console.log('[PUBLISH][ADMIN] No draft changes detected; syncing draft from source curriculum before publish.');
        const staged = this.groupCurriculumRepository.syncDraftFromCurriculum(
          group.id,
          group.curriculumId,
        );
        if (!staged) {
          this.setFeedback('لم يتم العثور على المنهج المرتبط بهذه المجموعة.', true);
          return;
        }
      }

      console.log('[PUBLISH][ADMIN] Calling GroupCurriculumRepository.publish()', { groupId: group.id });
      const published = await this.groupCurriculumRepository.publish(group.id);
      console.log('[PUBLISH][ADMIN] Repository publish returned', published);
      if (!published) {
        this.setFeedback('لم يكتمل النشر. حاول مرة أخرى.', true);
        return;
      }

      console.log('[PUBLISH][ADMIN] Marking week as open in preview store', {
        groupId: this.selectedGroupId,
        weekNumber: this.weekNumber,
      });
      this.preview.publishWeekNow(this.selectedGroupId, this.weekNumber);
      this.setFeedback(
        `تم نشر آخر نسخة من «${published.curriculumName}» للطلاب (الإصدار ${published.publishedCurriculum.version})، وفتح الأسبوع ${this.weekNumber}.`,
      );
      this.reload();
    } catch (error) {
      console.error('[Admin publishing] Publication failed.', error);
      this.setFeedback(this.describePublishError(error), true);
    } finally {
      this.isPublishing = false;
    }
  }

  schedule(): void {
    if (!this.selectedGroupId || !this.scheduledAt || this.weekNumber < 1) {
      this.feedback = 'حدد المجموعة والأسبوع وموعد النشر.';
      this.feedbackError = true;
      return;
    }
    this.preview.scheduleWeek(this.selectedGroupId, this.weekNumber, this.scheduledAt);
    this.feedback = `تمت جدولة الأسبوع ${this.weekNumber}.`;
    this.feedbackError = false;
    this.reload();
  }

  publishedLessonCount(group: TeacherGroup): number {
    return group.publishedCurriculum.weeks.reduce(
      (weekTotal, week) =>
        weekTotal + week.days.reduce(
          (dayTotal, day) => dayTotal + day.lessonSlots.length,
          0,
        ),
      0,
    );
  }

  publicationsFor(groupId: string): WeekPublicationPreview[] {
    return this.publications
      .filter((item) => item.groupId === groupId)
      .sort((a, b) => a.weekNumber - b.weekNumber);
  }


  private describePublishError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const serverMessage =
        typeof error.error === 'string'
          ? error.error
          : error.error?.message || error.error?.detail || error.message;
      return `تعذر نشر المنهج في الـBackend (HTTP ${error.status || 0})${serverMessage ? `: ${serverMessage}` : '.'}`;
    }

    if (error instanceof Error && error.message) {
      return `تعذر نشر المنهج: ${error.message}`;
    }

    return 'تعذر نشر المنهج الآن. راجع نافذة run-api.cmd ثم حاول مرة أخرى.';
  }

  private setFeedback(message: string, error = false): void {
    this.feedback = message;
    this.feedbackError = error;
  }

  private reload(): void {
    this.curriculums = this.curriculumRepository.getAll();
    this.groups = this.groupRepository.getGroups();
    this.publications = this.preview.getPublications();
    this.curriculumId ||= this.curriculums[0]?.id || '';
    this.selectedGroupId ||= this.groups[0]?.id || '';
  }
}
