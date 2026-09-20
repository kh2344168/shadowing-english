import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './api.config';
import {
  AdminStudentDetailDto,
  AuthSessionDto,
  CreateStudentAccountRequest,
  CreateStudentResultDto,
  LearningGroupDto,
  ImportLegacyStudentRequest,
  RoleLoginDto,
  StudentActivityEventDto,
  StudentDirectoryDto,
  StudentEventPageDto,
  StudentLoginDto,
  StudentRecordingDto,
  TrackStudentEventRequest,
  UpsertLearningGroupRequest,
} from './student-tracking-api.models';
import { AppDiagnosticsService } from '../diagnostics/app-diagnostics.service';

@Injectable({ providedIn: 'root' })
export class StudentTrackingApiService {
  private readonly adminUrl = `${API_BASE_URL}/admin/students`;
  private readonly groupsUrl = `${API_BASE_URL}/admin/learning-groups`;
  private readonly trackingUrl = `${API_BASE_URL}/student-tracking`;
  private readonly authUrl = `${API_BASE_URL}/auth/student-login`;

  constructor(
    private http: HttpClient,
    private diagnostics: AppDiagnosticsService,
  ) {}

  async getStudents(): Promise<StudentDirectoryDto[]> {
    return this.run('getStudents', {}, () => firstValueFrom(this.http.get<StudentDirectoryDto[]>(this.adminUrl)));
  }

  async getStudentDetail(studentId: string): Promise<AdminStudentDetailDto> {
    return this.run('getStudentDetail', { studentId }, () =>
      firstValueFrom(this.http.get<AdminStudentDetailDto>(`${this.adminUrl}/${encodeURIComponent(studentId)}`)),
    );
  }

  async getStudentEvents(studentId: string, skip: number, take = 100): Promise<StudentEventPageDto> {
    return this.run('getStudentEvents', { studentId, skip, take }, () =>
      firstValueFrom(this.http.get<StudentEventPageDto>(
        `${this.adminUrl}/${encodeURIComponent(studentId)}/events`,
        { params: { skip, take } },
      )),
    );
  }

  async createStudent(request: CreateStudentAccountRequest): Promise<CreateStudentResultDto> {
    return this.run('createStudent', { email: request.email, groupId: request.groupId }, () =>
      firstValueFrom(this.http.post<CreateStudentResultDto>(this.adminUrl, request)),
    );
  }

  async importLegacyStudent(request: ImportLegacyStudentRequest): Promise<StudentDirectoryDto> {
    return this.run('importLegacyStudent', { studentId: request.id, email: request.email, groupId: request.groupId }, () =>
      firstValueFrom(this.http.put<StudentDirectoryDto>(
        `${this.adminUrl}/${encodeURIComponent(request.id)}/import-legacy`,
        request,
      )),
    );
  }

  async moveStudent(studentId: string, group: LearningGroupDto): Promise<StudentDirectoryDto> {
    return this.run('moveStudent', { studentId, groupId: group.id }, () =>
      firstValueFrom(this.http.put<StudentDirectoryDto>(`${this.adminUrl}/${encodeURIComponent(studentId)}/group`, {
        groupId: group.id,
        groupName: group.name,
        cefrLevel: group.cefrLevel,
      })),
    );
  }

  async updateStudent(
    studentId: string,
    values: Pick<StudentDirectoryDto, 'accountStatus' | 'subscriptionStatus' | 'cefrLevel'>,
  ): Promise<StudentDirectoryDto> {
    return this.run('updateStudent', { studentId, ...values }, () =>
      firstValueFrom(this.http.patch<StudentDirectoryDto>(`${this.adminUrl}/${encodeURIComponent(studentId)}`, values)),
    );
  }

  async resetPassword(studentId: string): Promise<string> {
    const result = await this.run('resetPassword', { studentId }, () =>
      firstValueFrom(this.http.post<{ temporaryPassword: string }>(
        `${this.adminUrl}/${encodeURIComponent(studentId)}/reset-password`,
        {},
      )),
    );
    return result.temporaryPassword;
  }

  async getGroups(): Promise<LearningGroupDto[]> {
    return this.run('getGroups', {}, () => firstValueFrom(this.http.get<LearningGroupDto[]>(this.groupsUrl)));
  }

  async upsertGroup(request: UpsertLearningGroupRequest): Promise<LearningGroupDto> {
    return this.run('upsertGroup', { groupId: request.id, groupName: request.name }, () =>
      firstValueFrom(this.http.put<LearningGroupDto>(`${this.groupsUrl}/${encodeURIComponent(request.id)}`, request)),
    );
  }

