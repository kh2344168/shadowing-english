import { Injectable } from '@angular/core';
import { AuthService } from '../../../core/auth/services/auth.service';
import { StudentCourseView } from './student-learning.models';
import { StudentKnowledgeBank } from './student-knowledge.models';
import { StudentKnowledgeBankService } from './student-knowledge-bank.service';
import { StudentLearningRepository } from './student-learning.repository';

export interface StudentLessonReportRow {
  lessonId: string;
  title: string;
  weekName: string;
  progressPercent: number;
  completedStages: number;
  totalStages: number;
  completed: boolean;
  recordingCount: number;
  quizScore?: number;
  updatedAt?: string;
}

export interface StudentReportView {
  studentName: string;
  studentEmail: string;
  courseName: string;
  groupName: string;
  generatedAt: string;
  progressPercent: number;
  completedLessons: number;
  totalLessons: number;
  recordingCount: number;
  scheduledReviews: number;
  dueReviews: number;
  quizCount: number;
  averageQuizScore: number | null;
  conversationSessions: number;
  conversationTurns: number;
  conversationGoodAnswers: number;
  conversationCorrections: number;
  lastActivityAt?: string;
  knowledge: StudentKnowledgeBank;
  lessons: StudentLessonReportRow[];
}

@Injectable({ providedIn: 'root' })
export class StudentReportService {
  constructor(
    private auth: AuthService,
    private learningRepository: StudentLearningRepository,
    private knowledgeBank: StudentKnowledgeBankService,
  ) {}

  buildReport(course: StudentCourseView): StudentReportView {
    const studentId = this.auth.currentUser?.studentId || '';
    const groupId = course.lessons[0]?.groupId || '';
    const journeys = this.learningRepository.getJourneys(studentId, groupId);
    const journeyBySlot = new Map(journeys.map((item) => [item.curriculumSlotId, item]));
    const reviews = groupId ? this.learningRepository.getReviews(studentId, groupId) : [];
    const conversations = this.learningRepository.getConversationSummaries(studentId, groupId);
    const quizScores = journeys
      .map((journey) => journey.quizScore)
      .filter((score): score is number => typeof score === 'number' && Number.isFinite(score));
    const now = Date.now();
    const lastActivityAt = [
      ...journeys.map((item) => item.updatedAt),
      ...conversations.map((item) => item.completedAt),
    ]
      .filter(Boolean)
      .sort()
      .at(-1);

    return {
      studentName: this.auth.currentUser?.name || 'الطالب',
      studentEmail: this.auth.currentUser?.email || '',
      courseName: course.courseName,
      groupName: course.groupName,
      generatedAt: new Date().toISOString(),
      progressPercent: course.progressPercent,
      completedLessons: course.completedLessons,
      totalLessons: course.totalLessons,
      recordingCount: course.lessons.reduce(
        (sum, lesson) =>
          sum +
          Math.max(
            lesson.progress?.recordingCount || 0,
            lesson.progress?.recordingIds.length || 0,
          ),
        0,
      ),
      scheduledReviews: reviews.filter((review) => review.status === 'scheduled').length,
      dueReviews: reviews.filter(
        (review) =>
          review.status === 'scheduled' && new Date(review.dueAt).getTime() <= now,
      ).length,
      quizCount: quizScores.length,
      averageQuizScore: quizScores.length
        ? Math.round(quizScores.reduce((sum, score) => sum + score, 0) / quizScores.length)
        : null,
      conversationSessions: conversations.length,
      conversationTurns: conversations.reduce((sum, item) => sum + item.acceptedTurns, 0),
      conversationGoodAnswers: conversations.reduce((sum, item) => sum + item.goodAnswers, 0),
      conversationCorrections: conversations.reduce(
        (sum, item) => sum + item.correctionCount,
        0,
      ),
      lastActivityAt,
      knowledge: this.knowledgeBank.buildBank(course),
      lessons: course.lessons
        .filter((lesson) => lesson.completedStageCount > 0 || lesson.isCompleted)
        .map((lesson) => {
          const journey = journeyBySlot.get(lesson.curriculumSlotId);
          return {
            lessonId: lesson.lesson.id,
            title: lesson.lesson.title,
            weekName: lesson.weekName,
            progressPercent: lesson.progressPercent,
            completedStages: lesson.completedStageCount,
            totalStages: lesson.stages.length,
            completed: lesson.isCompleted,
            recordingCount: Math.max(
              lesson.progress?.recordingCount || 0,
              lesson.progress?.recordingIds.length || 0,
            ),
            quizScore: journey?.quizScore,
            updatedAt: journey?.updatedAt || lesson.progress?.updatedAt,
          };
        }),
    };
  }

