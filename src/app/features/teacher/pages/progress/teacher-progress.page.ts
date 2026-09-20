import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../../core/auth/services/auth.service';
import { PageHeader } from '../../../../shared/components/page-header/page-header';
import { ProgressBar } from '../../../../shared/components/progress-bar/progress-bar';
import { LessonRepository } from '../../../lessons/data-access/lesson.repository';
import { CourseLesson } from '../../../lessons/data-access/lesson.models';
import { StudentRepository } from '../../data-access/student.repository';
import { StudentAccount, StudentProgress } from '../../data-access/student.models';
import { TeacherGroupRepository } from '../../data-access/teacher-group.repository';

@Component({
  selector: 'app-teacher-progress-page',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeader, ProgressBar],
  templateUrl: './teacher-progress.page.html',
  styleUrl: './teacher-progress.page.scss',
})
export class TeacherProgressPage implements OnInit {
  lessons: CourseLesson[] = [];
  students: StudentAccount[] = [];
  selectedLessonId = '';

  constructor(
    private lessonRepository: LessonRepository,
    public studentRepository: StudentRepository,
    private groupRepository: TeacherGroupRepository,
    private auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.lessons = this.lessonRepository.getAll();
    const teacherId = this.auth.currentUser?.id || '';
    const groupIds = new Set(
      this.groupRepository
        .getGroups()
        .filter((group) => !group.teacherId || group.teacherId === teacherId)
        .map((group) => group.id),
    );
    this.students = this.studentRepository
      .getStudents()
      .filter((student) => groupIds.has(student.groupId));
    this.selectedLessonId = this.lessons[0]?.id || '';
  }

  get selectedLesson(): CourseLesson | null {
    return this.lessons.find((lesson) => lesson.id === this.selectedLessonId) || null;
  }

  getProgress(studentId: string): StudentProgress | null {
    if (!this.selectedLessonId) return null;
    return this.studentRepository.getProgress(studentId, this.selectedLessonId);
  }

  getRecordingsCount(progress: StudentProgress | null): number {
    return progress?.recordingIds.length || 0;
  }

  getMessage(student: StudentAccount): string {
    const progress = this.getProgress(student.id);
    const percent = this.studentRepository.getCompletionPercent(progress);

    if (percent === 100) return `${student.name} أكمل الدرس.`;
    if (percent >= 70) return `${student.name} اقترب من الإكمال؛ متبقٍ له عدد قليل من التكرارات.`;
    if (percent > 0) return `${student.name} بدأ الدرس وما زال يكمل المطلوب.`;
    return `${student.name} لم يبدأ هذا الدرس بعد.`;
  }
}
