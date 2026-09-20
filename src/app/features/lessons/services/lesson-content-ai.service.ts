import { Injectable } from '@angular/core';
import {
  CourseLesson,
  LessonActivity,
  LessonConversationConfig,
  LessonQuizQuestion,
  LessonVocabularyItem,
} from '../data-access/lesson.models';
import { LessonContentGenerationResponse } from '../data-access/lesson-ai.models';

interface VocabularyCandidate {
  term: string;
  example: string;
  kind: 'word' | 'chunk';
  priority: number;
}

export interface LessonAiProgress {
  percent: number;
  title: string;
  detail: string;
}

export type LessonAiProgressHandler = (progress: LessonAiProgress) => void;

@Injectable({ providedIn: 'root' })
export class LessonContentAiService {
  async generateReviewDraft(
    lesson: CourseLesson,
    onProgress?: LessonAiProgressHandler,
    generatedContent?: LessonContentGenerationResponse | null,
  ): Promise<CourseLesson> {
    await this.report(onProgress, 8, 'فحص ملفات الدرس', 'نتأكد من الصوت والجمل والتوقيتات.');
    await this.report(onProgress, 24, 'تجهيز الشادوينج', 'ربط كل جملة بترجمتها وتوقيتها الحالي.');

    const vocabulary = generatedContent?.vocabulary?.length
      ? this.prepareGeneratedVocabulary(lesson, generatedContent.vocabulary)
      : this.createVocabularyDraft(lesson);
    await this.report(
      onProgress,
      43,
      'تحليل الكلمات والصور',
      `تم ترشيح ${vocabulary.length} كلمات وتعبيرات لمراجعة الأدمن.`,
    );

    const dictationItems = lesson.segments.map((segment, segmentIndex) => ({
      segmentIndex,
      enabled: true,
      acceptedAnswers: [segment.text.trim()],
      hint: this.createHint(segment.text),
    }));
    await this.report(
      onProgress,
      61,
      'تجهيز اسمع واكتب',
      `تم تجهيز ${dictationItems.length} جمل مع الإجابات المقبولة والتلميحات.`,
    );

    const quizQuestions = generatedContent?.quizQuestions?.length
      ? this.prepareGeneratedQuiz(generatedContent.quizQuestions)
      : this.buildQuiz(lesson, vocabulary);
    await this.report(
      onProgress,
      77,
      'إنشاء اختبار الدرس',
      `تم إنشاء ${quizQuestions.length} أسئلة من محتوى الدرس فقط.`,
    );

    const conversationConfig = generatedContent?.conversationConfig
      ? this.prepareGeneratedConversation(
          lesson,
          vocabulary,
          generatedContent.conversationConfig,
        )
      : this.buildConversation(lesson, vocabulary);
    await this.report(
      onProgress,
      91,
      'تجهيز محادثة الذكاء الاصطناعي',
      'تم تحديد السيناريو والأدوار والجمل المستهدفة.',
    );

    const activities: LessonActivity[] = [
      this.activity('shadowing', 'الشادوينج الأساسي', 0, {
        segmentIndexes: lesson.segments.map((_, index) => index),
      }),
      this.activity('vocabulary', 'الكلمات والصور', 1),
      this.activity('shadowing-review', 'الشادوينج بعد فهم الكلمات', 2, {
        segmentIndexes: lesson.segments.map((_, index) => index),
      }),
      this.activity('listen-write', 'اسمع واكتب ما سمعت', 3, {
        segmentIndexes: lesson.segments.map((_, index) => index),
        dictationItems,
      }),
      this.activity('quiz', 'اختبار الدرس', 4, { quizQuestions }),
      this.activity('ai-conversation', 'محادثة الدرس', 5, {
        instructions: conversationConfig.scenario,
        questionCount: conversationConfig.questionCount,
        conversationConfig,
      }),
    ];

    await this.report(
      onProgress,
      92,
      'المسودة جاهزة للمراجعة',
      generatedContent
        ? 'تم تحليل المحتوى بالذكاء الاصطناعي. نبدأ الآن توليد صور الكلمات الحقيقية.'
        : 'تم تجهيز مسودة احتياطية محلية. ادخل على كل مرحلة وعدّل ما يلزم قبل الاعتماد.',
    );

    return {
      ...lesson,
      status: 'ready',
      vocabulary,
      activities,
      updatedAt: new Date().toISOString(),
    };
  }

