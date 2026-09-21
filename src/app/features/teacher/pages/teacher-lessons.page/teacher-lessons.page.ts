import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import {
  faArchive,
  faBookOpen,
  faCopy,
  faDownload,
  faFileCode,
  faFileImport,
  faLayerGroup,
  faPen,
  faPlus,
  faRepeat,
  faRotateLeft,
  faTrash,
} from '@fortawesome/free-solid-svg-icons';
import { CourseLesson, getLessonActivities } from '../../../lessons/data-access/lesson.models';
import { LessonRepository } from '../../../lessons/data-access/lesson.repository';
import { AuthService } from '../../../../core/auth/services/auth.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-teacher-lessons-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, FontAwesomeModule],
  templateUrl: './teacher-lessons.page.html',
  styleUrl: './teacher-lessons.page.scss',
})
export class TeacherLessonsPage {
  readonly icons = {
    create: faPlus,
    lesson: faBookOpen,
    segments: faLayerGroup,
    repetitions: faRepeat,
    edit: faPen,
    duplicate: faCopy,
    export: faDownload,
    metadata: faFileCode,
    import: faFileImport,
    archive: faArchive,
    restore: faRotateLeft,
    delete: faTrash,
  };

  readonly lessons$: Observable<CourseLesson[]>;
  busyLessonId = '';
  isImporting = false;
  feedbackMessage = '';
  feedbackError = false;
  searchTerm = '';
  selectedLevel = 'all';
  selectedStatus = 'all';
  selectedSort: 'newest' | 'oldest' | 'name' = 'newest';
  openMenuId = '';

