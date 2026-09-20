import { Injectable } from '@angular/core';
import {
  CONVERSATION_SCHEMA,
  JsonSchema,
  LESSON_CONTENT_SCHEMA,
} from '../../../core/ai/frontend-ai.schemas';
import {
  buildConversationContext,
  buildConversationInstructions,
  LESSON_PROCESSING_INSTRUCTIONS,
} from '../../../core/ai/frontend-ai.prompts';
import {
  LessonAiStatusResponse,
  LessonContentGenerationRequest,
  LessonContentGenerationResponse,
  LessonConversationTurnRequest,
  LessonConversationTurnResponse,
  LessonImageGenerationRequest,
  LessonImageGenerationResponse,
  LessonTextProvider,
} from './lesson-ai.models';
import {
  LessonConversationConfig,
  LessonQuizQuestion,
  LessonVocabularyItem,
} from './lesson.models';

export class LessonAiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly provider?: string,
  ) {
    super(message);
    this.name = 'LessonAiRequestError';
  }
}

type StructuredResult = {
  data: unknown;
  provider: LessonTextProvider;
};

type StructuredBackendResponse = {
  json?: string;
  provider?: string;
};

@Injectable({ providedIn: 'root' })
export class LessonAiApiService {
  private readonly timeoutMs = 90_000;
  private readonly statusTimeoutMs = 25_000;
  private readonly baseUrl = '/api/lesson-ai';

  async getStatus(verify = false): Promise<LessonAiStatusResponse> {
    return this.requestJson<LessonAiStatusResponse>(
      `${this.baseUrl}/status?verify=${verify ? 'true' : 'false'}`,
      { method: 'GET' },
      'status',
      this.statusTimeoutMs,
    );
  }

  async generateLessonDraft(
    request: LessonContentGenerationRequest,
  ): Promise<LessonContentGenerationResponse> {
    const userContent = JSON.stringify({
      lessonTitle: request.lessonTitle,
      teacherProfile: request.contentProfile,
      sourceSentences: request.segments,
    });

    const result = await this.generateStructuredViaBackend(
      'content',
      LESSON_PROCESSING_INSTRUCTIONS,
      userContent,
      'lesson_content_review_draft',
      LESSON_CONTENT_SCHEMA,
    );

    const payload = result.data as {
      vocabulary: LessonVocabularyItem[];
      quizQuestions: LessonQuizQuestion[];
      conversationConfig: LessonConversationConfig;
    };

    return {
      vocabulary: (payload.vocabulary || [])
        .filter((item) => item?.term?.trim())
        .map((item) => ({
          ...item,
          term: item.term.trim(),
          translation: item.translation?.trim() || '',
          explanation: item.explanation?.trim() || '',
          example: item.example?.trim() || item.term.trim(),
          extraExample: item.extraExample?.trim() || '',
          usageNote: item.usageNote?.trim() || '',
          imagePrompt: item.imagePrompt?.trim() || '',
          imageAlt: item.imageAlt?.trim() || '',
          aiConfidence: this.clamp(Number(item.aiConfidence) || 0.85, 0, 1),
          imageUrl: '',
          imageApproved: false,
          imageProvider: undefined,
          includeForStudent: true,
        })),
      quizQuestions: (payload.quizQuestions || []).map((question, index) => ({
        ...question,
        id: question.id?.trim() || `quiz-ai-${index + 1}`,
        prompt: question.prompt?.trim() || '',
        options: Array.isArray(question.options)
          ? question.options.map((option) => String(option).trim()).filter(Boolean)
          : [],
        correctAnswer: question.correctAnswer?.trim() || '',
        feedback: question.feedback?.trim() || '',
        enabled: question.enabled !== false,
      })),
      conversationConfig: this.normalizeConversationConfig(payload.conversationConfig),
      provider: result.provider,
    };
  }

