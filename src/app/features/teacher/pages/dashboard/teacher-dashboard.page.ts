import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { AuthService } from '../../../../core/auth/services/auth.service';
import {
  faArrowLeft,
  faBookOpen,
  faCircleCheck,
  faClock,
  faUserGroup,
  faUsers,
} from '@fortawesome/free-solid-svg-icons';
import {
  TeacherGroupProgressSummaryDto,
  TeacherStudentProgressSummaryDto,
} from '../../../../core/api/progress-api.models';
import { ProgressApiService } from '../../../../core/api/progress-api.service';
import { CourseLesson } from '../../../lessons/data-access/lesson.models';
import { LessonRepository } from '../../../lessons/data-access/lesson.repository';
import { CurriculumLessonSlot } from '../../data-access/curriculum.models';
import { StudentAccount } from '../../data-access/student.models';
import { StudentRepository } from '../../data-access/student.repository';
import { TeacherGroup } from '../../data-access/teacher-group.models';
import { TeacherGroupRepository } from '../../data-access/teacher-group.repository';

type StudentProgressStatus = 'completed' | 'in-progress' | 'not-started';

interface GroupSlotView {
  weekName: string;
  dayName: string;
  slot: CurriculumLessonSlot;
  lesson: CourseLesson;
}

interface TeacherStudentProgressView {
  student: StudentAccount;
  completedLessonTitles: string[];
  currentLessonTitle: string;
  currentPositionLabel: string;
  completedLessonsCount: number;
  totalLessonsCount: number;
  progressPercent: number;
  status: StudentProgressStatus;
  statusText: string;
}

interface TeacherGroupProgressView {
  group: TeacherGroup;
  students: TeacherStudentProgressView[];
  studentsCount: number;
  completedStudentsCount: number;
  inProgressStudentsCount: number;
  currentLessonTitle: string;
  currentPositionLabel: string;
  progressPercent: number;
}

@Component({
  selector: 'app-teacher-dashboard-page',
  standalone: true,
  imports: [CommonModule, FontAwesomeModule],
  templateUrl: './teacher-dashboard.page.html',
  styleUrl: './teacher-dashboard.page.scss',
})
export class TeacherDashboardPage implements OnInit {
  readonly icons = {
    groups: faUserGroup,
    students: faUsers,
    completed: faCircleCheck,
    lesson: faBookOpen,
    clock: faClock,
    arrow: faArrowLeft,
  };

  lessons: CourseLesson[] = [];
  groupViews: TeacherGroupProgressView[] = [];
  selectedGroupId = '';

  constructor(
    private lessonRepository: LessonRepository,
    private studentRepository: StudentRepository,
    private groupRepository: TeacherGroupRepository,
    private progressApi: ProgressApiService,
    private auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.lessons = this.lessonRepository.getAll();
    this.studentRepository.getStudents();

    const teacherId = this.auth.currentUser?.id || '';
    this.groupViews = this.groupRepository
      .getGroups()
      .filter((group) => !group.teacherId || group.teacherId === teacherId)
      .map((group) => this.createGroupView(group));

    this.selectedGroupId = this.groupViews[0]?.group.id || '';
    this.loadRemoteProgress();
  }

  get selectedGroup(): TeacherGroupProgressView | null {
    return (
      this.groupViews.find((item) => item.group.id === this.selectedGroupId) ||
      null
    );
  }

