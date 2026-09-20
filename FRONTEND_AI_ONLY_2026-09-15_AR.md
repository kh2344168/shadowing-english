# نقل معالجة الذكاء الاصطناعي إلى الـ Frontend — 2026-09-15

هذه نسخة تجريبية خاصة تم فيها نقل معالجة الذكاء الاصطناعي من ASP.NET Backend إلى Angular Frontend مؤقتًا لتقليل الاعتماد على اتصال الواجهة بالـBackend أثناء تجهيز الدرس.

## المسار الحالي

1. صفحة معالجة الدرس تشغّل مزودي النص مباشرة من الـFrontend بالترتيب:
   - Groq
   - Gemini
   - Mistral
2. إذا فشل مزود ينتقل تلقائيًا للذي يليه.
3. صور الكلمات تُبحث من Pexels في الـFrontend.
4. ناتج الدرس يظل داخل الصفحة ولا يتم حفظه في قاعدة بيانات الـBackend أثناء المعالجة.
5. بعد اكتمال كل المعالجة يظهر زر **تمت المعالجة — احفظ النتيجة**.
6. الضغط على الزر هو نقطة الحفظ الإلزامية إلى الـBackend.
7. بعد نجاح الحفظ فقط يظهر رابط مراجعة النتيجة.
8. اعتماد مراجعة المحتوى يستخدم حفظًا صارمًا إلى الـBackend حتى تكون النسخة التي يقرأها الطالب هي النسخة المعتمدة نفسها.

## ملاحظة عن الاتصال بمزودي AI

أثناء `ng serve` تُستخدم مسارات `/__ai/*` في `proxy.conf.json` كـ dev proxy لتجاوز قيود CORS في المتصفح. هذا الـproxy تابع لخادم Angular المحلي وليس ASP.NET Backend، ولا ينفذ أي منطق AI.

- `/__ai/groq/*` -> Groq
- `/__ai/gemini/*` -> Gemini
- `/__ai/mistral/*` -> Mistral
- `/__ai/pexels/*` -> Pexels
- `/api/*` فقط هو الذي يذهب إلى ASP.NET Backend للحفظ/قراءة البيانات.

## الأمان

المفاتيح موجودة في `public/server-config.js` حسب طلب نسخة التجربة الخاصة، وبالتالي يمكن رؤيتها من Developer Tools. يجب نقلها إلى Backend/Secret Manager قبل أي نشر عام.

## أهم الملفات المعدلة

- `public/server-config.js`
- `proxy.conf.json`
- `src/app/core/ai/frontend-ai-test.config.ts`
- `src/app/core/ai/frontend-ai.schemas.ts`
- `src/app/core/ai/frontend-ai.prompts.ts`
- `src/app/features/lessons/data-access/lesson-ai-api.service.ts`
- `src/app/features/lessons/data-access/lesson-ai.models.ts`
- `src/app/features/lessons/data-access/lesson.repository.ts`
- `src/app/features/admin/pages/lesson-processing/lesson-processing.page.ts`
- `src/app/features/admin/pages/lesson-processing/lesson-processing.page.html`
- `src/app/features/admin/pages/lesson-content-review/lesson-content-review.page.ts`

## التحقق الذي تم

- تم فحص Syntax لملفات TypeScript المعدلة باستخدام TypeScript transpiler بدون أخطاء Syntax.
- تم التحقق أن `proxy.conf.json` JSON صالح.
- لا توجد استدعاءات Frontend مباشرة لمسار `/api/lesson-ai` بعد النقل.
- ترتيب fallback في الـFrontend هو Groq ثم Gemini ثم Mistral.
- لم يتم تشغيل Angular build كامل داخل بيئة الإنشاء لأن تثبيت dependencies لم يكتمل في البيئة.