  async deleteGroup(groupId: string): Promise<void> {
    await this.run('deleteGroup', { groupId }, async () => {
      await firstValueFrom(this.http.delete<void>(`${this.groupsUrl}/${encodeURIComponent(groupId)}`));
    });
  }

  async getSession(): Promise<AuthSessionDto> {
    return this.run('getSession', {}, () =>
      firstValueFrom(this.http.get<AuthSessionDto>(`${API_BASE_URL}/auth/session`)),
    );
  }

  async loginStudent(email: string, password: string): Promise<StudentLoginDto> {
    return this.run('loginStudent', { email }, () =>
      firstValueFrom(this.http.post<StudentLoginDto>(this.authUrl, { email, password })),
    );
  }

  async loginDemo(email: string, password: string): Promise<RoleLoginDto> {
    return this.run('loginDemo', { email }, () =>
      firstValueFrom(this.http.post<RoleLoginDto>(`${API_BASE_URL}/auth/demo-login`, { email, password })),
    );
  }

  async logout(): Promise<void> {
    await this.run('logout', {}, async () => {
      await firstValueFrom(this.http.post<void>(`${API_BASE_URL}/auth/logout`, {}));
    });
  }

  async trackEvent(request: TrackStudentEventRequest): Promise<StudentActivityEventDto | null> {
    try {
      return await this.run('trackEvent', {
        studentId: request.studentId,
        eventType: request.eventType,
        lessonId: request.lessonId,
        stageId: request.stageId,
        correlationId: request.correlationId,
      }, () => firstValueFrom(this.http.post<StudentActivityEventDto>(`${this.trackingUrl}/events`, request, {
        headers: this.correlationHeaders(request.correlationId),
      })));
    } catch (error) {
      this.diagnostics.error('StudentTrackingApi', 'trackEvent:non-blocking-failure', error, {
        studentId: request.studentId,
        eventType: request.eventType,
      });
      return null;
    }
  }

  async uploadRecording(
    meta: {
      studentId: string;
      groupId: string;
      lessonId: string;
      lessonTitle: string;
      curriculumSlotId: string;
      stageId: string;
      recordingType: string;
      clientRecordingId: string;
      attemptNumber: number;
      durationMs: number;
    },
    blob: Blob,
  ): Promise<StudentRecordingDto | null> {
    const form = new FormData();
    Object.entries(meta).forEach(([key, value]) => form.append(key, String(value ?? '')));
    form.append('file', blob, `${meta.clientRecordingId}.${blob.type.includes('mp4') ? 'm4a' : 'webm'}`);
    try {
      return await this.run('uploadRecording', {
        studentId: meta.studentId,
        lessonId: meta.lessonId,
        stageId: meta.stageId,
        sizeBytes: blob.size,
        contentType: blob.type,
      }, () => firstValueFrom(this.http.post<StudentRecordingDto>(`${this.trackingUrl}/recordings`, form)));
    } catch (error) {
      this.diagnostics.error('StudentTrackingApi', 'uploadRecording:non-blocking-failure', error, {
        studentId: meta.studentId,
        clientRecordingId: meta.clientRecordingId,
      });
      return null;
    }
  }

  async deleteRecordingByClientId(studentId: string, clientRecordingId: string): Promise<boolean> {
    try {
      return await this.run('deleteRecordingByClientId', { studentId, clientRecordingId }, async () => {
        await firstValueFrom(this.http.delete<void>(
          `${this.trackingUrl}/recordings/by-client/${encodeURIComponent(clientRecordingId)}`,
          { params: { studentId } },
        ));
        return true;
      });
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 404) {
        this.diagnostics.warn('StudentTrackingApi', 'deleteRecordingByClientId:not-found', {
          studentId,
          clientRecordingId,
        });
        return false;
      }
      throw error;
    }
  }

  recordingContentUrl(recordingId: string): string {
    return `${this.trackingUrl}/recordings/${encodeURIComponent(recordingId)}/content`;
  }

  private correlationHeaders(correlationId?: string | null): HttpHeaders | undefined {
    return correlationId ? new HttpHeaders({ 'X-Correlation-ID': correlationId }) : undefined;
  }

  private async run<T>(
    operation: string,
    context: Record<string, unknown>,
    action: () => Promise<T>,
  ): Promise<T> {
    const elapsed = this.diagnostics.start('StudentTrackingApi', operation, context);
    try {
      const value = await action();
      this.diagnostics.success('StudentTrackingApi', operation, elapsed(), context);
      return value;
    } catch (error) {
      this.diagnostics.error('StudentTrackingApi', `${operation}:error`, error, {
        ...context,
        durationMs: elapsed(),
      });
      throw error;
    }
  }
}
