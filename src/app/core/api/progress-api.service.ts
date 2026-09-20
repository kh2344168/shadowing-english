import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api.config';
import {
  SaveStudentLearningStateRequest,
  SaveStudentProgressRequest,
  StudentLearningStateDto,
  StudentProgressDto,
  SyncStudentCourseRequest,
  TeacherGroupProgressSummaryDto,
} from './progress-api.models';

@Injectable({ providedIn: 'root' })
export class ProgressApiService {
  private readonly url = `${API_BASE_URL}/progress`;

  constructor(private http: HttpClient) {}

  syncStudentCourse(request: SyncStudentCourseRequest): Observable<StudentProgressDto[]> {
    return this.http.post<StudentProgressDto[]>(`${this.url}/course`, request);
  }

  saveStudentProgress(request: SaveStudentProgressRequest): Observable<StudentProgressDto> {
    return this.http.post<StudentProgressDto>(`${this.url}/repetitions`, request);
  }

  getStudentProgress(studentId: string): Observable<StudentProgressDto[]> {
    return this.http.get<StudentProgressDto[]>(`${this.url}/student/${encodeURIComponent(studentId)}`);
  }

  getStudentLearningState(
    studentId: string,
    groupId: string,
  ): Observable<StudentLearningStateDto> {
    return this.http.get<StudentLearningStateDto>(
      `${this.url}/learning-state/${encodeURIComponent(studentId)}/${encodeURIComponent(groupId)}`,
    );
  }

  saveStudentLearningState(
    request: SaveStudentLearningStateRequest,
  ): Observable<StudentLearningStateDto> {
    return this.http.put<StudentLearningStateDto>(`${this.url}/learning-state`, request);
  }

  getTeacherSummary(): Observable<TeacherGroupProgressSummaryDto[]> {
    return this.http.get<TeacherGroupProgressSummaryDto[]>(`${this.url}/teacher`);
  }
}
