import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/auth/services/auth.service';
import { StudentCourseFacade } from '../../data-access/student-course.facade';
import { StudentKnowledgeBankService } from '../../data-access/student-knowledge-bank.service';
import {
  StudentKnowledgeBank,
  StudentKnowledgeItem,
  StudentKnowledgeKind,
} from '../../data-access/student-knowledge.models';
import { StudentCourseView } from '../../data-access/student-learning.models';

@Component({
  selector: 'app-student-knowledge-bank-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './student-knowledge-bank.page.html',
  styleUrl: './student-knowledge-bank.page.scss',
})
export class StudentKnowledgeBankPage implements OnInit {
  course: StudentCourseView | null = null;
  bank: StudentKnowledgeBank | null = null;
  readonly loading = signal(true);
  search = '';
  kind: 'all' | StudentKnowledgeKind = 'all';
  lessonId = 'all';
  copied = false;
  speakingKey = '';

  constructor(
    private courseFacade: StudentCourseFacade,
    private knowledgeBank: StudentKnowledgeBankService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit(): Promise<void> {
    this.course = await this.courseFacade.initialize();
    this.bank = this.knowledgeBank.buildBank(this.course);
    this.loading.set(false);
    this.cdr.detectChanges();
  }

  get visibleItems(): StudentKnowledgeItem[] {
    if (!this.bank) return [];
    const query = this.search.trim().toLowerCase();
    return this.bank.all.filter((item) => {
      if (this.kind !== 'all' && item.kind !== this.kind) return false;
      if (
        this.lessonId !== 'all' &&
        !item.sources.some((source) => source.lessonId === this.lessonId)
      ) {
        return false;
      }
      if (!query) return true;
      return [item.text, item.translation, item.explanation, item.example]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }

  get lessonOptions(): Array<{ id: string; title: string }> {
    if (!this.bank) return [];
    const map = new Map<string, string>();
    for (const item of this.bank.all) {
      for (const source of item.sources) map.set(source.lessonId, source.lessonTitle);
    }
    return [...map.entries()].map(([id, title]) => ({ id, title }));
  }

  setKind(kind: 'all' | StudentKnowledgeKind): void {
    this.kind = kind;
  }

  async copyAiContext(): Promise<void> {
    if (!this.course) return;
    const text = this.knowledgeBank.buildAiContextText(
      this.course,
      this.auth.currentUser?.name || 'Student',
    );
    try {
      await navigator.clipboard.writeText(text);
      this.copied = true;
      window.setTimeout(() => {
        this.copied = false;
        this.cdr.detectChanges();
      }, 1800);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
      this.copied = true;
    }
  }

  speak(item: StudentKnowledgeItem): void {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(item.text);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    this.speakingKey = item.key;
    utterance.onend = () => {
      this.speakingKey = '';
      this.cdr.detectChanges();
    };
    utterance.onerror = () => {
      this.speakingKey = '';
      this.cdr.detectChanges();
    };
    window.speechSynthesis.speak(utterance);
  }

  labelForKind(kind: StudentKnowledgeKind): string {
    return kind === 'word' ? 'كلمة' : kind === 'chunk' ? 'عبارة / Chunk' : 'جملة';
  }
}
