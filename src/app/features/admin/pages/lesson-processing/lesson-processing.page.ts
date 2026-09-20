import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  CourseLesson,
  LessonVocabularyItem,
} from '../../../lessons/data-access/lesson.models';
import { LessonAiApiService } from '../../../lessons/data-access/lesson-ai-api.service';
import { LessonAiStatusResponse } from '../../../lessons/data-access/lesson-ai.models';
import { LessonRepository } from '../../../lessons/data-access/lesson.repository';
import {
  LessonAiProgress,
  LessonContentAiService,
} from '../../../lessons/services/lesson-content-ai.service';

interface ProcessingStep {
  percent: number;
  title: string;
}

@Component({
  selector: 'app-admin-lesson-processing-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './lesson-processing.page.html',
  styleUrl: './lesson-processing.page.scss',
})
export class AdminLessonProcessingPage implements OnInit {
  lesson: CourseLesson | null = null;
  readonly progress = signal<LessonAiProgress>({
    percent: 0,
    title: 'نجهز المعالجة',
    detail: 'سنبدأ بعد تحميل بيانات الدرس.',
  });
  readonly processing = signal(false);
  readonly ready = signal(false);
  readonly loading = signal(true);
  readonly savingResult = signal(false);
  readonly savedToBackend = signal(false);
  private pendingDraft: CourseLesson | null = null;
  error = '';
  imageWarning = '';
  generatedImageCount = 0;
  usedAi = false;
  aiStatus: LessonAiStatusResponse | null = null;

  readonly steps: ProcessingStep[] = [
    { percent: 8, title: 'فحص الملفات والجمل' },
    { percent: 24, title: 'الشادوينج الأساسي' },
    { percent: 43, title: 'الكلمات والصور' },
    { percent: 61, title: 'اسمع واكتب' },
    { percent: 77, title: 'اختبار الدرس' },
    { percent: 91, title: 'محادثة الذكاء الاصطناعي' },
  ];

  constructor(
    private route: ActivatedRoute,
    private lessonRepository: LessonRepository,
    private lessonContentAi: LessonContentAiService,
    private lessonAiApi: LessonAiApiService,
    private cdr: ChangeDetectorRef,
  ) {}


  get vocabularyCount(): number {
    return this.pendingDraft?.vocabulary?.filter((item) => item.includeForStudent !== false).length || this.lesson?.vocabulary?.filter((item) => item.includeForStudent !== false).length || 0;
  }

  get activityCount(): number {
    return this.pendingDraft?.activities?.filter((item) => item.enabled !== false).length || this.lesson?.activities?.filter((item) => item.enabled !== false).length || 0;
  }

  get hasConversation(): boolean {
    const activities = this.pendingDraft?.activities || this.lesson?.activities || [];
    return activities.some((item) => item.type === 'ai-conversation' && item.enabled !== false);
  }

  get contentBasePath(): '/admin' | '/teacher' {
    return this.route.snapshot.data['contentBasePath'] === '/teacher'
      ? '/teacher'
      : '/admin';
  }

  async ngOnInit(): Promise<void> {
    await this.lessonRepository.initializeFromDatabase();
    const lessonId = this.route.snapshot.paramMap.get('lessonId') || '';
    this.lesson = this.lessonRepository.getById(lessonId);
    this.loading.set(false);

    if (!this.lesson) {
      this.cdr.detectChanges();
      return;
    }

    const regenerate = this.route.snapshot.queryParamMap.get('regenerate') === '1';
    const hasGeneratedDraft = this.lesson.activities?.some(
      (activity) => activity.aiGenerated,
    );
    if (hasGeneratedDraft && !regenerate) {
      this.progress.set({
        percent: 100,
        title: 'الدرس جاهز للمراجعة',
        detail: 'المراحل محفوظة ومعتمدة افتراضيًا. افتح أي مرحلة فقط إذا أردت تعديلها أو جعلها غير معتمدة.',
      });
      this.ready.set(true);
      this.savedToBackend.set(true);
      this.pendingDraft = this.lesson;
      this.cdr.detectChanges();
      return;
    }

    await this.processLesson();
  }

