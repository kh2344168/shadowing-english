import { Injectable } from '@angular/core';
import { LessonRepository } from '../../lessons/data-access/lesson.repository';
import { StudentRepository } from '../../teacher/data-access/student.repository';
import { AdminStat } from './admin.models';

@Injectable({ providedIn: 'root' })
export class AdminRepository {
  constructor(
    private lessonRepository: LessonRepository,
    private studentRepository: StudentRepository,
  ) {}

  getStats(): AdminStat[] {
    const lessons = this.lessonRepository.getAll();
    const students = this.studentRepository.getStudents();
    const progressRows = lessons.flatMap((lesson) => this.studentRepository.getProgressForLesson(lesson.id));
    const completed = progressRows.filter((row) => row.completedRepetitions >= row.requiredRepetitions).length;

    return [
      { label: 'Teachers', value: 1, hint: 'MVP has one demo teacher.' },
      { label: 'Students', value: students.length, hint: 'Students added by teacher/admin.' },
      { label: 'Lessons', value: lessons.length, hint: 'Saved lessons in the platform.' },
      { label: 'Completed homework rows', value: completed, hint: 'Completed lesson-student rows.' },
    ];
  }
}