  readonly levelFilters = ['all', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

  constructor(
    private lessonRepository: LessonRepository,
    public auth: AuthService,
  ) {
    this.lessons$ = lessonRepository.lessons$;
  }

  get contentBasePath(): '/admin' | '/teacher' {
    return this.auth.isTeacher() ? '/teacher' : '/admin';
  }

  primaryShadowingStageId(lesson: CourseLesson): string {
    return getLessonActivities(lesson).find(
      (activity) => activity.type === 'shadowing',
    )?.id || 'shadowing';
  }

  activityLabels(lesson: CourseLesson): string {
    const labels = {
      shadowing: 'شادوينج',
      vocabulary: 'كلمات',
      'shadowing-review': 'شادوينج ثانٍ',
      'listen-write': 'اسمع واكتب',
      quiz: 'اختبار',
      'ai-conversation': 'محادثة AI',
    } as const;
    return getLessonActivities(lesson)
      .map((activity) => labels[activity.type])
      .join(' ← ');
  }

  needsAiProcessing(lesson: CourseLesson): boolean {
    return !getLessonActivities(lesson).some((activity) => activity.aiGenerated);
  }


  filteredLessons(lessons: CourseLesson[]): CourseLesson[] {
    const term = this.searchTerm.trim().toLowerCase();
    const result = lessons.filter((lesson) => {
      const level = this.lessonLevel(lesson);
      const status = this.lessonDisplayStatus(lesson);
      const matchesSearch = !term || [lesson.title, lesson.description || '', lesson.mediaFileName || '']
        .some((value) => value.toLowerCase().includes(term));
      const matchesLevel = this.selectedLevel === 'all' || level === this.selectedLevel;
      const matchesStatus = this.selectedStatus === 'all' || status === this.selectedStatus;
      return matchesSearch && matchesLevel && matchesStatus;
    });

    return [...result].sort((left, right) => {
      if (this.selectedSort === 'name') return left.title.localeCompare(right.title, 'ar');
      const leftTime = new Date(left.updatedAt).getTime();
      const rightTime = new Date(right.updatedAt).getTime();
      return this.selectedSort === 'oldest' ? leftTime - rightTime : rightTime - leftTime;
    });
  }

  lessonLevel(lesson: CourseLesson): string {
    const conversation = getLessonActivities(lesson).find((activity) => activity.type === 'ai-conversation');
    return conversation?.conversationConfig?.level || '—';
  }

  hasCompletedShadowing(lesson: CourseLesson): boolean {
    return lesson.segments.length > 0 && Boolean(lesson.mediaFileName?.trim());
  }

  lessonDisplayStatus(lesson: CourseLesson): 'ready' | 'processing' | 'draft' | 'archived' {
    if (lesson.status === 'archived') return 'archived';
    if (this.hasCompletedShadowing(lesson) && this.needsAiProcessing(lesson)) return 'processing';
    if (lesson.status === 'draft') return 'draft';
    return this.needsAiProcessing(lesson) ? 'processing' : 'ready';
  }

  statusLabel(lesson: CourseLesson): string {
    const status = this.lessonDisplayStatus(lesson);
    return ({ ready: 'جاهز', processing: 'الشادوينج جاهز', draft: 'مسودة', archived: 'مؤرشف' } as const)[status];
  }

  toggleMenu(lessonId: string): void {
    this.openMenuId = this.openMenuId === lessonId ? '' : lessonId;
  }

  closeMenu(): void {
    this.openMenuId = '';
  }

  async duplicateLesson(lesson: CourseLesson): Promise<void> {
    await this.runLessonAction(lesson.id, async () => {
      const duplicated = await this.lessonRepository.duplicateLesson(lesson.id);
      if (!duplicated) throw new Error('Lesson not found.');
      this.setFeedback('تم إنشاء نسخة جديدة داخل Lesson Library.');
    });
  }

  async toggleArchive(lesson: CourseLesson): Promise<void> {
    const archived = lesson.status === 'archived';
    const confirmed = window.confirm(
      archived
        ? `إرجاع ${lesson.title} إلى Lesson Library؟`
        : `أرشفة ${lesson.title}؟ ستستمر في العمل داخل المناهج المنشورة الحالية.`,
    );
    if (!confirmed) return;

    if (this.busyLessonId || this.isImporting) return;
    this.busyLessonId = lesson.id;
    this.feedbackMessage = '';

    try {
      const saved = await this.lessonRepository.setArchived(lesson.id, !archived);
      if (!saved) throw new Error('Lesson not found.');
      this.setFeedback(archived ? 'تم إرجاع الدرس.' : 'تمت أرشفة الدرس.');
    } catch (error) {
      console.error('[Lesson Library] Archive action failed.', error);
      this.setFeedback(
        error instanceof Error ? error.message : 'لم تكتمل العملية. تأكد أن الـAPI يعمل ثم حاول مرة أخرى.',
        true,
      );
    } finally {
      this.busyLessonId = '';
    }
  }

  downloadMetadata(lesson: CourseLesson): void {
    const blob = new Blob([JSON.stringify(lesson, null, 2)], {
      type: 'application/json',
    });
    this.downloadBlob(
      blob,
      `${this.safeFileName(lesson.title) || 'lesson'}.json`,
    );
    this.setFeedback('تم تنزيل بيانات الدرس بصيغة JSON.');
  }

  async exportLesson(lesson: CourseLesson): Promise<void> {
    await this.runLessonAction(lesson.id, async () => {
      const portable = await this.lessonRepository.exportPortableLesson(
        lesson.id,
      );
      this.downloadBlob(portable.blob, portable.fileName);
      this.setFeedback('تم تنزيل نسخة كاملة من الدرس تشمل ملف الـMedia.');
    });
  }

  async importLesson(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.isImporting = true;
    this.feedbackMessage = '';

    try {
      const lesson = await this.lessonRepository.importPortableLesson(file);
      this.setFeedback(
        `تم Import للدرس «${lesson.title}» داخل Lesson Library كـDraft.`,
      );
    } catch (error) {
      console.error('[Lesson import] Import failed.', error);
      this.setFeedback(
        error instanceof Error
          ? error.message
          : 'تعذر Import للدرس. تأكد من أن الملف صادر من المنصة.',
        true,
      );
    } finally {
      this.isImporting = false;
    }
  }

  async deleteLesson(lesson: CourseLesson): Promise<void> {
    const check = this.lessonRepository.getDeleteCheck(lesson.id);

    if (!check.canDelete) {
      const locations = check.references
        .slice(0, 6)
        .map(
          (reference) =>
            `${reference.ownerName} — ${reference.weekName} / ${reference.dayName}`,
        )
        .join('\n');
      const remaining = Math.max(0, check.references.length - 6);

      window.alert(
        `لا يمكن حذف «${lesson.title}» لأنها مستخدمة في ${check.references.length} مكان.\n\n${locations}${remaining ? `\nو${remaining} أماكن أخرى.` : ''}\n\nاحذفها من هذه المناهج أو قم بأرشفتها بدلًا من الحذف.`,
      );
      return;
    }

    const confirmed = window.confirm(
      `حذف «${lesson.title}» نهائيًا؟\n\nسيتم حذف ملف الـMedia و${check.progressRows} سجلات تقدم و${check.recordings} تسجيلات مرتبطة. لا يمكن التراجع عن ذلك.`,
    );
    if (!confirmed) return;

    if (this.busyLessonId || this.isImporting) return;
    this.busyLessonId = lesson.id;
    this.feedbackMessage = '';

    try {
      const result = await this.lessonRepository.deleteLessonSafely(lesson.id);
      if (!result.deleted) {
        throw new Error('تم إيقاف الحذف لأن الدرس أصبح مستخدمًا في منهج.');
      }
      this.setFeedback('تم حذف الدرس نهائيًا وتحديث القائمة فورًا.');
    } catch (error) {
      console.error('[Lesson Library] Delete failed.', error);
      this.setFeedback(
        error instanceof Error ? error.message : 'تعذر حذف الدرس. تأكد أن الـAPI يعمل ثم حاول مرة أخرى.',
        true,
      );
    } finally {
      this.busyLessonId = '';
    }
  }

  private async runLessonAction(
    lessonId: string,
    action: () => Promise<void>,
  ): Promise<void> {
    if (this.busyLessonId || this.isImporting) return;
    this.busyLessonId = lessonId;
    this.feedbackMessage = '';

    try {
      await action();
    } catch (error) {
      console.error('[Lesson Library] Action failed.', error);
      this.setFeedback(
        error instanceof Error
          ? error.message
          : 'لم تكتمل العملية. تأكد أن الـAPI يعمل ثم حاول مرة أخرى.',
        true,
      );
    } finally {
      this.busyLessonId = '';
    }
  }

  private setFeedback(message: string, error = false): void {
    this.feedbackMessage = message;
    this.feedbackError = error;
  }

  private downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  private safeFileName(value: string): string {
    return value
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 120);
  }
}