  isStepComplete(step: ProcessingStep): boolean {
    return this.progress().percent >= step.percent;
  }

  async retry(): Promise<void> {
    await this.processLesson();
  }

  private async processLesson(): Promise<void> {
    if (!this.lesson || this.processing()) return;
    this.processing.set(true);
    this.ready.set(false);
    this.error = '';
    this.imageWarning = '';
    this.generatedImageCount = 0;
    this.usedAi = false;
    this.savedToBackend.set(false);
    this.pendingDraft = null;

    try {
      this.progress.set({
        percent: 4,
        title: 'فحص جاهزية المعالجة',
        detail: 'نتأكد أن خدمات إنشاء المحتوى والصور جاهزة قبل بدء تجهيز أنشطة الدرس.',
      });
      this.aiStatus = await this.lessonAiApi.getStatus(true);
      if (this.aiStatus.content.state !== 'available') {
        throw new Error(this.aiStatus.content.message);
      }
      if (this.aiStatus.conversation.state !== 'available') {
        throw new Error(this.aiStatus.conversation.message);
      }

      this.progress.set({
        percent: 6,
        title: 'فهم نوع الدرس وموضوعه',
        detail: 'نحلل الجمل لاستخراج الكلمات والـChunks والاختبار وسيناريو المحادثة.',
      });
      const processedContent = await this.lessonAiApi.generateLessonDraft({
        lessonId: this.lesson.id,
        lessonTitle: this.lesson.title,
        contentProfile: this.lesson.contentProfile,
        segments: this.lesson.segments.map((segment) => ({
          text: segment.text,
          translation: segment.translation || '',
        })),
      });
      this.usedAi = Boolean(processedContent.provider);
      let generated = await this.lessonContentAi.generateReviewDraft(
        this.lesson,
        (progress) => {
          this.progress.set(progress);
          this.cdr.detectChanges();
        },
        processedContent,
      );

      if (this.aiStatus.images.state === 'available') {
        this.generatedImageCount = await this.generateVocabularyImages(generated);
      } else {
        this.imageWarning =
          `${this.aiStatus.images.message} تم حفظ الكلمات بدون صور، ولن نضع صورًا تجريبية مكانها.`;
      }

      generated = {
        ...generated,
        status: 'ready',
        activities: (generated.activities || []).map((activity) => ({
          ...activity,
          reviewStatus: 'approved',
        })),
        vocabulary: (generated.vocabulary || []).map((item) => ({
          ...item,
          imageApproved: Boolean(
            item.imageUrl?.trim() && item.imageProvider !== 'placeholder',
          ),
        })),
        updatedAt: new Date().toISOString(),
      };
      this.lesson = generated;
      this.pendingDraft = generated;
      this.progress.set({
        percent: 100,
        title: 'اكتملت معالجة المحتوى',
        detail: this.generatedImageCount
          ? `تم تجهيز المحتوى و${this.generatedImageCount} صورة. اضغط «تمت المعالجة» لحفظ النتيجة.`
          : 'تم تجهيز المحتوى. اضغط «تمت المعالجة» لحفظ النتيجة.',
      });
      this.ready.set(true);
    } catch (error) {
      console.error('[Lesson AI] Could not prepare the review draft.', error);
      this.error = error instanceof Error
        ? error.message
        : this.lessonAiApi.getUserMessage(error);
    } finally {
      this.processing.set(false);
      this.cdr.detectChanges();
    }
  }

