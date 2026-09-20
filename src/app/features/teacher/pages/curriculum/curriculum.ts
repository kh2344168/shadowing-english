import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import {
  faArchive,
  faBookOpen,
  faChevronDown,
  faChevronLeft,
  faCopy,
  faEllipsis,
  faFolderOpen,
  faMagnifyingGlass,
  faPlus,
  faRightLeft,
  faSave,
  faTrash,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { CourseLesson } from '../../../lessons/data-access/lesson.models';
import { LessonRepository } from '../../../lessons/data-access/lesson.repository';
import { AuthService } from '../../../../core/auth/services/auth.service';
import {
  CurriculumDay,
  CurriculumLessonSlot,
  CurriculumWeek,
  TeacherCurriculum,
} from '../../data-access/curriculum.models';
import { CurriculumRepository } from '../../data-access/curriculum.repository';

type LessonPickerMode = 'add' | 'replace';

@Component({
  selector: 'app-teacher-curriculum-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, FontAwesomeModule],
  templateUrl: './curriculum.html',
  styleUrl: './curriculum.scss',
})
export class TeacherCurriculumPage implements OnInit {
  readonly icons = {
    add: faPlus,
    lesson: faBookOpen,
    open: faChevronDown,
    closed: faChevronLeft,
    search: faMagnifyingGlass,
    close: faXmark,
    remove: faTrash,
    copy: faCopy,
    archive: faArchive,
    openItem: faFolderOpen,
    more: faEllipsis,
    move: faRightLeft,
    save: faSave,
  };

  curriculums: TeacherCurriculum[] = [];
  lessons: CourseLesson[] = [];
  selectedCurriculumId = '';
  openedWeekId = '';
  openedDayId = '';

  createOpen = false;
  newCurriculumName = '';
  newCurriculumDescription = '';

  pickerOpen = false;
  pickerMode: LessonPickerMode = 'add';
  pickerWeekId = '';
  pickerDayId = '';
  pickerSlotId = '';
  lessonSearch = '';
  selectedLessonId = '';
  placementRepetitions = 1;
  placementRequired = true;

  slotActionsOpen = false;
  activeWeekId = '';
  activeDayId = '';
  activeSlotId = '';
  activeRepetitionCount = 1;
  activeRequired = true;
  targetWeekId = '';
  targetDayId = '';
  curriculumSaveMessage = '';

  constructor(
    private lessonRepository: LessonRepository,
    private curriculumRepository: CurriculumRepository,
    public auth: AuthService,
  ) {}

  get publishPath(): string {
    return this.auth.isTeacher() ? '/teacher/groups' : '/admin/groups';
  }

  ngOnInit(): void {
    this.lessons = this.lessonRepository.getAll();
    this.refreshCurriculums();
  }

  get selectedCurriculum(): TeacherCurriculum | null {
    return (
      this.curriculums.find(
        (curriculum) => curriculum.id === this.selectedCurriculumId,
      ) || null
    );
  }

  get filteredLessons(): CourseLesson[] {
    const query = this.lessonSearch.trim().toLowerCase();
    const lessons = this.lessons.filter(
      (lesson) => (lesson.status || 'ready') === 'ready',
    );

    if (!query) return lessons;

    return lessons.filter((lesson) =>
      lesson.title.toLowerCase().includes(query),
    );
  }

  get selectedLesson(): CourseLesson | null {
    return (
      this.lessons.find((lesson) => lesson.id === this.selectedLessonId) || null
    );
  }

  get activeSlot(): CurriculumLessonSlot | null {
    const curriculum = this.selectedCurriculum;
    if (!curriculum) return null;

    return (
      curriculum.weeks
        .find((week) => week.id === this.activeWeekId)
        ?.days.find((day) => day.id === this.activeDayId)
        ?.lessonSlots.find((slot) => slot.id === this.activeSlotId) || null
    );
  }

  get targetDays(): CurriculumDay[] {
    const curriculum = this.selectedCurriculum;
    return (
      curriculum?.weeks.find((week) => week.id === this.targetWeekId)?.days || []
    );
  }

  refreshCurriculums(selectedId?: string): void {
    this.curriculums = this.curriculumRepository.getAll();
    this.selectedCurriculumId =
      selectedId ||
      (this.curriculums.some(
        (curriculum) => curriculum.id === this.selectedCurriculumId,
      )
        ? this.selectedCurriculumId
        : this.curriculums[0]?.id || '');

    const selected = this.selectedCurriculum;
    this.openedWeekId = selected?.weeks[0]?.id || '';
    this.openedDayId = selected?.weeks[0]?.days[0]?.id || '';
  }

  openCurriculum(curriculumId: string): void {
    this.selectedCurriculumId = curriculumId;
    const curriculum = this.selectedCurriculum;
    this.openedWeekId = curriculum?.weeks[0]?.id || '';
    this.openedDayId = curriculum?.weeks[0]?.days[0]?.id || '';

    window.setTimeout(() => {
      document
        .getElementById('curriculum-builder')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  createCurriculum(): void {
    const name = this.newCurriculumName.trim();
    if (!name) return;

    const curriculum = this.curriculumRepository.create(
      name,
      this.newCurriculumDescription,
    );

    this.newCurriculumName = '';
    this.newCurriculumDescription = '';
    this.createOpen = false;
    this.refreshCurriculums(curriculum.id);
  }

  duplicateCurriculum(curriculumId: string): void {
    const duplicated = this.curriculumRepository.duplicate(curriculumId);
    this.refreshCurriculums(duplicated?.id);
  }

  archiveCurriculum(curriculumId: string): void {
    const confirmed = window.confirm('Archive this curriculum?');
    if (!confirmed) return;

    this.curriculumRepository.archive(curriculumId);
    this.refreshCurriculums();
  }

  addWeek(): void {
    const curriculum = this.selectedCurriculum;
    if (!curriculum) return;

    const updated = this.curriculumRepository.addWeek(curriculum);
    this.refreshCurriculums(updated.id);
    this.openedWeekId = updated.weeks[updated.weeks.length - 1]?.id || '';
  }

  addDay(weekId: string): void {
    const curriculum = this.selectedCurriculum;
    if (!curriculum) return;

    const updated = this.curriculumRepository.addDay(curriculum, weekId);
    this.refreshCurriculums(updated.id);
    const week = updated.weeks.find((item) => item.id === weekId);
    this.openedWeekId = weekId;
    this.openedDayId = week?.days[week.days.length - 1]?.id || '';
  }

  toggleWeek(weekId: string): void {
    this.openedWeekId = this.openedWeekId === weekId ? '' : weekId;
  }

  toggleDay(dayId: string): void {
    this.openedDayId = this.openedDayId === dayId ? '' : dayId;
  }

  isWeekOpen(weekId: string): boolean {
    return this.openedWeekId === weekId;
  }

  isDayOpen(dayId: string): boolean {
    return this.openedDayId === dayId;
  }

  openLessonPicker(
    week: CurriculumWeek,
    day: CurriculumDay,
    mode: LessonPickerMode = 'add',
    slot?: CurriculumLessonSlot,
  ): void {
    this.pickerMode = mode;
    this.pickerWeekId = week.id;
    this.pickerDayId = day.id;
    this.pickerSlotId = slot?.id || '';
    this.lessonSearch = '';
    this.selectedLessonId = '';
    this.placementRepetitions = slot?.repetitionCount || 1;
    this.placementRequired = slot?.required ?? true;
    this.pickerOpen = true;
  }

  closeLessonPicker(): void {
    this.pickerOpen = false;
    this.selectedLessonId = '';
  }

  selectLesson(lesson: CourseLesson): void {
    this.selectedLessonId = lesson.id;

    if (this.pickerMode === 'add') {
      this.placementRepetitions = lesson.requiredRepetitions;
    }
  }

  saveLessonPickerSelection(): void {
    const curriculum = this.selectedCurriculum;
    const lesson = this.selectedLesson;
    if (!curriculum || !lesson) return;

    let updated: TeacherCurriculum;

    if (this.pickerMode === 'replace' && this.pickerSlotId) {
      updated = this.curriculumRepository.replaceLessonSlot(
        curriculum,
        this.pickerWeekId,
        this.pickerDayId,
        this.pickerSlotId,
        lesson.id,
      );
    } else {
      updated = this.curriculumRepository.addLessonToDay(
        curriculum,
        this.pickerWeekId,
        this.pickerDayId,
        lesson,
        this.placementRepetitions,
        this.placementRequired,
      );
    }

    this.closeLessonPicker();
    this.refreshCurriculums(updated.id);
    this.openedWeekId = this.pickerWeekId;
    this.openedDayId = this.pickerDayId;
  }

  openSlotActions(
    week: CurriculumWeek,
    day: CurriculumDay,
    slot: CurriculumLessonSlot,
  ): void {
    this.activeWeekId = week.id;
    this.activeDayId = day.id;
    this.activeSlotId = slot.id;
    this.activeRepetitionCount = slot.repetitionCount;
    this.activeRequired = slot.required;
    this.targetWeekId = week.id;
    this.targetDayId = day.id;
    this.slotActionsOpen = true;
  }

  closeSlotActions(): void {
    this.slotActionsOpen = false;
  }

  onTargetWeekChanged(): void {
    this.targetDayId = this.targetDays[0]?.id || '';
  }

  saveSlotSettings(): void {
    const curriculum = this.selectedCurriculum;
    if (!curriculum || !this.activeSlot) return;

    const updated = this.curriculumRepository.updateLessonSlot(
      curriculum,
      this.activeWeekId,
      this.activeDayId,
      this.activeSlotId,
      {
        repetitionCount: this.activeRepetitionCount,
        required: this.activeRequired,
      },
    );

    this.closeSlotActions();
    this.refreshCurriculums(updated.id);
  }

  copyActiveSlot(): void {
    const curriculum = this.selectedCurriculum;
    if (!curriculum || !this.activeSlot || !this.targetDayId) return;

    const updated = this.curriculumRepository.copyLessonSlot(
      curriculum,
      this.activeWeekId,
      this.activeDayId,
      this.activeSlotId,
      this.targetWeekId,
      this.targetDayId,
    );

    this.closeSlotActions();
    this.refreshCurriculums(updated.id);
  }

  moveActiveSlot(): void {
    const curriculum = this.selectedCurriculum;
    if (!curriculum || !this.activeSlot || !this.targetDayId) return;

    const updated = this.curriculumRepository.moveLessonSlot(
      curriculum,
      this.activeWeekId,
      this.activeDayId,
      this.activeSlotId,
      this.targetWeekId,
      this.targetDayId,
    );

    this.closeSlotActions();
    this.refreshCurriculums(updated.id);
  }

  replaceActiveSlot(): void {
    const curriculum = this.selectedCurriculum;
    const week = curriculum?.weeks.find(
      (item) => item.id === this.activeWeekId,
    );
    const day = week?.days.find((item) => item.id === this.activeDayId);
    const slot = day?.lessonSlots.find(
      (item) => item.id === this.activeSlotId,
    );

    if (!week || !day || !slot) return;

    this.closeSlotActions();
    this.openLessonPicker(week, day, 'replace', slot);
  }

  removeActiveSlot(): void {
    const curriculum = this.selectedCurriculum;
    if (!curriculum || !this.activeSlot) return;

    const confirmed = window.confirm(
      'إزالة الدرس من المنهج؟ الدرس الأصلي سيظل داخل Lesson Library.',
    );
    if (!confirmed) return;

    const updated = this.curriculumRepository.removeLessonSlot(
      curriculum,
      this.activeWeekId,
      this.activeDayId,
      this.activeSlotId,
    );

    this.closeSlotActions();
    this.refreshCurriculums(updated.id);
  }

  getLesson(slot: CurriculumLessonSlot): CourseLesson | null {
    return this.lessons.find((lesson) => lesson.id === slot.lessonId) || null;
  }

  lessonsCount(curriculum: TeacherCurriculum): number {
    return this.curriculumRepository.countLessons(curriculum);
  }

  saveCurriculum(): void {
    const curriculum = this.selectedCurriculum;
    if (!curriculum) return;

    const saved = this.curriculumRepository.save({
      ...curriculum,
      status: 'ready',
    });
    this.curriculumSaveMessage =
      'تم حفظ المنهج. الطلاب لن يروا أي تغيير قبل نشره من صفحة المجموعات.';
    this.refreshCurriculums(saved.id);
  }
}
