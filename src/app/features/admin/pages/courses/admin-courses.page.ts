import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { PageHeader } from '../../../../shared/components/page-header/page-header';
import { LessonRepository } from '../../../lessons/data-access/lesson.repository';
import { CourseLesson } from '../../../lessons/data-access/lesson.models';

@Component({
  selector: 'app-admin-courses-page',
  standalone: true,
  imports: [CommonModule, PageHeader],
  templateUrl: './admin-courses.page.html',
  styleUrl: './admin-courses.page.scss',
})
export class AdminCoursesPage implements OnInit {
  lessons: CourseLesson[] = [];

  constructor(private lessonRepository: LessonRepository) {}

  ngOnInit(): void {
    this.lessons = this.lessonRepository.getAll();
  }
}
