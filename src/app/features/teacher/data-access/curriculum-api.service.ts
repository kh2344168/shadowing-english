import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../../../core/api/api.config';
import { AppDiagnosticsService } from '../../../core/diagnostics/app-diagnostics.service';
import { CurriculumWeek, TeacherCurriculum } from './curriculum.models';

interface CurriculumDto {
  id: string;
  name: string;
  description: string;
  status: TeacherCurriculum['status'];
  weeksJson: string;
  createdAtUtc: string;
  updatedAtUtc: string;
}

@Injectable({ providedIn: 'root' })
export class CurriculumApiService {
  private readonly baseUrl = `${API_BASE_URL}/admin/curriculums`;

  constructor(
    private http: HttpClient,
    private diagnostics: AppDiagnosticsService,
  ) {}

  async getAll(): Promise<TeacherCurriculum[]> {
    return this.run('getAll', {}, async () => {
      const rows = await firstValueFrom(this.http.get<CurriculumDto[]>(this.baseUrl));
      return rows.map((row) => this.fromDto(row));
    });
  }

  async upsert(curriculum: TeacherCurriculum): Promise<TeacherCurriculum> {
    return this.run('upsert', { curriculumId: curriculum.id, status: curriculum.status }, async () => {
      const row = await firstValueFrom(this.http.put<CurriculumDto>(
        `${this.baseUrl}/${encodeURIComponent(curriculum.id)}`,
        {
          id: curriculum.id,
          name: curriculum.name,
          description: curriculum.description,
          status: curriculum.status,
          weeksJson: JSON.stringify(curriculum.weeks || []),
          createdAtUtc: curriculum.createdAt,
        },
      ));
      return this.fromDto(row);
    });
  }

  async delete(curriculumId: string): Promise<void> {
    await this.run('delete', { curriculumId }, async () => {
      await firstValueFrom(this.http.delete<void>(`${this.baseUrl}/${encodeURIComponent(curriculumId)}`));
    });
  }

  private fromDto(row: CurriculumDto): TeacherCurriculum {
    let weeks: CurriculumWeek[] = [];
    try {
      const parsed = JSON.parse(row.weeksJson || '[]');
      weeks = Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      this.diagnostics.error('CurriculumApi', 'weeks-json-parse:error', error, {
        curriculumId: row.id,
      });
    }
    return {
      id: row.id,
      name: row.name,
      description: row.description || '',
      status: row.status || 'draft',
      weeks,
      createdAt: row.createdAtUtc,
      updatedAt: row.updatedAtUtc,
    };
  }

  private async run<T>(
    operation: string,
    context: Record<string, unknown>,
    action: () => Promise<T>,
  ): Promise<T> {
    const elapsed = this.diagnostics.start('CurriculumApi', operation, context);
    try {
      const value = await action();
      this.diagnostics.success('CurriculumApi', operation, elapsed(), context);
      return value;
    } catch (error) {
      this.diagnostics.error('CurriculumApi', `${operation}:error`, error, {
        ...context,
        durationMs: elapsed(),
      });
      throw error;
    }
  }
}