  openGroup(groupId: string): void {
    this.selectedGroupId = groupId;

    window.setTimeout(() => {
      document
        .getElementById('group-progress-details')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  private createGroupView(group: TeacherGroup): TeacherGroupProgressView {
    const students = this.groupRepository.getStudentsForGroup(group.id);
    const slots = this.getPublishedSlots(group);
    const currentSlot = this.findCurrentGroupSlot(students, slots);
    const studentViews = students.map((student) =>
      this.createStudentProgressView(student, slots),
    );

    const completedStudentsCount = currentSlot
      ? students.filter((student) =>
          this.isSlotCompleted(student.id, currentSlot.slot),
        ).length
      : students.length;

    return {
      group,
      students: studentViews,
      studentsCount: students.length,
      completedStudentsCount,
      inProgressStudentsCount: Math.max(
        0,
        students.length - completedStudentsCount,
      ),
      currentLessonTitle: currentSlot?.lesson.title || 'أكملت المجموعة المنهج',
      currentPositionLabel: currentSlot
        ? `${currentSlot.weekName} · ${currentSlot.dayName}`
        : 'تم إكمال كل المطلوب',
      progressPercent:
        studentViews.length === 0
          ? 0
          : Math.round(
              studentViews.reduce((total, item) => total + item.progressPercent, 0) /
                studentViews.length,
            ),
    };
  }

  private createStudentProgressView(
    student: StudentAccount,
    slots: GroupSlotView[],
  ): TeacherStudentProgressView {
    const requiredSlots = slots.filter((item) => item.slot.required);
    const completedSlots = requiredSlots.filter((item) =>
      this.isSlotCompleted(student.id, item.slot),
    );
    const currentSlot = requiredSlots.find(
      (item) => !this.isSlotCompleted(student.id, item.slot),
    );
    const progressRows = this.studentRepository
      .getProgressForStudent(student.id)
      .filter((row) => !row.groupId || row.groupId === student.groupId);
    const hasAnyProgress = progressRows.some(
      (row) => row.completedRepetitions > 0,
    );
    const allCompleted =
      requiredSlots.length > 0 && completedSlots.length === requiredSlots.length;

    let status: StudentProgressStatus = 'not-started';
    let statusText = 'لم يبدأ';

    if (allCompleted) {
      status = 'completed';
      statusText = 'أكمل المطلوب';
    } else if (hasAnyProgress) {
      status = 'in-progress';
      statusText = 'قيد التقدم';
    }

    return {
      student,
      completedLessonTitles: Array.from(
        new Set(completedSlots.map((item) => item.lesson.title)),
      ),
      currentLessonTitle: currentSlot?.lesson.title || 'أكمل جميع الدروس',
      currentPositionLabel: currentSlot
        ? `${currentSlot.weekName} · ${currentSlot.dayName}`
        : 'تم إكمال كل المطلوب',
      completedLessonsCount: completedSlots.length,
      totalLessonsCount: requiredSlots.length,
      progressPercent:
        requiredSlots.length === 0
          ? 0
          : Math.round((completedSlots.length / requiredSlots.length) * 100),
      status,
      statusText,
    };
  }

  private findCurrentGroupSlot(
    students: StudentAccount[],
    slots: GroupSlotView[],
  ): GroupSlotView | null {
    const requiredSlots = slots.filter((item) => item.slot.required);
    if (requiredSlots.length === 0) return null;
    if (students.length === 0) return requiredSlots[0];

    return (
      requiredSlots.find(
        (item) =>
          !students.every((student) =>
            this.isSlotCompleted(student.id, item.slot),
          ),
      ) || null
    );
  }

  private getPublishedSlots(group: TeacherGroup): GroupSlotView[] {
    const views: GroupSlotView[] = [];

    for (const week of [...group.publishedCurriculum.weeks].sort(
      (a, b) => a.order - b.order,
    )) {
      for (const day of [...week.days].sort((a, b) => a.order - b.order)) {
        for (const slot of [...day.lessonSlots].sort(
          (a, b) => a.order - b.order,
        )) {
          const lesson = this.lessons.find((item) => item.id === slot.lessonId);
          if (!lesson) continue;

          views.push({
            weekName: week.name,
            dayName: day.name,
            slot,
            lesson,
          });
        }
      }
    }

    return views;
  }

  private isSlotCompleted(
    studentId: string,
    slot: CurriculumLessonSlot,
  ): boolean {
    const groupId = this.studentRepository.findById(studentId)?.groupId || '';
    const progress = this.studentRepository.getProgress(
      studentId,
      slot.lessonId,
      slot.id,
      groupId,
    );

    return (
      !!progress && progress.completedRepetitions >= slot.repetitionCount
    );
  }

  private loadRemoteProgress(): void {
    this.progressApi.getTeacherSummary().subscribe({
      next: (groups) => this.applyRemoteProgress(groups),
      error: (error) => {
        console.warn('[Progress API] Teacher dashboard is showing its local fallback.', error);
      },
    });
  }

  private applyRemoteProgress(groups: TeacherGroupProgressSummaryDto[]): void {
    this.groupViews = this.groupViews.map((groupView) => {
      const remoteGroup =
        groups.find((item) => item.groupId === groupView.group.id) ||
        groups.find((item) => item.groupName === groupView.group.name);

      if (!remoteGroup) return groupView;

      const students = groupView.students.map((studentView) => {
        const remoteStudent = remoteGroup.students.find(
          (item) => item.studentId === studentView.student.id,
        );

        return remoteStudent
          ? this.applyRemoteStudentProgress(studentView, remoteStudent)
          : studentView;
      });

      return {
        ...groupView,
        students,
        studentsCount: Math.max(groupView.studentsCount, remoteGroup.studentsCount),
        completedStudentsCount: remoteGroup.completedStudentsCount,
        inProgressStudentsCount: remoteGroup.inProgressStudentsCount,
        progressPercent: remoteGroup.progressPercent,
      };
    });
  }

  private applyRemoteStudentProgress(
    current: TeacherStudentProgressView,
    remote: TeacherStudentProgressSummaryDto,
  ): TeacherStudentProgressView {
    const currentLesson = remote.lessons.find((lesson) => lesson.status !== 'Completed');
    const status: StudentProgressStatus =
      remote.status === 'Completed'
        ? 'completed'
        : remote.status === 'InProgress'
          ? 'in-progress'
          : 'not-started';

    return {
      ...current,
      completedLessonTitles: remote.lessons
        .filter((lesson) => lesson.status === 'Completed')
        .map((lesson) => lesson.lessonTitle),
      currentLessonTitle: currentLesson?.lessonTitle || 'أكمل جميع الدروس',
      currentPositionLabel: `${remote.progressPercent}% من إجمالي التكرارات`,
      completedLessonsCount: remote.completedLessons,
      totalLessonsCount: remote.totalLessons,
      progressPercent: remote.progressPercent,
      status,
      statusText:
        status === 'completed'
          ? 'أكمل المطلوب'
          : status === 'in-progress'
            ? 'قيد التقدم'
            : 'لم يبدأ',
    };
  }
}
