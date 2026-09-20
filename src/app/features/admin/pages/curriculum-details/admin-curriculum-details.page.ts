import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AppDiagnosticsService } from '../../../../core/diagnostics/app-diagnostics.service';
import { CourseLesson } from '../../../lessons/data-access/lesson.models';
import { LessonRepository } from '../../../lessons/data-access/lesson.repository';
import { CurriculumRepository } from '../../../teacher/data-access/curriculum.repository';
import { CurriculumDay, CurriculumLessonSlot, CurriculumWeek, TeacherCurriculum } from '../../../teacher/data-access/curriculum.models';

type PickerMode = 'add' | 'replace';

@Component({
  selector: 'app-admin-curriculum-details-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-curriculum-details.page.html',
  styleUrl: './admin-curriculum-details.page.scss',
})
export class AdminCurriculumDetailsPage implements OnInit {
  curriculum: TeacherCurriculum | null = null;
  lessons: CourseLesson[] = [];
  openedWeeks = new Set<string>();
  pickerOpen = false;
  pickerMode: PickerMode = 'add';
  pickerWeekId = '';
  pickerDayId = '';
  pickerSlotId = '';
  lessonSearch = '';
  selectedLevel = 'all';
  selectedLessonId = '';
  placementRepetitions = 1;
  placementRequired = true;
  feedback = '';

