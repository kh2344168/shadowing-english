# Conversation V2 — 2026-09-16

تم تطوير مرحلة AI Conversation مع الحفاظ على شكل WhatsApp السابق.

## السلوك الجديد
- 6 جولات تعليمية أساسية افتراضيًا.
- التصحيح/إعادة المحاولة لا يستهلك جولة إذا قرر AI أن الخطأ يحتاج إعادة فعلية.
- بعد 6 جولات يظهر اختيار: الاستمرار أو إنهاء الدرس.
- الاستمرار يفتح حتى 6 جولات إضافية (حد أقصى 12)، ويمكن للـAI بدء الإغلاق مبكرًا إذا أصبح الحوار متكررًا أو طويلًا.
- عند اختيار الإنهاء لا يتم قطع الحوار فورًا؛ يبدأ AI Closing طبيعي ثم يترك للطالب رد شكر/وداع أخير.
- Context lock: المحادثة تظل داخل مكان/أدوار/موضوع الدرس. الطلب الجانبي يُستوعب طبيعيًا ثم يرجع لنفس السياق.

## التصحيح
- تجاهل capitalization والنقطة والفواصل كأخطاء ما لم تغير المعنى.
- spellingCorrections تعرض الكلمة الخاطئة والتصحيح مباشرة.
- grammarExplanationArabic يشرح خطأ الجرامر باختصار.
- needsRetry يستخدم فقط عندما يلزم إعادة الإجابة قبل تقدم السيناريو.
- الأخطاء الصغيرة لا توقف المحادثة.

## الاقتراحات
- الاقتراحات مخفية افتراضيًا.
- تظهر فقط عند ضغط «هل تريد اقتراحات للرد؟».

## Text / Voice
- Text → AI Text.
- Voice → AI Voice.
- رسالة AI الصوتية تخفي الـTranscript افتراضيًا.
- «مش فاهم الكلام؟ اعرض النص» يظهر النص لنفس الرسالة.
- «اسمع ببطء» يعيد الرسالة بسرعة أبطأ.
- لو قال الطالب صوتيًا مثل "I don't understand" أو "Can you say that again?" يتم إظهار Transcript لآخر رسالة صوتية وإعادتها ببطء بدون استهلاك جولة تعليمية.
- تسجيل الطالب يحتفظ بالصوت + Speech Recognition text ويمكن تعديل النص قبل الإرسال.

## الصوت المجاني الحالي
يستخدم Web Speech SpeechSynthesis بدون تكلفة API، مع اختيار أفضل Voice إنجليزي متاح على الجهاز، وتفضيل أصوات Microsoft Natural/Neural/Online إن كانت متاحة واستبعاد Google voices عند وجود بديل.
الجودة الفعلية تعتمد على المتصفح والأصوات المثبتة على Windows. هذا Adapter مؤقت ويمكن استبداله لاحقًا بـ ElevenLabs أو مزود TTS آخر بدون تغيير منطق المحادثة.

## ملفات رئيسية معدلة
- src/app/features/student/pages/lesson-stage/student-lesson-stage.page.ts
- src/app/features/student/pages/lesson-stage/student-lesson-stage.page.html
- src/app/features/student/pages/lesson-stage/student-lesson-stage.page.scss
- src/app/features/lessons/data-access/lesson-ai.models.ts
- src/app/features/lessons/data-access/lesson-ai-api.service.ts
- src/app/features/lessons/data-access/lesson.models.ts
- src/app/core/ai/frontend-ai.prompts.ts
- src/app/core/ai/frontend-ai.schemas.ts
- src/app/features/lessons/pages/lesson-builder/lesson-builder.page.ts

## فحص
تم فحص Syntax للملفات TypeScript المعدلة باستخدام TypeScript transpile diagnostics ولم تظهر Syntax errors. لم يتم تنفيذ Angular build كامل داخل بيئة التسليم لأن تثبيت node_modules لم يكتمل في البيئة المؤقتة.