  async downloadPdf(report: StudentReportView): Promise<void> {
    const rows = this.buildPrintableRows(report);
    const pageWidth = 1240;
    const pageHeight = 1754;
    const margin = 76;
    const contentWidth = pageWidth - margin * 2;
    const pageImages: Uint8Array[] = [];
    let pageNumber = 0;
    let canvas = document.createElement('canvas');
    let ctx = canvas.getContext('2d');
    if (!ctx) return;
    let y = 0;

    const newPage = (): void => {
      if (pageNumber > 0) pageImages.push(this.canvasToJpegBytes(canvas));
      pageNumber += 1;
      canvas = document.createElement('canvas');
      canvas.width = pageWidth;
      canvas.height = pageHeight;
      ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, pageWidth, pageHeight);
      ctx.direction = 'rtl';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#00685f';
      ctx.font = '700 20px Arial, Tahoma, sans-serif';
      ctx.fillText(`Shadowing English • ${report.studentName}`, pageWidth - margin, 34);
      ctx.fillStyle = '#6b7775';
      ctx.font = '400 16px Arial, Tahoma, sans-serif';
      ctx.fillText(`صفحة ${pageNumber}`, margin + 80, 36);
      y = 82;
    };

    const ensureSpace = (needed: number): void => {
      if (y + needed <= pageHeight - margin) return;
      newPage();
    };

    const drawWrapped = (
      text: string,
      font: string,
      fill: string,
      lineHeight: number,
      before = 0,
      after = 0,
    ): void => {
      if (!ctx) return;
      const lines = this.wrapCanvasText(ctx, text, contentWidth, font);
      ensureSpace(before + lines.length * lineHeight + after);
      const target = ctx;
      if (!target) return;
      y += before;
      target.font = font;
      target.fillStyle = fill;
      target.direction = 'rtl';
      target.textAlign = 'right';
      for (const line of lines) {
        target.fillText(line, pageWidth - margin, y);
        y += lineHeight;
      }
      y += after;
    };

    newPage();
    for (const row of rows) {
      if (!ctx) break;
      if (row.type === 'title') {
        drawWrapped(row.text, '700 38px Arial, Tahoma, sans-serif', '#0b1c30', 52, 12, 18);
      } else if (row.type === 'section') {
        ensureSpace(58);
        y += 16;
        ctx.fillStyle = '#e8f4f2';
        ctx.fillRect(margin, y - 4, contentWidth, 44);
        drawWrapped(row.text, '700 23px Arial, Tahoma, sans-serif', '#00685f', 34, 6, 10);
      } else if (row.type === 'muted') {
        drawWrapped(row.text, '400 16px Arial, Tahoma, sans-serif', '#65716f', 25, 2, 4);
      } else {
        drawWrapped(row.text, '400 18px Arial, Tahoma, sans-serif', '#1c2927', 29, 2, 4);
      }
    }
    pageImages.push(this.canvasToJpegBytes(canvas));

