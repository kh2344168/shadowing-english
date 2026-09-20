import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../../../core/api/api.config';
import { CourseLesson } from './lesson.models';

@Injectable({ providedIn: 'root' })
export class LessonApiService {
  private readonly lessonsUrl = `${API_BASE_URL}/lessons`;

  constructor(private http: HttpClient) {}

  getAll(): Observable<CourseLesson[]> {
    return this.http.get<CourseLesson[]>(this.lessonsUrl);
  }

  getById(id: string): Observable<CourseLesson> {
    return this.http.get<CourseLesson>(
      `${this.lessonsUrl}/${encodeURIComponent(id)}`,
    );
  }

  save(lesson: CourseLesson, mediaBlob?: Blob): Observable<CourseLesson> {
    const form = new FormData();
    form.append('lessonJson', JSON.stringify(lesson));

    if (mediaBlob) {
      form.append(
        'media',
        mediaBlob,
        lesson.mediaFileName || 'lesson-media',
      );
    }

    return this.http.put<CourseLesson>(
      `${this.lessonsUrl}/${encodeURIComponent(lesson.id)}`,
      form,
    );
  }

  getMedia(id: string): Observable<Blob> {
    return this.http.get(
      `${this.lessonsUrl}/${encodeURIComponent(id)}/media`,
      { responseType: 'blob' },
    );
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(
      `${this.lessonsUrl}/${encodeURIComponent(id)}`,
    );
  }
}