  async completeProcessing(): Promise<void> {
    if (!this.pendingDraft || this.savingResult()) return;
    this.savingResult.set(true);
    this.error = '';
    try {
      const saved = await this.lessonRepository.saveLessonToDatabaseStrict({
        ...this.pendingDraft,
        updatedAt: new Date().toISOString(),
      });
      this.lesson = saved;
      this.pendingDraft = saved;
      this.savedToBackend.set(true);
      this.progress.set({
        percent: 100,
        title: 'تم حفظ نتيجة المعالجة',
        detail: 'تم حفظ الدرس كنسخة معتمدة تلقائيًا. يمكنك فتح المراجعة، وأي مرحلة لا تعجبك يمكنك جعلها غير معتمدة يدويًا.',
      });
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        const backendMessage =
          typeof error.error === 'string'
            ? error.error
            : error.error?.message || error.error?.title || '';
        this.error = backendMessage
          ? `تعذر حفظ النتيجة في الـBackend (HTTP ${error.status}): ${backendMessage}`
          : error.status === 0
            ? 'تعذر الوصول إلى الـBackend على localhost:5017. شغّل scripts\\run-api.cmd ثم أعد الحفظ.'
            : `تعذر حفظ النتيجة في الـBackend (HTTP ${error.status}). راجع نافذة run-api.cmd.`;
      } else {
        this.error = error instanceof Error
          ? error.message
          : 'اكتملت المعالجة في الـFrontend لكن تعذر حفظ النتيجة في الـBackend.';
      }
    } finally {
      this.savingResult.set(false);
      this.cdr.detectChanges();
    }
  }

  private async generateVocabularyImages(lesson: CourseLesson): Promise<number> {
    const items = (lesson.vocabulary || []).filter(
      (item) => item.includeForStudent !== false && item.term.trim(),
    );
    if (!items.length) return 0;

    const failed: string[] = [];
    let generatedCount = 0;
    let completedCount = 0;
    let nextIndex = 0;

    // Image requests run entirely in the browser, up to three at a time.
    // Nothing is persisted to the Backend until the admin presses "تمت المعالجة".
    const worker = async (): Promise<void> => {
      while (true) {
        const index = nextIndex++;
        if (index >= items.length) return;
        const item = items[index];

        try {
          const result = await this.lessonAiApi.generateImage({
            lessonId: lesson.id,
            term: item.term,
            kind: item.kind === 'chunk' ? 'chunk' : 'word',
            prompt:
              item.imagePrompt?.trim() ||
              `A realistic educational scene that communicates “${item.term}” without written text.`,
            alt: item.imageAlt?.trim() || `Context image for ${item.term}`,
          });
          item.imageUrl = result.imageUrl;
          item.imageProvider = 'curated';
          item.imageApproved = true;
          generatedCount += 1;
        } catch (error) {
          failed.push(`${item.term}: ${this.lessonAiApi.getUserMessage(error)}`);
          this.clearPlaceholderImage(item);
        } finally {
          completedCount += 1;
          this.progress.set({
            percent:
              92 +
              Math.round(
                (completedCount / Math.max(items.length, 1)) * 7,
              ),
            title: `تجهيز صور الكلمات ${completedCount}/${items.length}`,
            detail: 'تتم معالجة حتى 3 صور بالتوازي داخل الـFrontend. الصور الناجحة تعتبر معتمدة افتراضيًا ويمكنك رفضها لاحقًا من المراجعة.',
          });
          this.cdr.detectChanges();
        }
      }
    };

    const workerCount = Math.min(3, items.length);
    await Promise.all(
      Array.from({ length: workerCount }, () => worker()),
    );

    if (failed.length) {
      this.imageWarning =
        `تم توليد ${generatedCount} من ${items.length} صور. تعذر: ${failed.join(' | ')}`;
    }
    return generatedCount;
  }

  private clearPlaceholderImage(item: LessonVocabularyItem): void {
    if (item.imageProvider !== 'placeholder') return;
    item.imageUrl = '';
    item.imageApproved = false;
    item.imageProvider = undefined;
  }
}