  private activity(
    type: LessonActivity['type'],
    title: string,
    order: number,
    extra: Partial<LessonActivity> = {},
  ): LessonActivity {
    return {
      id: type,
      type,
      title,
      order,
      enabled: true,
      reviewStatus: 'approved',
      aiGenerated: true,
      ...extra,
    };
  }

  createVocabularyDraft(lesson: CourseLesson): LessonVocabularyItem[] {
    const previous = new Map(
      (lesson.vocabulary || []).map((item) => [this.normalize(item.term), item]),
    );
    const candidates: VocabularyCandidate[] = [];
    const seen = new Set<string>();
    const stopWords = new Set([
      'about', 'after', 'again', 'also', 'and', 'are', 'because', 'been', 'before',
      'but', 'can', 'could', 'did', 'does', 'for', 'from', 'have', 'hello', 'how',
      'into', 'just', 'like', 'more', 'much', 'that', 'the', 'their', 'there',
      'they', 'this', 'today', 'very', 'was', 'were', 'what', 'when', 'where',
      'which', 'will', 'with', 'would', 'you', 'your',
    ]);
    const usefulPhrases = [
      'access your account',
      'account is currently active',
      'issue with your account balance',
      "verify the account holder's name",
      'updated your account information',
      'requested a supervisor',
      'valued customer',
      'unhappy with the service',
      'service is now restored',
      'service interruption',
      'upgrade your service plan',
      'available 24 hours',
      'do my best to support you',
      'transfer you to advanced support',
      'working on the issue',
      'investigating the issue',
      'issue should be resolved soon',
      'same problem happening',
      'check the problem for you',
      'solve the problem',
      'found a solution',
      'best solution available',
      'thank you for your patience',
      'how may i help you',
      "i'll be happy to help you with that",
      'please let me know',
      'cancellation request',
      'request has been submitted',
      'processing your request',
      'information you provided is correct',
      'update your contact information',
      'personal information is secure',
      'customer service',
      'thank you',
      'how can i help you',
      'i understand your concern',
      'check that for you',
      'anything else',
      'at the moment',
      'right now',
    ];

    for (const segment of lesson.segments) {
      const normalizedSentence = segment.text.toLowerCase();
      for (const phrase of usefulPhrases) {
        if (normalizedSentence.includes(phrase)) {
          this.pushCandidate(candidates, seen, phrase, segment.text, 'chunk', 100);
        }
      }

      const words = segment.text.match(/[A-Za-z][A-Za-z'-]*/g) || [];
      for (const raw of words) {
        const term = this.normalize(raw);
        if (term.length < 4 || stopWords.has(term)) continue;
        const known = this.dictionaryEntry(term).translation;
        this.pushCandidate(
          candidates,
          seen,
          term,
          segment.text,
          'word',
          known ? 80 : 40,
        );
      }
    }

    const words = candidates
      .filter((item) => item.kind === 'word')
      .sort((left, right) => right.priority - left.priority)
      .slice(0, 10);
    const chunks = candidates
      .filter((item) => item.kind === 'chunk')
      .sort((left, right) => right.priority - left.priority)
      .slice(0, 10);

    return [...words, ...chunks].map(({ term, example, kind }, index) => {
      const existing = previous.get(this.normalize(term));
      const dictionary = this.dictionaryEntry(term);
      const lessonType = this.resolveLessonType(lesson);
      const imageDescription = this.visualSceneFor(term, lessonType);
      return {
        id: existing?.id || `vocabulary-${index + 1}-${this.slug(term)}`,
        kind: existing?.kind || kind,
        term: existing?.term || term,
        translation: existing?.translation || dictionary.translation,
        explanation: existing?.explanation || dictionary.explanation,
        example: existing?.example || example,
        extraExample:
          existing?.extraExample ||
          dictionary.extraExample ||
          this.createExtraExample(term, lessonType),
        usageNote:
          existing?.usageNote ||
          (kind === 'chunk'
            ? 'Use this complete phrase as one unit; do not translate it word by word.'
            : 'Use this word inside a complete sentence connected to the lesson topic.'),
        imagePrompt:
          existing?.imagePrompt ||
          `A clear realistic educational scene: ${imageDescription}. The image must communicate “${term}” through the situation, not through written text. No captions, letters, logos, books, flashcards or isolated objects. Square composition.`,
        imageAlt: existing?.imageAlt || imageDescription,
        aiConfidence: dictionary.translation ? 0.94 : 0.72,
        imageUrl:
          existing?.imageUrl ||
          this.createContextIllustration(term, lessonType, imageDescription),
        imageApproved: Boolean(existing?.imageUrl && existing.imageApproved),
        imageProvider: existing?.imageProvider || 'placeholder',
        includeForStudent: existing?.includeForStudent !== false,
        repeatForReview: Boolean(existing?.repeatForReview),
        testLater: Boolean(existing?.testLater),
      };
    });
  }

  private prepareGeneratedVocabulary(
    lesson: CourseLesson,
    items: LessonVocabularyItem[],
  ): LessonVocabularyItem[] {
    const existing = new Map(
      (lesson.vocabulary || []).map((item) => [this.normalize(item.term), item]),
    );
    const lessonType = this.resolveLessonType(lesson);
    const seen = new Set<string>();

    return items
      .filter((item) => item?.term?.trim())
      .filter((item) => {
        const key = this.normalize(item.term);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 24)
      .map((item, index) => {
        const previous = existing.get(this.normalize(item.term));
        const kind = item.kind === 'chunk' || item.term.trim().includes(' ')
          ? 'chunk'
          : 'word';
        const description =
          item.imageAlt?.trim() || this.visualSceneFor(item.term, lessonType);
        return {
          id: previous?.id || item.id || `vocabulary-${index + 1}-${this.slug(item.term)}`,
          kind,
          term: item.term.trim(),
          translation: item.translation?.trim() || previous?.translation || '',
          explanation: item.explanation?.trim() || previous?.explanation || '',
          example: item.example?.trim() || previous?.example || item.term.trim(),
          extraExample:
            item.extraExample?.trim() ||
            previous?.extraExample ||
            this.createExtraExample(item.term, lessonType),
          usageNote:
            item.usageNote?.trim() ||
            previous?.usageNote ||
            (kind === 'chunk'
              ? 'Use this complete phrase as one unit.'
              : 'Use this word in a complete sentence connected to the lesson.'),
          imagePrompt:
            item.imagePrompt?.trim() ||
            previous?.imagePrompt ||
            `A realistic educational scene showing ${description}. No written text.`,
          imageAlt: description,
          imageUrl: previous?.imageUrl || '',
          imageProvider: previous?.imageUrl
            ? previous.imageProvider || 'teacher'
            : undefined,
          imageApproved: Boolean(previous?.imageUrl && previous.imageApproved),
          aiConfidence: Math.min(1, Math.max(0, Number(item.aiConfidence) || 0.85)),
          includeForStudent: item.includeForStudent !== false,
          repeatForReview: Boolean(item.repeatForReview),
          testLater: Boolean(item.testLater),
        };
      });
  }

  private prepareGeneratedQuiz(
    questions: LessonQuizQuestion[],
  ): LessonQuizQuestion[] {
    return questions
      .filter((question) => question?.prompt?.trim() && question.correctAnswer?.trim())
      .slice(0, 12)
      .map((question, index) => ({
        id: question.id?.trim() || `quiz-ai-${index + 1}`,
        type:
          question.type === 'word-order' || question.type === 'vocabulary-card'
            ? question.type
            : 'multiple-choice',
        prompt: question.prompt.trim(),
        options: Array.from(
          new Set((question.options || []).map((option) => option.trim()).filter(Boolean)),
        ),
        correctAnswer: question.correctAnswer.trim(),
        feedback: question.feedback?.trim() || 'راجع محتوى الدرس ثم حاول مرة أخرى.',
        enabled: question.enabled !== false,
      }));
  }

  private prepareGeneratedConversation(
    lesson: CourseLesson,
    vocabulary: LessonVocabularyItem[],
    generated: LessonConversationConfig,
  ): LessonConversationConfig {
    const fallback = this.buildConversation(lesson, vocabulary);
    const roleOptions = (generated.roleOptions || [])
      .filter(
        (role) =>
          role?.label?.trim() &&
          role.studentRole?.trim() &&
          role.aiRole?.trim() &&
          role.openingMessage?.trim(),
      )
      .map((role, index) => ({
        ...role,
        id: role.id?.trim() || `role-${index + 1}`,
      }));
    const turnPlan = (generated.turnPlan || [])
      .filter((turn) => turn?.goal?.trim() && turn.aiPrompt?.trim())
      .slice(0, 12)
      .map((turn, index) => ({
        ...turn,
        id: turn.id?.trim() || `turn-${index + 1}`,
        expectedFunctions: [...(turn.expectedFunctions || [])],
        targetPhrases: [...(turn.targetPhrases || [])],
      }));

    return {
      ...fallback,
      ...generated,
      scenario: generated.scenario?.trim() || fallback.scenario,
      aiRole: generated.aiRole?.trim() || fallback.aiRole,
      studentRole: generated.studentRole?.trim() || fallback.studentRole,
      goals: generated.goals?.filter(Boolean) || fallback.goals,
      targetPhrases:
        generated.targetPhrases?.filter(Boolean) || fallback.targetPhrases,
      openingMessage: generated.openingMessage?.trim() || fallback.openingMessage,
      questionCount: Math.min(
        12,
        Math.max(1, turnPlan.length || Number(generated.questionCount) || 6),
      ),
      lessonType: generated.lessonType || fallback.lessonType,
      topic: generated.topic?.trim() || fallback.topic,
      mode: generated.mode || fallback.mode,
      allowRoleChoice: generated.allowRoleChoice ?? fallback.allowRoleChoice,
      roleOptions: roleOptions.length ? roleOptions : fallback.roleOptions,
      turnPlan: turnPlan.length ? turnPlan : fallback.turnPlan,
      correctionMode: generated.correctionMode || 'after-each-turn',
      lessonContentOnly: true,
    };
  }

  private buildQuiz(
    lesson: CourseLesson,
    vocabulary: LessonVocabularyItem[],
  ): LessonQuizQuestion[] {
    const questions: LessonQuizQuestion[] = [];
    const sentences = lesson.segments.map((segment) => segment.text.trim()).filter(Boolean);
    const first = sentences[0];

    if (first) {
      const distractors = [
        ...sentences.slice(1, 3),
        'This sentence was not part of the lesson.',
        'I will practise a different topic tomorrow.',
      ].filter((value, index, values) => value !== first && values.indexOf(value) === index);
      questions.push({
        id: 'quiz-listening-1',
        type: 'multiple-choice',
        prompt: 'أي جملة ظهرت في هذا الدرس؟',
        options: [first, ...distractors.slice(0, 2)],
        correctAnswer: first,
        feedback: 'الإجابة مأخوذة مباشرة من أول جملة في الدرس.',
        enabled: true,
      });

      const words = first.split(/\s+/).filter(Boolean);
      questions.push({
        id: 'quiz-order-1',
        type: 'word-order',
        prompt: 'رتّب الكلمات لتكوين الجملة التي سمعتها.',
        options: this.rotate(words),
        correctAnswer: first,
        feedback: 'راجع ترتيب الجملة كما ورد في المقطع.',
        enabled: true,
      });
    }

    for (const [index, word] of vocabulary
      .filter((item) => item.translation.trim())
      .slice(0, 2)
      .entries()) {
      const otherMeanings = vocabulary
        .filter((item) => item !== word && item.translation.trim())
        .map((item) => item.translation)
        .filter((value, optionIndex, values) => values.indexOf(value) === optionIndex);
      questions.push({
        id: `quiz-vocabulary-${index + 1}`,
        type: 'vocabulary-card',
        prompt: `ما معنى “${word.term}”؟`,
        options: [word.translation, ...otherMeanings.slice(0, 2)],
        correctAnswer: word.translation,
        feedback: word.explanation || word.example,
        enabled: true,
      });
    }

    return questions;
  }

  private buildConversation(
    lesson: CourseLesson,
    vocabulary: LessonVocabularyItem[],
  ): LessonConversationConfig {
    const lessonType = this.resolveLessonType(lesson);
    const topic = this.resolveTopic(lesson, lessonType);
    const targetPhrases = [
      ...vocabulary
        .filter((item) => item.kind === 'chunk')
        .slice(0, 6)
        .map((item) => item.term),
      ...vocabulary
        .filter((item) => item.kind !== 'chunk')
        .slice(0, 4)
        .map((item) => item.term),
    ].filter(Boolean);

    if (lessonType === 'call-center') {
      const roleOptions = [
        {
          id: 'agent',
          label: 'أتدرب كموظف خدمة عملاء',
          studentRole: 'Customer service agent',
          aiRole: `Customer calling about ${topic}`,
          openingMessage: `Hello. I am calling because I have an issue with ${topic}. Can you help me?`,
        },
        {
          id: 'customer',
          label: 'أتدرب كعميل',
          studentRole: `Customer with a problem related to ${topic}`,
          aiRole: 'Customer service agent',
          openingMessage: 'Thank you for calling customer service. How may I help you today?',
        },
      ];
      return {
        scenario: `مكالمة خدمة عملاء حقيقية عن ${topic}. يختار الطالب أن يكون العميل أو موظف الخدمة، والذكاء الاصطناعي يأخذ الدور المقابل ويصحح الرد بعد كل جولة.`,
        aiRole: roleOptions[0].aiRole,
        studentRole: roleOptions[0].studentRole,
        level: 'A1',
        goals: [
          'بدء المكالمة بطريقة مهنية',
          'فهم المشكلة والتحقق من البيانات',
          'اقتراح حل ثم إغلاق المكالمة بوضوح',
        ],
        targetPhrases,
        openingMessage: roleOptions[0].openingMessage,
        questionCount: 6,
        feedbackStyle: 'balanced',
        lessonContentOnly: true,
        lessonType,
        topic,
        mode: 'role-play',
        allowRoleChoice: true,
        roleOptions,
        correctionMode: 'after-each-turn',
        turnPlan: [
          this.turn('opening', 'افتتاح المكالمة وفهم السبب', 'ابدأ المكالمة واذكر المشكلة الأساسية.', ['greeting', 'offer help'], targetPhrases.slice(0, 2)),
          this.turn('details', 'جمع تفاصيل المشكلة', 'اطلب أو قدّم تفاصيل الحساب والمشكلة.', ['ask for details', 'describe issue'], targetPhrases.slice(1, 3)),
          this.turn('verification', 'التحقق من الحساب', 'انتقل إلى خطوة تحقق مناسبة بدون طلب بيانات حساسة حقيقية.', ['verify account'], targetPhrases.slice(2, 4)),
          this.turn('empathy', 'إظهار التفهم', 'أظهر الانزعاج أو التعاطف واطلب متابعة الحل.', ['show empathy', 'acknowledge concern'], targetPhrases.slice(3, 5)),
          this.turn('solution', 'اقتراح وتنفيذ حل', 'قدّم أو اطلب حلًا واضحًا وتأكد أنه مناسب.', ['offer solution', 'confirm action'], targetPhrases.slice(4, 6)),
          this.turn('closing', 'إغلاق المكالمة', 'تأكد من رضا الطرف الآخر وأنهِ المكالمة باحتراف.', ['confirm resolution', 'close call'], targetPhrases.slice(-2)),
        ],
      };
    }

    const roleOptions = [
      {
        id: 'learner',
        label: 'أتحدث عن الموضوع',
        studentRole: 'English learner sharing opinions and experiences',
        aiRole: 'Friendly conversation partner and language coach',
        openingMessage: `Let's talk about ${topic}. What do you think about it?`,
      },
    ];
    return {
      scenario: `مناقشة طبيعية عن ${topic} مبنية على أفكار وكلمات درس «${lesson.title}»، وليست تكرارًا لجمل الدرس فقط.`,
      aiRole: roleOptions[0].aiRole,
      studentRole: roleOptions[0].studentRole,
      level: 'A1',
      goals: ['التعبير عن رأي بسيط', 'استخدام كلمات الدرس في إجابات جديدة', 'إعطاء سبب أو مثال'],
      targetPhrases,
      openingMessage: roleOptions[0].openingMessage,
      questionCount: 6,
      feedbackStyle: 'balanced',
      lessonContentOnly: true,
      lessonType,
      topic,
      mode: lessonType === 'book' ? 'role-play' : 'guided-discussion',
      allowRoleChoice: lessonType === 'book',
      roleOptions,
      correctionMode: 'after-each-turn',
      turnPlan: [
        this.turn('warm-up', 'سؤال تمهيدي', `اسأل الطالب سؤالًا بسيطًا عن ${topic}.`, ['give a direct answer'], targetPhrases.slice(0, 1)),
        this.turn('preference', 'التفضيل الشخصي', 'اسأل عما يفضله أو لا يفضله في الموضوع.', ['state a preference'], targetPhrases.slice(1, 2)),
        this.turn('reason', 'ذكر السبب', 'اطلب سببًا بسيطًا للإجابة السابقة.', ['give a reason'], targetPhrases.slice(2, 3)),
        this.turn('experience', 'تجربة أو مثال', 'اطلب تجربة شخصية أو مثالًا مرتبطًا بالموضوع.', ['give an example'], targetPhrases.slice(3, 4)),
        this.turn('compare', 'مقارنة بسيطة', 'اطلب مقارنة بين اختيارين داخل نفس الموضوع.', ['compare two things'], targetPhrases.slice(4, 5)),
        this.turn('summary', 'إجابة ختامية', 'اطلب من الطالب تلخيص رأيه في جملة أو جملتين.', ['summarize an opinion'], targetPhrases.slice(-2)),
      ],
    };
  }

  private dictionaryEntry(term: string): { translation: string; explanation: string; extraExample?: string } {
    const dictionary: Record<string, { translation: string; explanation: string; extraExample?: string }> = {
      account: { translation: 'حساب', explanation: 'A record that belongs to a customer and contains service details.', extraExample: 'Let me open your account and check the latest update.' },
      customer: { translation: 'عميل', explanation: 'A person who buys or uses a product or service.', extraExample: 'The customer called to ask about the internet plan.' },
      service: { translation: 'خدمة', explanation: 'Help or a facility provided to a customer.', extraExample: 'The service is working normally again.' },
      support: { translation: 'الدعم', explanation: 'Help given to solve a question or technical problem.', extraExample: 'Our support team can check the router remotely.' },
      issue: { translation: 'مشكلة أو خلل', explanation: 'A situation that needs attention or a solution.', extraExample: 'I can see an issue with the payment status.' },
      problem: { translation: 'مشكلة', explanation: 'Something that is not working or causing difficulty.', extraExample: 'When did the problem first start?' },
      solution: { translation: 'حل', explanation: 'A way to fix a problem.', extraExample: 'Restarting the router may be the fastest solution.' },
      help: { translation: 'مساعدة / يساعد', explanation: 'To make a task easier or solve a difficulty for someone.', extraExample: 'I can help you update the contact number.' },
      request: { translation: 'طلب', explanation: 'Something a customer formally asks a company to do.', extraExample: 'Your request will be reviewed today.' },
      information: { translation: 'معلومات', explanation: 'Facts or details about a person, account or situation.', extraExample: 'Please check that the information is correct.' },
      'customer service': {
        translation: 'خدمة العملاء',
        explanation: 'The team that helps customers with questions or problems.',
      },
      'thank you': { translation: 'شكرًا لك', explanation: 'A polite phrase used to show gratitude.' },
      concern: { translation: 'مشكلة أو أمر يسبب القلق', explanation: 'Something that worries a person.' },
      patience: { translation: 'الصبر', explanation: 'The ability to wait calmly.' },
      calling: { translation: 'الاتصال هاتفيًا', explanation: 'Speaking to someone by phone.' },
      understand: { translation: 'يفهم', explanation: 'To know what something means.' },
      check: { translation: 'يتحقق', explanation: 'To look at something carefully to make sure it is correct.' },
      'anything else': { translation: 'أي شيء آخر', explanation: 'A question used to offer more help.' },
      'check that for you': { translation: 'أتحقق من ذلك من أجلك', explanation: 'A service phrase promising to investigate something.' },
      'i understand your concern': { translation: 'أتفهم مشكلتك', explanation: 'A polite phrase that shows empathy.' },
      'how can i help you': { translation: 'كيف يمكنني مساعدتك؟', explanation: 'A common question used to offer help.' },
      'how may i help you': { translation: 'كيف يمكنني مساعدتك؟', explanation: 'A professional opening used by a customer service agent.' },
      'thank you for your patience': { translation: 'شكرًا لصبرك', explanation: 'A polite phrase used after a customer has waited.' },
      'requested a supervisor': { translation: 'طلب التحدث إلى مشرف', explanation: 'Used when a customer asks for a higher level of support.' },
      'request has been submitted': { translation: 'تم إرسال الطلب', explanation: 'Confirms that a formal customer request entered the system.' },
      'service is now restored': { translation: 'تمت استعادة الخدمة الآن', explanation: 'Confirms that a service is working again.' },
      'service interruption': { translation: 'انقطاع الخدمة', explanation: 'A temporary period when a service is unavailable.' },
      'found a solution': { translation: 'وجدت حلًا', explanation: 'Used to tell the customer that a suitable fix is available.' },
    };
    return dictionary[this.normalize(term)] || {
      translation: '',
      explanation: 'A useful word or phrase taken from this lesson.',
    };
  }

  private createHint(sentence: string): string {
    return sentence
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => `${word.charAt(0)}${'_'.repeat(Math.max(word.length - 1, 1))}`)
      .join(' ');
  }

  private rotate<T>(items: T[]): T[] {
    if (items.length < 2) return [...items];
    const pivot = Math.max(1, Math.floor(items.length / 2));
    return [...items.slice(pivot), ...items.slice(0, pivot)];
  }

  private turn(
    id: string,
    goal: string,
    aiPrompt: string,
    expectedFunctions: string[],
    targetPhrases: string[],
  ) {
    return { id, goal, aiPrompt, expectedFunctions, targetPhrases };
  }

  private resolveLessonType(
    lesson: CourseLesson,
  ): 'call-center' | 'youtube' | 'book' | 'general' {
    const selected = lesson.contentProfile?.type;
    if (selected && selected !== 'auto') return selected;

    const content = this.normalize(
      `${lesson.title} ${lesson.contentProfile?.topic || ''} ${lesson.segments
        .map((segment) => segment.text)
        .join(' ')}`,
    );
    if (
      /\b(customer|account|service|support|supervisor|agent|call|request|connection|internet)\b/.test(
        content,
      )
    ) {
      return 'call-center';
    }
    if (/\b(youtube|video|podcast|episode|channel)\b/.test(content)) {
      return 'youtube';
    }
    if (/\b(book|unit|chapter|dialogue|textbook)\b/.test(content)) {
      return 'book';
    }
    return 'general';
  }

  private resolveTopic(
    lesson: CourseLesson,
    type: 'call-center' | 'youtube' | 'book' | 'general',
  ): string {
    const selected = lesson.contentProfile?.topic?.trim();
    if (selected) return selected;
    const content = this.normalize(
      `${lesson.title} ${lesson.segments.map((segment) => segment.text).join(' ')}`,
    );
    if (type === 'call-center') {
      if (content.includes('account')) return 'an account verification or balance problem';
      if (content.includes('internet') || content.includes('connection')) {
        return 'an internet connection problem';
      }
      if (content.includes('cancel')) return 'a cancellation request';
      return 'a customer service request';
    }
    if (content.includes('weather')) return 'weather and personal preferences';
    return lesson.title.trim() || 'the lesson topic';
  }

  private visualSceneFor(
    term: string,
    lessonType: 'call-center' | 'youtube' | 'book' | 'general',
  ): string {
    const key = this.normalize(term);
    const scenes: Record<string, string> = {
      account: 'a customer service agent verifying one customer account on a computer screen while speaking on a headset',
      customer: 'a customer speaking with a helpful support agent by phone',
      service: 'a technician restoring a home internet service while the customer watches',
      support: 'a headset support agent calmly guiding a customer through troubleshooting',
      issue: 'a support agent noticing a warning on the customer account and investigating it',
      problem: 'a customer showing a disconnected router while an agent checks the problem',
      solution: 'a relieved customer seeing the router work after the agent provides a solution',
      help: 'a friendly support agent actively helping a customer',
      request: 'an agent submitting a customer request in a service system',
      information: 'an agent securely verifying customer information on a computer',
    };
    const direct = scenes[key];
    if (direct) return direct;
    if (key.includes('account')) return scenes['account'];
    if (key.includes('customer')) return scenes['customer'];
    if (key.includes('service')) return scenes['service'];
    if (key.includes('support')) return scenes['support'];
    if (key.includes('issue')) return scenes['issue'];
    if (key.includes('problem')) return scenes['problem'];
    if (key.includes('solution')) return scenes['solution'];
    if (key.includes('help')) return scenes['help'];
    if (key.includes('request')) return scenes['request'];
    if (key.includes('information') || key.includes('verify')) return scenes['information'];
    return lessonType === 'call-center'
      ? `a realistic call-center interaction that naturally demonstrates the meaning of “${term}”`
      : `a realistic everyday situation that naturally demonstrates the meaning of “${term}”`;
  }

  private createContextIllustration(
    term: string,
    lessonType: 'call-center' | 'youtube' | 'book' | 'general',
    description: string,
  ): string {
    const key = this.normalize(term);
    const icon = key.includes('solution')
      ? '✓'
      : key.includes('issue') || key.includes('problem')
        ? '!'
        : key.includes('request')
          ? '↗'
          : key.includes('information') || key.includes('account')
            ? 'i'
            : key.includes('help') || key.includes('support')
              ? '?'
              : lessonType === 'call-center'
                ? '☎'
                : '●';
    const hue = Array.from(key).reduce((total, char) => total + char.charCodeAt(0), 0) % 40;
    const background = `hsl(${168 + hue} 58% 92%)`;
    const accent = `hsl(${168 + hue} 70% 34%)`;
    const safeDescription = description.replace(/[&<>"']/g, ' ');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="480" viewBox="0 0 720 480" role="img" aria-label="${safeDescription}"><rect width="720" height="480" rx="36" fill="${background}"/><circle cx="212" cy="208" r="86" fill="white" opacity=".96"/><path d="M145 360c8-72 50-112 111-112s103 40 111 112" fill="white"/><circle cx="508" cy="190" r="74" fill="${accent}" opacity=".16"/><rect x="416" y="270" width="188" height="104" rx="24" fill="white"/><path d="M454 306h112M454 336h78" stroke="${accent}" stroke-width="14" stroke-linecap="round" opacity=".45"/><path d="M164 199c0-56 28-91 68-91s68 35 68 91" fill="none" stroke="${accent}" stroke-width="18" stroke-linecap="round"/><path d="M158 190v54M306 190v54" stroke="${accent}" stroke-width="24" stroke-linecap="round"/><circle cx="508" cy="190" r="46" fill="${accent}"/><text x="508" y="209" text-anchor="middle" font-family="Arial,sans-serif" font-size="54" font-weight="700" fill="white">${icon}</text></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  private createExtraExample(
    term: string,
    lessonType: 'call-center' | 'youtube' | 'book' | 'general',
  ): string {
    if (lessonType === 'call-center') {
      return `Could you use “${term}” while helping this customer?`;
    }
    return `Try to use “${term}” in a new sentence about this topic.`;
  }

  private slug(value: string): string {
    return this.normalize(value).replace(/\s+/g, '-').slice(0, 48) || 'item';
  }

  private pushCandidate(
    target: VocabularyCandidate[],
    seen: Set<string>,
    term: string,
    example: string,
    kind: 'word' | 'chunk',
    priority: number,
  ): void {
    const key = this.normalize(term);
    if (!key || seen.has(key)) return;
    seen.add(key);
    target.push({ term, example: example.trim(), kind, priority });
  }

  private normalize(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9'\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private async report(
    handler: LessonAiProgressHandler | undefined,
    percent: number,
    title: string,
    detail: string,
  ): Promise<void> {
    handler?.({ percent, title, detail });
    await new Promise<void>((resolve) => window.setTimeout(resolve, 180));
  }
}
