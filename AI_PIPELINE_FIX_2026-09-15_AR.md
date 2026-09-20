# إصلاح AI Pipeline — 2026-09-15

هذه النسخة مبنية فوق `shadowing-project-complete-ai500-fix-2026-09-15` وتحافظ على كل تعديلات المشروع السابقة.

## ما تم تعديله

1. **Groq**
   - يبقى المزود الأول.
   - يستخدم `openai/gpt-oss-120b`.
   - Structured Output صار عبر `POST /openai/v1/chat/completions` مع `response_format.type = json_schema` و `strict = true`.
   - يتم التحقق محليًا من JSON بعد عودته قبل اعتبار المحاولة ناجحة.

2. **Gemini**
   - المزود الثاني.
   - النموذج الافتراضي أصبح `gemini-3.1-flash-lite`.
   - الـ JSON Schema يرسل كـ Structured Output حقيقي داخل `generationConfig.responseFormat.text.schema` بدل وضع المخطط كنص داخل الـ prompt فقط.

3. **OpenAI**
   - يظل fallback أخير للنص.
   - Responses API مع JSON Schema strict.

4. **تشخيص المزودات**
   - `verify=true` لم يعد يكتفي بفحص وجود اسم الموديل؛ ينفذ Structured Output صغيرًا فعليًا.
   - `run-api.cmd` يعرض Log لكل محاولة: provider/model/success/error بدون طباعة مفاتيح API.
   - لو مزود أعاد JSON غير مطابق للمخطط، ينتقل النظام إلى المزود التالي بدل قبول الاستجابة.

5. **الصور**
   - معالجة صور الكلمات أثناء تجهيز الدرس أصبحت بحد أقصى **3 طلبات بالتوازي**.
   - يتم حفظ مسودة النص قبل بدء الصور.
   - بعد اكتمال كل صورة/محاولة يتم عمل checkpoint للدرس، لذلك انقطاع معالجة الصور لا يجبر على إعادة تحليل الكلمات والاختبار والمحادثة.
   - زر «توليد الصور الناقصة» داخل مراجعة Vocabulary يستخدم Queue من 3 صور أيضًا.

6. **اعتماد الأدمن**
   - لم يتم تغيير منطق الاعتماد: الصورة لا تظهر للطالب إلا عند `imageApproved = true`.
   - عند اعتماد مرحلة Vocabulary، الطالب يقرأ النسخة المحفوظة فقط ولا يعيد تشغيل AI للكلمات أو الصور.

## الملفات المعدلة

- `backend/ShadowingEnglish.Api/Services/LessonAiService.cs`
- `public/server-config.js`
- `src/app/core/ai/frontend-ai-test.config.ts`
- `src/app/features/admin/pages/lesson-processing/lesson-processing.page.ts`
- `src/app/features/admin/pages/lesson-content-review/lesson-content-review.page.ts`

## التحقق

بيئة ChatGPT الحالية لا تحتوي .NET SDK ولا تستطيع الوصول إلى مزودي Groq/Gemini مباشرة، لذلك لم يكن ممكنًا تنفيذ `dotnet build` أو اختبار API فعلي بالمفاتيح من هذه البيئة. تم عمل فحص بنيوي للملفات والتغييرات. على جهاز المشروع شغّل:

```bat
scripts\run-api.cmd
```

ثم:

```bat
scripts\run-frontend.cmd
```

راقب نافذة الـ API؛ الرسائل تبدأ بـ `[Lesson AI]` وتوضح محاولة Groq ثم Gemini ثم OpenAI عند الحاجة.