  async generateImage(
    request: LessonImageGenerationRequest,
  ): Promise<LessonImageGenerationResponse> {
    return this.requestJson<LessonImageGenerationResponse>(
      `${this.baseUrl}/image`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      },
      'images',
      45_000,
    );
  }

  async sendConversationTurn(
    request: LessonConversationTurnRequest,
  ): Promise<LessonConversationTurnResponse> {
    const result = await this.generateStructuredViaBackend(
      'conversation',
      buildConversationInstructions(request),
      buildConversationContext(request),
      'lesson_conversation_turn',
      CONVERSATION_SCHEMA,
    );

    const payload = result.data as any;
    const evaluation =
      payload.evaluation === 'good' || payload.evaluation === 'incorrect'
        ? payload.evaluation
        : 'needs-improvement';

    return {
      assistantMessage: String(payload.assistantMessage || '').trim(),
      feedback: {
        evaluation,
        feedbackArabic: String(payload.feedbackArabic || '').trim(),
        correctedAnswer: String(payload.correctedAnswer || '').trim(),
        betterAnswer: String(payload.betterAnswer || '').trim(),
        usedTargetPhrases: Array.isArray(payload.usedTargetPhrases)
          ? payload.usedTargetPhrases.map(String)
          : [],
        suggestedReplies: Array.isArray(payload.suggestedReplies)
          ? payload.suggestedReplies.map(String).slice(0, 3)
          : [],
        spellingCorrections: Array.isArray(payload.spellingCorrections)
          ? payload.spellingCorrections
              .filter((item: any) => item && item.wrong && item.correct)
              .slice(0, 12)
              .map((item: any) => ({
                wrong: String(item.wrong),
                correct: String(item.correct),
              }))
          : [],
        grammarExplanationArabic: String(payload.grammarExplanationArabic || '').trim(),
        grammarTopics: Array.isArray(payload.grammarTopics)
          ? payload.grammarTopics
              .map(String)
              .map((item: string) => item.trim())
              .filter(Boolean)
              .slice(0, 4)
          : [],
        vocabularyFocus: Array.isArray(payload.vocabularyFocus)
          ? payload.vocabularyFocus
              .map(String)
              .map((item: string) => item.trim())
              .filter(Boolean)
              .slice(0, 6)
          : [],
        strengths: Array.isArray(payload.strengths)
          ? payload.strengths
              .map(String)
              .map((item: string) => item.trim())
              .filter(Boolean)
              .slice(0, 4)
          : [],
        needsRetry: Boolean(payload.needsRetry),
      },
      conversationComplete: Boolean(payload.conversationComplete),
      shouldStartClosing: Boolean(payload.shouldStartClosing),
      provider: result.provider,
    };
  }

  getUserMessage(error: unknown): string {
    if (error instanceof LessonAiRequestError) return error.message;
    if (error instanceof Error && error.message) return error.message;
    return 'حدث خطأ غير متوقع أثناء اتصال التطبيق بخدمة الذكاء الاصطناعي.';
  }

  private async generateStructuredViaBackend(
    capability: 'content' | 'conversation',
    instructions: string,
    userContent: string,
    schemaName: string,
    schema: JsonSchema,
    timeoutMs = this.timeoutMs,
  ): Promise<StructuredResult> {
    const response = await this.requestJson<StructuredBackendResponse>(
      `${this.baseUrl}/structured`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          capability,
          instructions,
          userContent,
          schemaName,
          schema,
        }),
      },
      capability,
      timeoutMs,
    );

    const provider = this.normalizeProvider(response.provider);
    const data = this.parseJsonText(String(response.json || ''), provider);
    this.validateAgainstSchema(data, schema, '$');
    return { data, provider };
  }

  private async requestJson<T>(
    url: string,
    init: RequestInit,
    operation: string,
    timeoutMs: number,
  ): Promise<T> {
    const correlationId = this.correlationId();
    const started = performance.now();
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);

    console.info('[LessonAI][START]', { operation, correlationId });
    try {
      const response = await fetch(url, {
        ...init,
        credentials: 'include',
        signal: controller.signal,
        headers: {
          ...(init.headers || {}),
          'X-Correlation-Id': correlationId,
        },
      });
      const raw = await response.text();
      let json: any = null;
      try {
        json = raw ? JSON.parse(raw) : {};
      } catch {
        json = null;
      }

      console.info('[LessonAI][CHECK]', {
        operation,
        correlationId,
        status: response.status,
        ok: response.ok,
      });

      if (!response.ok) {
        const detail = this.extractBackendError(json, raw);
        throw new LessonAiRequestError(
          detail || `فشل طلب الذكاء الاصطناعي من الـBackend (HTTP ${response.status}).`,
          response.status,
        );
      }
      if (json === null) {
        throw new LessonAiRequestError('الـBackend رجع استجابة ليست JSON صالحًا.', 502);
      }

      console.info('[LessonAI][SUCCESS]', {
        operation,
        correlationId,
        durationMs: Math.round(performance.now() - started),
      });
      return json as T;
    } catch (error) {
      if (error instanceof LessonAiRequestError) {
        console.error('[LessonAI][ERROR]', {
          operation,
          correlationId,
          status: error.status,
          durationMs: Math.round(performance.now() - started),
          message: error.message,
        });
        throw error;
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        const timeoutError = new LessonAiRequestError(
          'انتهت مهلة اتصال الذكاء الاصطناعي بالـBackend. حاول مرة أخرى.',
          504,
        );
        console.error('[LessonAI][ERROR]', {
          operation,
          correlationId,
          status: 504,
          durationMs: Math.round(performance.now() - started),
          message: timeoutError.message,
        });
        throw timeoutError;
      }

      const networkError = new LessonAiRequestError(
        'تعذر الاتصال بخدمة الذكاء الاصطناعي في الـBackend.',
        0,
      );
      console.error('[LessonAI][ERROR]', {
        operation,
        correlationId,
        status: 0,
        durationMs: Math.round(performance.now() - started),
        message: error instanceof Error ? error.message : String(error),
      });
      throw networkError;
    } finally {
      globalThis.clearTimeout(timer);
    }
  }

  private parseJsonText(text: string, provider: string): unknown {
    const cleaned = text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '');
    try {
      return JSON.parse(cleaned);
    } catch (error) {
      throw new LessonAiRequestError(
        `${provider}: رجع JSON غير صالح (${error instanceof Error ? error.message : 'parse error'}).`,
        502,
        provider,
      );
    }
  }

  private validateAgainstSchema(value: unknown, schema: any, path: string): void {
    const type = schema?.type;
    if (type === 'object') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new LessonAiRequestError(`${path} يجب أن يكون object.`, 502);
      }
      const objectValue = value as Record<string, unknown>;
      const required = Array.isArray(schema.required) ? schema.required : [];
      for (const key of required) {
        if (!(key in objectValue)) {
          throw new LessonAiRequestError(`${path} ناقص الحقل المطلوب: ${key}.`, 502);
        }
      }
      if (schema.additionalProperties === false && schema.properties) {
        for (const key of Object.keys(objectValue)) {
          if (!(key in schema.properties)) {
            throw new LessonAiRequestError(`${path}.${key} حقل غير مسموح.`, 502);
          }
        }
      }
      for (const [key, childSchema] of Object.entries(schema.properties || {})) {
        if (key in objectValue) {
          this.validateAgainstSchema(objectValue[key], childSchema, `${path}.${key}`);
        }
      }
      return;
    }

    if (type === 'array') {
      if (!Array.isArray(value)) {
        throw new LessonAiRequestError(`${path} يجب أن يكون array.`, 502);
      }
      if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
        throw new LessonAiRequestError(`${path} يحتوي عناصر أقل من المطلوب.`, 502);
      }
      if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
        throw new LessonAiRequestError(`${path} يحتوي عناصر أكثر من المسموح.`, 502);
      }
      value.forEach((item, index) =>
        this.validateAgainstSchema(item, schema.items || {}, `${path}[${index}]`),
      );
      return;
    }

    if (type === 'string' && typeof value !== 'string') {
      throw new LessonAiRequestError(`${path} يجب أن يكون string.`, 502);
    }
    if (type === 'boolean' && typeof value !== 'boolean') {
      throw new LessonAiRequestError(`${path} يجب أن يكون boolean.`, 502);
    }
    if (type === 'integer' && (typeof value !== 'number' || !Number.isInteger(value))) {
      throw new LessonAiRequestError(`${path} يجب أن يكون integer.`, 502);
    }
    if (type === 'number' && (typeof value !== 'number' || Number.isNaN(value))) {
      throw new LessonAiRequestError(`${path} يجب أن يكون number.`, 502);
    }
    if (Array.isArray(schema?.enum) && !schema.enum.includes(value)) {
      throw new LessonAiRequestError(`${path} يحتوي قيمة غير مسموح بها.`, 502);
    }
    if (typeof value === 'number') {
      if (typeof schema?.minimum === 'number' && value < schema.minimum) {
        throw new LessonAiRequestError(`${path} أقل من الحد الأدنى.`, 502);
      }
      if (typeof schema?.maximum === 'number' && value > schema.maximum) {
        throw new LessonAiRequestError(`${path} أكبر من الحد الأقصى.`, 502);
      }
    }
  }

  private normalizeConversationConfig(config: LessonConversationConfig): LessonConversationConfig {
    return {
      ...config,
      scenario: config?.scenario?.trim() || '',
      aiRole: config?.aiRole?.trim() || '',
      studentRole: config?.studentRole?.trim() || '',
      goals: Array.isArray(config?.goals) ? config.goals.map(String) : [],
      targetPhrases: Array.isArray(config?.targetPhrases)
        ? config.targetPhrases.map(String)
        : [],
      openingMessage: config?.openingMessage?.trim() || '',
      questionCount: this.clamp(Math.round(Number(config?.questionCount) || 10), 1, 20),
      feedbackStyle: config?.feedbackStyle || 'supportive',
      lessonContentOnly: true,
      roleOptions: Array.isArray(config?.roleOptions)
        ? config.roleOptions.map((role) => ({ ...role }))
        : [],
      turnPlan: Array.isArray(config?.turnPlan)
        ? config.turnPlan.map((turn) => ({
            ...turn,
            expectedFunctions: [...(turn.expectedFunctions || [])],
            targetPhrases: [...(turn.targetPhrases || [])],
          }))
        : [],
      correctionMode: 'after-each-turn',
    };
  }

  private normalizeProvider(value: unknown): LessonTextProvider {
    const provider = String(value || '').toLowerCase();
    if (provider === 'groq' || provider === 'gemini' || provider === 'mistral') {
      return provider;
    }
    throw new LessonAiRequestError(`الـBackend رجع مزود غير معروف: ${provider || 'empty'}.`, 502);
  }

  private extractBackendError(json: any, raw: string): string {
    const candidates = [json?.detail, json?.title, json?.message, json?.error?.message];
    const text = candidates.find((value) => typeof value === 'string' && value.trim());
    const fallback = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return String(text || fallback || '').slice(0, 1_200);
  }

  private correlationId(): string {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `lesson-ai-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }
}
