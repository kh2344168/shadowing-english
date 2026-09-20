import { HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { AuthService } from '../../../../core/auth/services/auth.service';
import {
  faBookOpen,
  faCopy,
  faCalendarDays,
  faCheck,
  faChevronDown,
  faChevronLeft,
  faEllipsis,
  faFloppyDisk,
  faGraduationCap,
  faMagnifyingGlass,
  faPlus,
  faRightLeft,
  faRotateLeft,
  faTrash,
  faUserGroup,
  faUsers,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { CourseLesson } from '../../../lessons/data-access/lesson.models';
import { LessonRepository } from '../../../lessons/data-access/lesson.repository';
import { CurriculumDay, CurriculumLessonSlot, CurriculumWeek, TeacherCurriculum } from '../../data-access/curriculum.models';
import { CurriculumRepository } from '../../data-access/curriculum.repository';
import { GroupCurriculumRepository } from '../../data-access/group-curriculum.repository';
import { StudentAccount } from '../../data-access/student.models';
import { StudentRepository } from '../../data-access/student.repository';
import { TeacherGroup } from '../../data-access/teacher-group.models';
import { TeacherGroupRepository } from '../../data-access/teacher-group.repository';

type GroupTab = 'overview' | 'curriculum' | 'students';
type CurriculumPickerMode = 'create' | 'change';
type LessonPickerMode = 'add' | 'replace';

@Component({
  selector: 'app-teacher-groups-page',
  standalone: true,
  imports: [CommonModule, FormsModule, FontAwesomeModule],
  templateUrl: './teacher-groups.page.html',
  styleUrl: './teacher-groups.page.scss',
})
export class TeacherGroupsPage implements OnInit {
  readonly icons = {
    groups: faUserGroup,
    students: faUsers,
    curriculum: faBookOpen,
    date: faCalendarDays,
    add: faPlus,
    close: faXmark,
    search: faMagnifyingGlass,
    open: faChevronDown,
    closed: faChevronLeft,
    more: faEllipsis,
    publish: faCheck,
    reset: faRotateLeft,
    save: faFloppyDisk,
    remove: faTrash,
    copy: faCopy,
    move: faRightLeft,
    student: faGraduationCap,
  };

  groups: TeacherGroup[] = [];
  curriculums: TeacherCurriculum[] = [];
  lessons: CourseLesson[] = [];
  selectedGroupId = '';
  activeTab: GroupTab = 'overview';

  createOpen = false;
  newGroupName = '';
  newGroupCurriculumId = '';
  newGroupStartDate = new Date().toISOString().slice(0, 10);

  curriculumPickerOpen = false;
  curriculumPickerMode: CurriculumPickerMode = 'create';
  curriculumSearch = '';

  openedWeekId = '';
  openedDayId = '';

  lessonPickerOpen = false;
  lessonPickerMode: LessonPickerMode = 'add';
  lessonSearch = '';
  pickerWeekId = '';
  pickerDayId = '';
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

  saveAsOpen = false;
  newCurriculumName = '';
  savedCurriculumMessage = '';

  studentFormOpen = false;
  studentName = '';
  studentEmail = '';
  studentMessage = '';
  isPublishing = false;

  constructor(
    private groupRepository: TeacherGroupRepository,
    private groupCurriculumRepository: GroupCurriculumRepository,
    private curriculumRepository: CurriculumRepository,
    private studentRepository: StudentRepository,
    private lessonRepository: LessonRepository,
    private auth: AuthService,
  ) {}

  ngOnInit(): void {
    void this.initializePage();
  }

  private async initializePage(): Promise<void> {
    try {
      await this.groupRepository.initializeFromBackend();
    } finally {
      this.studentRepository.getStudents();
      this.refreshData();
    }
  }

  get selectedGroup(): TeacherGroup | null {
    return this.groups.find((group) => group.id === this.selectedGroupId) || null;
  }

  get selectedGroupStudents(): StudentAccount[] {
    return this.selectedGroup
      ? this.groupRepository.getStudentsForGroup(this.selectedGroup.id)
      : [];
  }

  get filteredCurriculums(): TeacherCurriculum[] {
    const query = this.curriculumSearch.trim().toLowerCase();
    const list = this.curriculums.filter((curriculum) => curriculum.status !== 'archived');
    return query
      ? list.filter((curriculum) => curriculum.name.toLowerCase().includes(query))
      : list;
  }

  get filteredLessons(): CourseLesson[] {
    const query = this.lessonSearch.trim().toLowerCase();
    const list = this.lessons.filter((lesson) => lesson.status !== 'archived');
    return query
      ? list.filter((lesson) => lesson.title.toLowerCase().includes(query))
      : list;
  }

  get selectedLesson(): CourseLesson | null {
    return this.lessons.find((lesson) => lesson.id === this.selectedLessonId) || null;
  }

  get activeSlot(): CurriculumLessonSlot | null {
    const group = this.selectedGroup;
    if (!group) return null;

    return group.draftCurriculum.weeks
      .find((week) => week.id === this.activeWeekId)
      ?.days.find((day) => day.id === this.activeDayId)
      ?.lessonSlots.find((slot) => slot.id === this.activeSlotId) || null;
  }

  get targetDays(): CurriculumDay[] {
    return (
      this.selectedGroup?.draftCurriculum.weeks.find(
        (week) => week.id === this.targetWeekId,
      )?.days || []
    );
  }

  refreshData(selectedId?: string): void {
    this.curriculums = this.curriculumRepository.getAll();
    this.lessons = this.lessonRepository.getAll();
    const teacherId = this.auth.currentUser?.id || '';
    this.groups = this.groupRepository
      .getGroups()
      .filter((group) => !group.teacherId || group.teacherId === teacherId);
    this.selectedGroupId =
      selectedId ||
      (this.groups.some((group) => group.id === this.selectedGroupId)
        ? this.selectedGroupId
        : this.groups[0]?.id || '');

    this.prepareOpenedCurriculum();
  }

  openGroup(groupId: string): void {
    this.selectedGroupId = groupId;
    this.activeTab = 'overview';
    this.prepareOpenedCurriculum();
    window.setTimeout(() => {
      document.getElementById('group-details')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  async createGroup(): Promise<void> {
    const name = this.newGroupName.trim();
    if (!name || !this.newGroupCurriculumId || !this.newGroupStartDate) return;

    const group = await this.groupRepository.createGroup(
      name,
      this.newGroupCurriculumId,
      this.newGroupStartDate,
      this.auth.currentUser?.id || '',
    );

    if (!group) return;

    this.createOpen = false;
    this.newGroupName = '';
    this.newGroupCurriculumId = '';
    this.newGroupStartDate = new Date().toISOString().slice(0, 10);
    this.refreshData(group.id);
  }

  openCurriculumPicker(mode: CurriculumPickerMode): void {
    this.curriculumPickerMode = mode;
    this.curriculumSearch = '';
    this.curriculumPickerOpen = true;
  }

  selectCurriculum(curriculum: TeacherCurriculum): void {
    if (this.curriculumPickerMode === 'create') {
      this.newGroupCurriculumId = curriculum.id;
      this.curriculumPickerOpen = false;
      return;
    }

    const group = this.selectedGroup;
    if (!group || group.curriculumId === curriculum.id) {
      this.curriculumPickerOpen = false;
      return;
    }

    const confirmed = window.confirm(
      `تغيير منهج ${group.name} إلى ${curriculum.name}؟ سيتم إنشاء Group Curriculum جديدة من المنهج المختار.`,
    );
    if (!confirmed) return;

    const updated = this.groupRepository.changeCurriculum(group.id, curriculum.id);
    this.curriculumPickerOpen = false;
    this.refreshData(updated?.id);
  }

  setTab(tab: GroupTab): void {
    this.activeTab = tab;
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
    this.lessonPickerMode = mode;
    this.pickerWeekId = week.id;
    this.pickerDayId = day.id;
    this.lessonSearch = '';
    this.selectedLessonId = '';
    this.placementRepetitions = slot?.repetitionCount || 1;
    this.placementRequired = slot?.required ?? true;
    this.lessonPickerOpen = true;
  }

  selectLesson(lesson: CourseLesson): void {
    this.selectedLessonId = lesson.id;
    this.placementRepetitions = lesson.requiredRepetitions;
  }

  addLessonToGroupDraft(): void {
    const group = this.selectedGroup;
    const lesson = this.selectedLesson;
    if (!group || !lesson) return;

    const updated =
      this.lessonPickerMode === 'replace' && this.activeSlotId
        ? this.groupCurriculumRepository.replaceDraftSlot(
            group.id,
            this.pickerWeekId,
            this.pickerDayId,
            this.activeSlotId,
            lesson.id,
          )
        : this.groupCurriculumRepository.addLessonToDraft(
            group.id,
            this.pickerWeekId,
            this.pickerDayId,
            lesson,
            this.placementRepetitions,
            this.placementRequired,
          );

    this.lessonPickerOpen = false;
    this.refreshData(updated?.id);
    this.activeTab = 'curriculum';
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

  saveDraftSlot(): void {
    const group = this.selectedGroup;
    if (!group || !this.activeSlot) return;

    const updated = this.groupCurriculumRepository.updateDraftSlot(
      group.id,
      this.activeWeekId,
      this.activeDayId,
      this.activeSlotId,
      this.activeRepetitionCount,
      this.activeRequired,
    );

    this.slotActionsOpen = false;
    this.refreshData(updated?.id);
    this.activeTab = 'curriculum';
  }

  removeDraftSlot(): void {
    const group = this.selectedGroup;
    if (!group || !this.activeSlot) return;

    const confirmed = window.confirm('إزالة الدرس من Group Curriculum Draft فقط؟');
    if (!confirmed) return;

    const updated = this.groupCurriculumRepository.removeDraftSlot(
      group.id,
      this.activeWeekId,
      this.activeDayId,
      this.activeSlotId,
    );

    this.slotActionsOpen = false;
    this.refreshData(updated?.id);
    this.activeTab = 'curriculum';
  }

  onTargetWeekChanged(): void {
    this.targetDayId = this.targetDays[0]?.id || '';
  }

  copyDraftSlot(): void {
    const group = this.selectedGroup;
    if (!group || !this.activeSlot || !this.targetDayId) return;

    const updated = this.groupCurriculumRepository.copyDraftSlot(
      group.id,
      this.activeWeekId,
      this.activeDayId,
      this.activeSlotId,
      this.targetWeekId,
      this.targetDayId,
    );
    this.slotActionsOpen = false;
    this.refreshData(updated?.id);
    this.activeTab = 'curriculum';
  }

  moveDraftSlot(): void {
    const group = this.selectedGroup;
    if (!group || !this.activeSlot || !this.targetDayId) return;

    const updated = this.groupCurriculumRepository.moveDraftSlot(
      group.id,
      this.activeWeekId,
      this.activeDayId,
      this.activeSlotId,
      this.targetWeekId,
      this.targetDayId,
    );
    this.slotActionsOpen = false;
    this.refreshData(updated?.id);
    this.activeTab = 'curriculum';
  }

  replaceDraftSlot(): void {
    const group = this.selectedGroup;
    const week = group?.draftCurriculum.weeks.find(
      (item) => item.id === this.activeWeekId,
    );
    const day = week?.days.find((item) => item.id === this.activeDayId);
    const slot = day?.lessonSlots.find(
      (item) => item.id === this.activeSlotId,
    );
    if (!week || !day || !slot) return;

    this.slotActionsOpen = false;
    this.openLessonPicker(week, day, 'replace', slot);
  }

  async publishChanges(): Promise<void> {
    const group = this.selectedGroup;
    console.log('[PUBLISH][TEACHER] Publish Changes clicked', {
      selectedGroupId: group?.id,
      hasDraftChanges: group?.hasDraftChanges,
      group,
    });
    if (!group || !group.hasDraftChanges || this.isPublishing) {
      console.warn('[PUBLISH][TEACHER] Publish aborted: no group or no draft changes.', {
        hasGroup: !!group,
        hasDraftChanges: group?.hasDraftChanges,
      });
      return;
    }

    const confirmed = window.confirm('نشر التعديلات؟ الطلاب سيشاهدون النسخة الجديدة بعد النشر.');
    if (!confirmed) return;

    this.isPublishing = true;
    try {
      console.log('[PUBLISH][TEACHER] Calling repository publish()', { groupId: group.id });
      const updated = await this.groupCurriculumRepository.publish(group.id);
      console.log('[PUBLISH][TEACHER] Repository publish returned', updated);
      this.refreshData(updated?.id);
      this.activeTab = 'curriculum';
    } catch (error) {
      console.error('[Group curriculum API] Publish failed.', error);
      const message = error instanceof HttpErrorResponse
        ? (typeof error.error === 'string'
            ? error.error
            : error.error?.message || error.error?.detail || error.message)
        : error instanceof Error
          ? error.message
          : '';
      alert(`لم يتم نشر التعديلات${message ? `: ${message}` : '. تأكد أن الـ API يعمل ثم حاول مرة أخرى.'}`);
    } finally {
      this.isPublishing = false;
    }
  }

  resetDraft(): void {
    const group = this.selectedGroup;
    if (!group || !group.hasDraftChanges) return;

    const confirmed = window.confirm('إلغاء تعديلات الـ Draft والرجوع لآخر نسخة منشورة؟');
    if (!confirmed) return;

    const updated = this.groupCurriculumRepository.resetDraft(group.id);
    this.refreshData(updated?.id);
    this.activeTab = 'curriculum';
  }

  saveAsNewCurriculum(): void {
    const group = this.selectedGroup;
    const name = this.newCurriculumName.trim();
    if (!group || !name) return;

    const curriculumId = this.groupCurriculumRepository.saveAsNewCurriculum(group.id, name);
    if (!curriculumId) return;

    this.newCurriculumName = '';
    this.saveAsOpen = false;
    this.savedCurriculumMessage = 'تم حفظ نسخة Group Curriculum كمنهج جديد داخل Curriculum Library.';
    this.refreshData(group.id);
    this.activeTab = 'curriculum';
  }

  addStudentToCurrentGroup(): void {
    const group = this.selectedGroup;
    const name = this.studentName.trim();
    const email = this.studentEmail.trim();
    if (!group || !name || !email) return;

    const result = this.studentRepository.addStudent(name, email, group.id);
    if (!result) {
      this.studentMessage = 'تعذر إضافة الطالب. تأكد أن البريد غير مستخدم.';
      return;
    }

    this.studentMessage = `تم إنشاء الطالب. كلمة المرور المؤقتة: ${result.temporaryPassword}`;
    this.studentName = '';
    this.studentEmail = '';
    this.refreshData(group.id);
    this.activeTab = 'students';
  }

  getLesson(slot: CurriculumLessonSlot): CourseLesson | null {
    return this.lessons.find((lesson) => lesson.id === slot.lessonId) || null;
  }

  selectedCurriculumName(): string {
    return this.curriculums.find((curriculum) => curriculum.id === this.newGroupCurriculumId)?.name || 'اختر المنهج';
  }

  private prepareOpenedCurriculum(): void {
    const group = this.selectedGroup;
    this.openedWeekId = group?.draftCurriculum.weeks[0]?.id || '';
    this.openedDayId = group?.draftCurriculum.weeks[0]?.days[0]?.id || '';
  }
}
