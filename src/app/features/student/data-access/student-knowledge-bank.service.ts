import { Injectable } from '@angular/core';
import { StudentLessonContentService } from './student-lesson-content.service';
import { StudentCourseView, StudentLessonView } from './student-learning.models';
import {
  StudentAiKnowledgeSnapshot,
  StudentKnowledgeBank,
  StudentKnowledgeItem,
  StudentKnowledgeKind,
  StudentKnowledgeSource,
} from './student-knowledge.models';

@Injectable({ providedIn: 'root' })
export class StudentKnowledgeBankService {
  constructor(private lessonContent: StudentLessonContentService) {}

  buildBank(course: StudentCourseView, excludeLessonId = ''): StudentKnowledgeBank {
    const items = new Map<string, StudentKnowledgeItem>();
    let studiedLessonCount = 0;

    for (const lessonView of course.lessons) {
      if (excludeLessonId && lessonView.lesson.id === excludeLessonId) continue;
      const hasVocabulary = this.hasCompletedActivity(lessonView, 'vocabulary');
      const hasShadowing =
        this.hasCompletedActivity(lessonView, 'shadowing') ||
        this.hasCompletedActivity(lessonView, 'shadowing-review');

      if (!hasVocabulary && !hasShadowing && !lessonView.isCompleted) continue;
      studiedLessonCount += 1;

      const source: StudentKnowledgeSource = {
        lessonId: lessonView.lesson.id,
        lessonTitle: lessonView.lesson.title,
        weekName: lessonView.weekName,
        curriculumSlotId: lessonView.curriculumSlotId,
      };

      if (hasVocabulary || lessonView.isCompleted) {
        for (const card of this.lessonContent.getVocabulary(lessonView.lesson)) {
          this.addItem(items, {
            kind: card.kind,
            text: card.term,
            translation: card.translation,
            explanation: card.explanation,
            example: card.example,
            extraExample: card.extraExample,
            usageNote: card.usageNote,
            source,
          });
        }
      }

      if (hasShadowing || lessonView.isCompleted) {
        for (const segment of lessonView.lesson.segments) {
          const text = segment.text.trim();
          if (!text) continue;
          this.addItem(items, {
            kind: 'sentence',
            text,
            translation: segment.translation || '',
            example: text,
            source,
          });
        }
      }
    }

    const all = [...items.values()].sort((left, right) => {
      if (left.kind !== right.kind) {
        return this.kindOrder(left.kind) - this.kindOrder(right.kind);
      }
      return left.text.localeCompare(right.text, 'en', { sensitivity: 'base' });
    });

    return {
      words: all.filter((item) => item.kind === 'word'),
      chunks: all.filter((item) => item.kind === 'chunk'),
      sentences: all.filter((item) => item.kind === 'sentence'),
      all,
      studiedLessonCount,
      generatedAt: new Date().toISOString(),
    };
  }

  buildAiSnapshot(course: StudentCourseView, excludeLessonId = ''): StudentAiKnowledgeSnapshot {
    const bank = this.buildBank(course, excludeLessonId);
    return {
      knownWords: bank.words.slice(0, 80).map((item) => item.text),
      knownChunks: bank.chunks.slice(0, 80).map((item) => item.text),
      practicedSentences: bank.sentences.slice(-40).map((item) => item.text),
      studiedLessonCount: bank.studiedLessonCount,
      note:
        'These items were exposed in completed learning stages. Treat them as familiar material, not guaranteed mastery.',
    };
  }

  buildAiContextText(course: StudentCourseView, studentName: string): string {
    const bank = this.buildBank(course);
    const lines = [
      `Student English learning context: ${studentName}`,
      `Course: ${course.courseName}`,
      `Course progress: ${course.progressPercent}% (${course.completedLessons}/${course.totalLessons} lessons complete)`,
      `Studied lessons contributing to this bank: ${bank.studiedLessonCount}`,
      '',
      `KNOWN WORDS (${bank.words.length})`,
      ...bank.words.map((item) => `- ${item.text}${item.translation ? ` = ${item.translation}` : ''}`),
      '',
      `KNOWN CHUNKS / PHRASES (${bank.chunks.length})`,
      ...bank.chunks.map((item) => `- ${item.text}${item.translation ? ` = ${item.translation}` : ''}`),
      '',
      `PRACTICED SENTENCES (${bank.sentences.length})`,
      ...bank.sentences.map((item) => `- ${item.text}${item.translation ? ` = ${item.translation}` : ''}`),
      '',
      'Instruction for the AI:',
      'Use this as evidence of prior exposure, not perfect mastery. Prefer familiar language when possible, correct important mistakes clearly, and introduce new language gradually at the learner\'s current level.',
    ];
    return lines.join('\n');
  }

  private hasCompletedActivity(
    lessonView: StudentLessonView,
    activityType: 'vocabulary' | 'shadowing' | 'shadowing-review',
  ): boolean {
    return lessonView.stages.some(
      (stage) => stage.activityType === activityType && stage.status === 'completed',
    );
  }

  private addItem(
    items: Map<string, StudentKnowledgeItem>,
    value: {
      kind: StudentKnowledgeKind;
      text: string;
      translation?: string;
      explanation?: string;
      example?: string;
      extraExample?: string;
      usageNote?: string;
      source: StudentKnowledgeSource;
    },
  ): void {
    const text = value.text.trim();
    if (!text) return;
    const key = `${value.kind}:${this.normalize(text)}`;
    const existing = items.get(key);
    if (!existing) {
      items.set(key, {
        key,
        kind: value.kind,
        text,
        translation: value.translation?.trim() || '',
        explanation: value.explanation?.trim() || '',
        example: value.example?.trim() || '',
        extraExample: value.extraExample?.trim() || '',
        usageNote: value.usageNote?.trim() || '',
        appearances: 1,
        sources: [value.source],
      });
      return;
    }

    const sameSource = existing.sources.some(
      (source) => source.curriculumSlotId === value.source.curriculumSlotId,
    );
    if (!sameSource) {
      existing.sources = [...existing.sources, value.source];
      existing.appearances += 1;
    }
    existing.translation ||= value.translation?.trim() || '';
    existing.explanation ||= value.explanation?.trim() || '';
    existing.example ||= value.example?.trim() || '';
    existing.extraExample ||= value.extraExample?.trim() || '';
    existing.usageNote ||= value.usageNote?.trim() || '';
  }

  private normalize(value: string): string {
    return value
      .toLowerCase()
      .replace(/[“”"'’`.,!?;:()[\]{}]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private kindOrder(kind: StudentKnowledgeKind): number {
    return kind === 'word' ? 0 : kind === 'chunk' ? 1 : 2;
  }
}
