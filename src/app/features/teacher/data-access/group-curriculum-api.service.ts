import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { API_BASE_URL } from '../../../core/api/api.config';
import { GroupCurriculumSnapshot } from './group-curriculum.models';

export interface GroupPublicationVerification {
  groupId: string;
  isValid: boolean;
  version: number;
  slotCount: number;
  distinctLessonCount: number;
  missingLessonIds: string[];
  unavailableLessonIds: string[];
  checkedAtUtc: string;
}

@Injectable({ providedIn: 'root' })
export class GroupCurriculumApiService {
  private readonly url = `${API_BASE_URL}/group-curriculums`;

  constructor(private http: HttpClient) {}

  getPublished(groupId: string): Observable<GroupCurriculumSnapshot> {
    const url = `${this.url}/${encodeURIComponent(groupId)}/published`;
    console.log('[PUBLISH][HTTP][GET] →', url, { groupId });
    return this.http.get<GroupCurriculumSnapshot>(url).pipe(
      tap((snapshot) => console.log('[PUBLISH][HTTP][GET] ← 200', url, {
        version: snapshot.version,
        slots: this.countSlots(snapshot),
        snapshot,
      })),
      catchError((error) => {
        console.error('[PUBLISH][HTTP][GET] ✖', url, this.describeHttpError(error));
        return throwError(() => error);
      }),
    );
  }

  verify(groupId: string): Observable<GroupPublicationVerification> {
    const url = `${this.url}/${encodeURIComponent(groupId)}/verify`;
    console.log('[PUBLISH][HTTP][VERIFY] →', url, { groupId });
    return this.http.get<GroupPublicationVerification>(url).pipe(
      tap((result) => console.log('[PUBLISH][HTTP][VERIFY] ← 200', url, result)),
      catchError((error) => {
        console.error('[PUBLISH][HTTP][VERIFY] ✖', url, this.describeHttpError(error));
        return throwError(() => error);
      }),
    );
  }

  publish(
    groupId: string,
    groupName: string,
    snapshot: GroupCurriculumSnapshot,
  ): Observable<GroupCurriculumSnapshot> {
    const url = `${this.url}/${encodeURIComponent(groupId)}/published`;
    const body = { groupName, snapshot };
    console.log('[PUBLISH][HTTP][PUT] →', url, {
      groupId,
      groupName,
      requestedVersion: snapshot.version,
      slots: this.countSlots(snapshot),
      body,
    });

    return this.http.put<GroupCurriculumSnapshot>(url, body).pipe(
      tap((saved) => console.log('[PUBLISH][HTTP][PUT] ← 200', url, {
        version: saved.version,
        slots: this.countSlots(saved),
        saved,
      })),
      catchError((error) => {
        console.error('[PUBLISH][HTTP][PUT] ✖', url, this.describeHttpError(error));
        return throwError(() => error);
      }),
    );
  }

  private countSlots(snapshot: GroupCurriculumSnapshot): number {
    return (snapshot.weeks || []).reduce(
      (weekTotal, week) => weekTotal + (week.days || []).reduce(
        (dayTotal, day) => dayTotal + (day.lessonSlots || []).length,
        0,
      ),
      0,
    );
  }

  private describeHttpError(error: any): unknown {
    const backendMessage = typeof error?.error === 'string'
      ? error.error
      : error?.error?.message || error?.error?.detail || '';
    return {
      status: error?.status,
      statusText: error?.statusText,
      message: error?.message,
      backendMessage,
      url: error?.url,
      error: error?.error,
    };
  }
}