  readonly levelFilters = ['all', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private curriculumRepository: CurriculumRepository,
    private lessonRepository: LessonRepository,
    private diagnostics: AppDiagnosticsService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void { void this.initialize(); }

  private async initialize(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('curriculumId') || '';
    const elapsed = this.diagnostics.start('AdminCurriculumDetails', 'initialize', { curriculumId: id });
    try {
      await this.curriculumRepository.initializeFromBackend();
      this.lessons = this.lessonRepository.getAll();
      this.curriculum = this.curriculumRepository.getById(id);
      this.diagnostics.check('AdminCurriculumDetails', 'curriculum-found', !!this.curriculum, { curriculumId: id });
      if (!this.curriculum) {
        void this.router.navigate(['/admin/curriculums']);
        return;
      }
      for (const week of this.curriculum.weeks) this.openedWeeks.add(week.id);
      this.cdr.detectChanges();
      this.diagnostics.success('AdminCurriculumDetails', 'initialize', elapsed(), { curriculumId: id });
    } catch (error) {
      this.diagnostics.error('AdminCurriculumDetails', 'initialize:error', error, { curriculumId: id, durationMs: elapsed() });
      this.feedback = 'تعذر تحميل المنهج من الـBackend.';
      this.cdr.detectChanges();
    }
  }

  get filteredLessons(): CourseLesson[] {
    const query = this.lessonSearch.trim().toLowerCase();
    return this.lessons.filter((lesson) => {
      if ((lesson.status || 'ready') !== 'ready') return false;
      const matchesText = !query || lesson.title.toLowerCase().includes(query) || (lesson.description || '').toLowerCase().includes(query);
      const matchesLevel = this.selectedLevel === 'all' || this.lessonLevel(lesson) === this.selectedLevel;
      return matchesText && matchesLevel;
    });
  }

  totalLessons(): number {
    return this.curriculum ? this.curriculumRepository.countLessons(this.curriculum) : 0;
  }

  async saveCurriculum(): Promise<void> {
    if (!this.curriculum) return;
    const elapsed = this.diagnostics.start('AdminCurriculumDetails', 'save', { curriculumId: this.curriculum.id });
    try {
      this.curriculum = await this.curriculumRepository.savePersisted({ ...this.curriculum, status: 'ready' });
      this.diagnostics.check('AdminCurriculumDetails', 'save-backend-roundtrip', !!this.curriculum.updatedAt, { curriculumId: this.curriculum.id });
      this.feedback = 'تم حفظ المنهج في الـBackend. لن تظهر التغييرات للطلاب قبل نشرها من صفحة المجموعات.';
      this.diagnostics.success('AdminCurriculumDetails', 'save', elapsed(), { curriculumId: this.curriculum.id });
      this.cdr.detectChanges();
    } catch (error) {
      this.diagnostics.error('AdminCurriculumDetails', 'save:error', error, { curriculumId: this.curriculum.id, durationMs: elapsed() });
      this.feedback = 'تعذر حفظ المنهج في الـBackend.';
      this.cdr.detectChanges();
    }
  }

  addWeek(): void {
    if (!this.curriculum) return;
    this.curriculum = this.curriculumRepository.addWeek(this.curriculum);
    const added = this.curriculum.weeks[this.curriculum.weeks.length - 1];
    if (added) this.openedWeeks.add(added.id);
  }

  addDay(week: CurriculumWeek): void {
    if (!this.curriculum) return;
    this.curriculum = this.curriculumRepository.addDay(this.curriculum, week.id);
    this.openedWeeks.add(week.id);
  }

  toggleWeek(weekId: string): void {
    if (this.openedWeeks.has(weekId)) this.openedWeeks.delete(weekId);
    else this.openedWeeks.add(weekId);
  }

  isWeekOpen(weekId: string): boolean {
    return this.openedWeeks.has(weekId);
  }

  getLesson(slot: CurriculumLessonSlot): CourseLesson | null {
    return this.lessons.find((lesson) => lesson.id === slot.lessonId) || null;
  }

  lessonLevel(lesson: CourseLesson | null): string {
    if (!lesson) return '—';
    return lesson.activities?.find((activity) => activity.type === 'ai-conversation')?.conversationConfig?.level || '—';
  }

  openPicker(week: CurriculumWeek, day: CurriculumDay, mode: PickerMode = 'add', slot?: CurriculumLessonSlot): void {
    this.pickerOpen = true;
    this.pickerMode = mode;
    this.pickerWeekId = week.id;
    this.pickerDayId = day.id;
    this.pickerSlotId = slot?.id || '';
    this.lessonSearch = '';
    this.selectedLevel = 'all';
    this.selectedLessonId = slot?.lessonId || '';
    this.placementRepetitions = slot?.repetitionCount || 1;
    this.placementRequired = slot?.required ?? true;
  }

  selectLesson(lesson: CourseLesson): void {
    this.selectedLessonId = lesson.id;
    if (this.pickerMode === 'add') this.placementRepetitions = Math.max(1, lesson.requiredRepetitions || 1);
  }

  savePicker(): void {
    if (!this.curriculum || !this.selectedLessonId) return;
    const lesson = this.lessons.find((item) => item.id === this.selectedLessonId);
    if (!lesson) return;

    if (this.pickerMode === 'replace' && this.pickerSlotId) {
      this.curriculum = this.curriculumRepository.replaceLessonSlot(this.curriculum, this.pickerWeekId, this.pickerDayId, this.pickerSlotId, lesson.id);
    } else {
      this.curriculum = this.curriculumRepository.addLessonToDay(this.curriculum, this.pickerWeekId, this.pickerDayId, lesson, this.placementRepetitions, this.placementRequired);
    }
    this.pickerOpen = false;
    this.feedback = 'تم تحديث بنية المنهج محليًا. اضغط حفظ التغييرات لتأكيد حالة المنهج.';
  }

  async removeSlot(week: CurriculumWeek, day: CurriculumDay, slot: CurriculumLessonSlot): Promise<void> {
    if (!this.curriculum || !window.confirm('إزالة الدرس من المنهج؟ سيظل الدرس موجودًا في مكتبة الدروس، وستتحدث مسودات المجموعات المرتبطة تلقائيًا.')) return;
    const curriculumId = this.curriculum.id;
    const elapsed = this.diagnostics.start('AdminCurriculumDetails', 'remove-slot', {
      curriculumId, weekId: week.id, dayId: day.id, slotId: slot.id, lessonId: slot.lessonId,
    });
    try {
      this.curriculum = await this.curriculumRepository.removeLessonSlotPersisted(
        this.curriculum, week.id, day.id, slot.id,
      );
      this.feedback = 'تم حذف الدرس من المنهج في الـBackend وتحديث مسودات المجموعات المرتبطة. انشر المجموعة ليختفي الدرس من صفحة الطالب.';
      this.diagnostics.success('AdminCurriculumDetails', 'remove-slot', elapsed(), {
        curriculumId, remainingLessons: this.totalLessons(),
      });
      this.cdr.detectChanges();
    } catch (error) {
      this.feedback = 'تعذر حذف الدرس من المنهج في الـBackend.';
      this.diagnostics.error('AdminCurriculumDetails', 'remove-slot:error', error, { curriculumId, durationMs: elapsed() });
      this.cdr.detectChanges();
    }
  }

  moveSlot(week: CurriculumWeek, day: CurriculumDay, slot: CurriculumLessonSlot, direction: -1 | 1): void {
    if (!this.curriculum) return;
    const next = structuredClone(this.curriculum) as TeacherCurriculum;
    const targetDay = next.weeks.find((item) => item.id === week.id)?.days.find((item) => item.id === day.id);
    if (!targetDay) return;
    const index = targetDay.lessonSlots.findIndex((item) => item.id === slot.id);
    const newIndex = index + direction;
    if (index < 0 || newIndex < 0 || newIndex >= targetDay.lessonSlots.length) return;
    const [moved] = targetDay.lessonSlots.splice(index, 1);
    targetDay.lessonSlots.splice(newIndex, 0, moved);
    targetDay.lessonSlots = targetDay.lessonSlots.map((item, order) => ({ ...item, order }));
    this.curriculum = this.curriculumRepository.save(next);
  }
}
