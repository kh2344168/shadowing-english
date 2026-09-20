import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AppDiagnosticsService } from '../../../../core/diagnostics/app-diagnostics.service';
import { CourseLesson } from '../../../lessons/data-access/lesson.models';
import { LessonRepository } from '../../../lessons/data-access/lesson.repository';
import { CurriculumRepository } from '../../../teacher/data-access/curriculum.repository';
import { TeacherCurriculum } from '../../../teacher/data-access/curriculum.models';

@Component({
  selector: 'app-admin-curriculums-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-curriculums.page.html',
  styleUrl: './admin-curriculums.page.scss',
})
export class AdminCurriculumsPage implements OnInit {
  curriculums: TeacherCurriculum[] = [];
  lessons: CourseLesson[] = [];
  searchTerm = '';
  selectedStatus: 'all' | 'ready' | 'draft' | 'archived' = 'all';
  selectedLevel = 'all';
  selectedSort: 'newest' | 'oldest' | 'name' = 'newest';
  createOpen = false;
  newCurriculumName = '';
  newCurriculumDescription = '';
  openMenuId = '';
  feedback = '';

  readonly levelFilters = ['all', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

  constructor(
    private curriculumRepository: CurriculumRepository,
    private lessonRepository: LessonRepository,
    private diagnostics: AppDiagnosticsService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void { void this.initialize(); }

  private async initialize(): Promise<void> {
    const elapsed = this.diagnostics.start('AdminCurriculums', 'initialize');
    try {
      const curriculums = await this.curriculumRepository.initializeFromBackend();
      this.reload();
      this.diagnostics.check('AdminCurriculums', 'backend-data-loaded', this.curriculums.length === curriculums.length, {
        backendCurriculums: curriculums.length,
        renderedCurriculums: this.curriculums.length,
      });
      this.cdr.detectChanges();
      this.diagnostics.success('AdminCurriculums', 'initialize', elapsed(), { curriculums: curriculums.length });
    } catch (error) {
      this.curriculums = [];
      this.diagnostics.error('AdminCurriculums', 'initialize:error', error, { durationMs: elapsed() });
      this.feedback = 'تعذر تحميل المناهج من الـBackend.';
      this.cdr.detectChanges();
    }
  }

  get visibleCurriculums(): TeacherCurriculum[] {
    const query = this.searchTerm.trim().toLowerCase();
    const rows = this.curriculums.filter((curriculum) => {
      const matchesText =
        !query ||
        curriculum.name.toLowerCase().includes(query) ||
        curriculum.description.toLowerCase().includes(query);
      const matchesStatus = this.selectedStatus === 'all' || curriculum.status === this.selectedStatus;
      const matchesLevel = this.selectedLevel === 'all' || this.curriculumLevel(curriculum) === this.selectedLevel;
      return matchesText && matchesStatus && matchesLevel;
    });

    return [...rows].sort((left, right) => {
      if (this.selectedSort === 'name') return left.name.localeCompare(right.name, 'ar');
      const leftTime = new Date(left.updatedAt).getTime();
      const rightTime = new Date(right.updatedAt).getTime();
      return this.selectedSort === 'oldest' ? leftTime - rightTime : rightTime - leftTime;
    });
  }

  async createCurriculum(): Promise<void> {
    const name = this.newCurriculumName.trim();
    if (!name) {
      this.feedback = 'اكتب اسم المنهج أولًا.';
      return;
    }

    const elapsed = this.diagnostics.start('AdminCurriculums', 'create', { name });
    const created = await this.curriculumRepository.createPersisted(name, this.newCurriculumDescription);
    this.diagnostics.check('AdminCurriculums', 'create-backend', !!created.id, { curriculumId: created.id });
    this.feedback = `تم إنشاء «${created.name}» كمسودة وحفظه في الـBackend.`;
    this.diagnostics.success('AdminCurriculums', 'create', elapsed(), { curriculumId: created.id });
    this.newCurriculumName = '';
    this.newCurriculumDescription = '';
    this.createOpen = false;
    this.reload();
  }

  async duplicate(curriculum: TeacherCurriculum): Promise<void> {
    const copy = await this.curriculumRepository.duplicatePersisted(curriculum.id);
    this.feedback = copy ? `تم إنشاء نسخة من «${curriculum.name}».` : 'تعذر نسخ المنهج.';
    this.openMenuId = '';
    this.reload();
  }

  async archive(curriculum: TeacherCurriculum): Promise<void> {
    if (!window.confirm(`أرشفة «${curriculum.name}»؟`)) return;
    await this.curriculumRepository.archivePersisted(curriculum.id);
    this.feedback = 'تمت أرشفة المنهج.';
    this.openMenuId = '';
    this.reload();
  }

  async deleteCurriculum(curriculum: TeacherCurriculum): Promise<void> {
    if (!window.confirm(`حذف «${curriculum.name}» نهائيًا؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    const elapsed = this.diagnostics.start('AdminCurriculums', 'delete', { curriculumId: curriculum.id });
    try {
      await this.curriculumRepository.deletePersisted(curriculum.id);
      this.feedback = `تم حذف «${curriculum.name}» من الـBackend.`;
      this.openMenuId = '';
      this.reload();
      this.cdr.detectChanges();
      this.diagnostics.success('AdminCurriculums', 'delete', elapsed(), { curriculumId: curriculum.id });
    } catch (error) {
      const serverMessage = error instanceof HttpErrorResponse
        ? (typeof error.error === 'string' ? error.error : error.error?.message)
        : '';
      this.feedback = serverMessage || 'تعذر حذف المنهج. إذا كان مرتبطًا بمجموعة، انقل أو احذف المجموعة أولًا.';
      this.diagnostics.error('AdminCurriculums', 'delete:error', error, { curriculumId: curriculum.id, durationMs: elapsed() });
      this.cdr.detectChanges();
    }
  }

  toggleMenu(id: string): void {
    this.openMenuId = this.openMenuId === id ? '' : id;
  }

  lessonsCount(curriculum: TeacherCurriculum): number {
    return this.curriculumRepository.countLessons(curriculum);
  }

  curriculumLevel(curriculum: TeacherCurriculum): string {
    const lessonIds = curriculum.weeks.flatMap((week) =>
      week.days.flatMap((day) => day.lessonSlots.map((slot) => slot.lessonId)),
    );
    const levels = new Set<string>();
    for (const lessonId of lessonIds) {
      const lesson = this.lessons.find((item) => item.id === lessonId);
      const level = lesson?.activities?.find((activity) => activity.type === 'ai-conversation')?.conversationConfig?.level;
      if (level) levels.add(level);
    }
    return levels.size === 1 ? Array.from(levels)[0] : levels.size > 1 ? 'متعدد' : '—';
  }

  statusLabel(status: TeacherCurriculum['status']): string {
    if (status === 'ready') return 'نشط';
    if (status === 'draft') return 'مسودة';
    return 'مؤرشف';
  }

  private reload(): void {
    this.curriculums = this.curriculumRepository.getAll();
    this.lessons = this.lessonRepository.getAll();
  }
}