    const pdf = this.buildPdfFromJpegs(pageImages, pageWidth, pageHeight);
    const safeName = report.studentName.replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-+|-+$/g, '');
    this.downloadBlob(pdf, `shadowing-student-report-${safeName || 'student'}.pdf`);
  }

  private buildPrintableRows(
    report: StudentReportView,
  ): Array<{ type: 'title' | 'section' | 'text' | 'muted'; text: string }> {
    const rows: Array<{ type: 'title' | 'section' | 'text' | 'muted'; text: string }> = [];
    rows.push({ type: 'title', text: 'تقرير الطالب الشامل' });
    rows.push({ type: 'text', text: `الطالب: ${report.studentName}` });
    if (report.studentEmail) rows.push({ type: 'muted', text: `البريد: ${report.studentEmail}` });
    rows.push({ type: 'text', text: `المجموعة: ${report.groupName || '—'} • المنهج: ${report.courseName}` });
    rows.push({ type: 'muted', text: `تاريخ إنشاء التقرير: ${this.formatDate(report.generatedAt)}` });

    rows.push({ type: 'section', text: 'ملخص التقدم' });
    rows.push({
      type: 'text',
      text: `التقدم العام: ${report.progressPercent}% • الدروس المكتملة: ${report.completedLessons}/${report.totalLessons}`,
    });
    rows.push({
      type: 'text',
      text: `التسجيلات: ${report.recordingCount} • المراجعات المجدولة: ${report.scheduledReviews} • المستحقة الآن: ${report.dueReviews}`,
    });
    rows.push({
      type: 'text',
      text: `الاختبارات المسجلة: ${report.quizCount} • متوسط النتيجة: ${report.averageQuizScore === null ? 'لا توجد نتيجة محفوظة' : `${report.averageQuizScore}%`}`,
    });
    rows.push({
      type: 'text',
      text: `جلسات المحادثة المحفوظة: ${report.conversationSessions} • الأدوار المقبولة: ${report.conversationTurns} • إجابات جيدة: ${report.conversationGoodAnswers} • تصحيحات مهمة: ${report.conversationCorrections}`,
    });
    if (report.lastActivityAt) {
      rows.push({ type: 'muted', text: `آخر نشاط محفوظ: ${this.formatDate(report.lastActivityAt)}` });
    }

    rows.push({ type: 'section', text: 'الدروس التي بدأها الطالب' });
    if (!report.lessons.length) {
      rows.push({ type: 'muted', text: 'لا يوجد تقدم دراسي محفوظ حتى الآن.' });
    }
    report.lessons.forEach((lesson, index) => {
      rows.push({
        type: 'text',
        text: `${index + 1}. ${lesson.title} — ${lesson.weekName} — ${lesson.progressPercent}% — مراحل ${lesson.completedStages}/${lesson.totalStages}${lesson.quizScore === undefined ? '' : ` — اختبار ${lesson.quizScore}%`} — تسجيلات ${lesson.recordingCount}`,
      });
    });

    rows.push({ type: 'section', text: `بنك الكلمات (${report.knowledge.words.length})` });
    if (!report.knowledge.words.length) rows.push({ type: 'muted', text: 'لا توجد كلمات مضافة للبنك بعد.' });
    report.knowledge.words.forEach((item, index) => {
      rows.push({
        type: 'text',
        text: `${index + 1}. ${item.text}${item.translation ? ` — ${item.translation}` : ''}${item.explanation ? ` — ${item.explanation}` : ''} [ظهر في ${item.sources.length} درس]`,
      });
    });

    rows.push({ type: 'section', text: `بنك العبارات والـChunks (${report.knowledge.chunks.length})` });
    if (!report.knowledge.chunks.length) rows.push({ type: 'muted', text: 'لا توجد عبارات مضافة للبنك بعد.' });
    report.knowledge.chunks.forEach((item, index) => {
      rows.push({
        type: 'text',
        text: `${index + 1}. ${item.text}${item.translation ? ` — ${item.translation}` : ''}${item.example ? ` — Example: ${item.example}` : ''} [ظهر في ${item.sources.length} درس]`,
      });
    });

    rows.push({ type: 'section', text: `الجمل التي تدرب عليها الطالب (${report.knowledge.sentences.length})` });
    if (!report.knowledge.sentences.length) rows.push({ type: 'muted', text: 'لا توجد جمل مضافة للبنك بعد.' });
    report.knowledge.sentences.forEach((item, index) => {
      rows.push({
        type: 'text',
        text: `${index + 1}. ${item.text}${item.translation ? ` — ${item.translation}` : ''} [${item.sources.map((source) => source.lessonTitle).join('، ')}]`,
      });
    });

    rows.push({ type: 'section', text: 'ملاحظة للذكاء الاصطناعي' });
    rows.push({
      type: 'text',
      text: 'العناصر الموجودة في هذا التقرير تعني أن الطالب تعرّض لها في مراحل تدريب مكتملة، ولا تعني إتقانها 100%. استخدمها كمرجع للغة المألوفة، صحح الأخطاء المهمة بوضوح، وقدّم لغة جديدة تدريجيًا بما يناسب مستوى الطالب.',
    });
    return rows;
  }

  private wrapCanvasText(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
    font: string,
  ): string[] {
    ctx.font = font;
    const words = String(text || '').split(/\s+/).filter(Boolean);
    if (!words.length) return [''];
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  private canvasToJpegBytes(canvas: HTMLCanvasElement): Uint8Array {
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    const binary = atob(dataUrl.split(',')[1] || '');
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  private buildPdfFromJpegs(
    images: Uint8Array[],
    imageWidth: number,
    imageHeight: number,
  ): Blob {
    const encoder = new TextEncoder();
    const chunks: Uint8Array[] = [];
    const offsets: number[] = [];
    let byteLength = 0;
    const append = (value: string | Uint8Array): void => {
      const bytes = typeof value === 'string' ? encoder.encode(value) : value;
      chunks.push(bytes);
      byteLength += bytes.byteLength;
    };
    const startObject = (id: number): void => {
      offsets[id] = byteLength;
      append(`${id} 0 obj\n`);
    };

    append('%PDF-1.4\n');
    startObject(1);
    append('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

    const pageIds = images.map((_, index) => 3 + index * 3);
    startObject(2);
    append(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>\nendobj\n`);

    images.forEach((imageBytes, index) => {
      const pageId = 3 + index * 3;
      const imageId = pageId + 1;
      const contentId = pageId + 2;
      startObject(pageId);
      append(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`,
      );

      startObject(imageId);
      append(
        `<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.byteLength} >>\nstream\n`,
      );
      append(imageBytes);
      append('\nendstream\nendobj\n');

      const content = 'q\n595.28 0 0 841.89 0 0 cm\n/Im0 Do\nQ\n';
      startObject(contentId);
      append(`<< /Length ${encoder.encode(content).byteLength} >>\nstream\n${content}endstream\nendobj\n`);
    });

    const xrefOffset = byteLength;
    const objectCount = 2 + images.length * 3;
    append(`xref\n0 ${objectCount + 1}\n`);
    append('0000000000 65535 f \n');
    for (let id = 1; id <= objectCount; id += 1) {
      append(`${String(offsets[id] || 0).padStart(10, '0')} 00000 n \n`);
    }
    append(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
    return new Blob(chunks as unknown as BlobPart[], { type: 'application/pdf' });
  }

  private downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private formatDate(value: string): string {
    try {
      return new Intl.DateTimeFormat('ar-EG', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value));
    } catch {
      return value;
    }
  }
}
