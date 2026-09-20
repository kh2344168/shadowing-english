# إصلاح مزودي AI — 2026-09-15

تم تنفيذ الإصلاح على آخر نسخة كاملة من المشروع.

## التغييرات

- ترتيب مزودي النص أصبح: **Groq ثم Gemini فقط**.
- تمت إزالة OpenAI من إعدادات الـFrontend، والـheaders، ومسار fallback في الـBackend.
- مفتاح Gemini المستخدم في `public/server-config.js` هو المفتاح الثاني الذي تم تزويده للمشروع، وليس المفتاح الأقدم.
- Groq يستخدم `openai/gpt-oss-120b` مع Strict Structured Outputs.
- Groq يبدأ بـ `max_completion_tokens = 8192` و`reasoning_effort = low`.
- إذا أعاد Groq خطأ نفاد `max_completion_tokens` تتم محاولة واحدة إضافية بحد `16384`، ثم ينتقل النظام إلى Gemini إذا فشل.
- Gemini يستخدم `gemini-3.1-flash-lite`.
- تم تغيير إعداد Gemini من `responseFormat.text.mimeType` الذي كان يرجع 400 في المشروع إلى `responseMimeType = application/json` مع `responseJsonSchema` داخل `generationConfig`.
- الصور تستخدم **Pexels فقط** في نسخة الاختبار الحالية؛ لا يوجد fallback إلى OpenAI.
- إذا لم يجد Pexels صورة مناسبة، تظل الكلمة بلا صورة ويمكن اختيار صورة يدويًا من شاشة المراجعة.

## ملاحظة تشغيل

بعد استبدال المشروع، أوقف الـFrontend والـBackend القديمين، ثم شغّل:

```bat
scripts\run-api.cmd
```

ثم في نافذة أخرى:

```bat
scripts\run-frontend.cmd
```

راقب نافذة الـBackend. عند معالجة الدرس يجب أن يظهر Groq أولًا، وإذا فشل يظهر Gemini ثانيًا. لن يظهر OpenAI كمزود نص.
