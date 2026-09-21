# إصلاح AI المحلي + نقل المعالجة إلى Lesson Builder

## التشخيص
النسخة المرفوعة تحتوي على دليل واضح على سبب HTTP 405:

- الـFrontend كان يرسل معالجة الدرس إلى `POST /api/lesson-ai/structured`.
- الـBackend source الحالي يحتوي هذا المسار.
- لكن الـbinary الأقدم الموجود داخل `artifacts/backend-build-check/ShadowingEnglish.Api.dll` يحتوي `process` ولا يحتوي `structured`.
- عند تشغيل binary قديم، الطلب إلى `/structured` لا يجد POST مطابقًا، ومع وجود SPA fallback يمكن أن يظهر كـ HTTP 405.

## ما تم تغييره

1. **معالجة الدرس لا تستخدم `/structured` بعد الآن**.
   أصبحت تستخدم endpoint المخصص الموجود أصلًا:
   `POST /api/lesson-ai/process`

   هذا أفضل لأن الـprompt والـschema يظلان داخل الـBackend، وهو متوافق أيضًا مع الـbackend المحلي الأقدم الموجود في المشروع.

2. **منع تشغيل Backend قديم على port 5017**.
   `scripts/run-api.ps1` أصبح:
   - يكتشف نسخة ShadowingEnglish API قديمة على 5017.
   - يوقفها فقط إذا تأكد أنها تخص المشروع.
   - يعمل build جديد.
   - يشغل النسخة الجديدة.
   - لا يوقف أي process غريب يستخدم نفس المنفذ.

3. **لا Proxy**.
   - `proxy.conf.json` أصبح `{}`.
   - الـFrontend المحلي يستمر في الاتصال مباشرة بـ `http://localhost:5017/api`.
   - `scripts/check-ai-backend-only.ps1` يفشل لو رجع proxy config فعلي مرة أخرى.

4. **المعالجة أصبحت داخل `/admin/lessons/builder`**.
   بعد حفظ الدرس كـ Admin:
   - تبدأ المرحلة الأولى تلقائيًا: تحليل نص الدرس بالذكاء الاصطناعي.
   - تظهر نتيجة الفهم داخل نفس الصفحة: الموضوع/السيناريو/الأهداف + عدد الكلمات والاختبار.
   - بعدها يظهر زر: **ابدأ معالجة الكلمات وباقي المراحل**.
   - المرحلة الثانية تجهز الكلمات والصور + Listen & Write + Quiz + Conversation داخل نفس الصفحة.
   - الصور تعمل حتى 3 requests بالتوازي.
   - النتيجة النهائية تحفظ تلقائيًا في الـBackend.
   - بعد النجاح يظهر زر **فتح مراجعة المحتوى**.

5. **Logging آمن**.
   تمت إضافة START / CHECK / SUCCESS / ERROR لمعالجة الدرس في الـBackend مع:
   - LessonId
   - SegmentCount
   - Provider
   - counts
   - correlationId
   - durationMs

   بدون API keys أو passwords أو tokens أو audio bytes.

## الملفات المعدلة
- `src/app/features/lessons/data-access/lesson-ai-api.service.ts`
- `src/app/features/lessons/data-access/lesson-ai-api.service.spec.ts`
- `src/app/features/lessons/pages/lesson-builder/lesson-builder.page.ts`
- `src/app/features/lessons/pages/lesson-builder/lesson-builder.page.html`
- `backend/ShadowingEnglish.Api/Services/LessonAiService.cs`
- `scripts/run-api.ps1`
- `scripts/check-ai-backend-only.ps1`
- `proxy.conf.json`

## التشغيل المحلي بعد تطبيق الباتش
1. أغلق نافذة الـAPI القديمة إن كانت مفتوحة، أو فقط شغّل `scripts\\run-api.cmd`؛ السكربت أصبح يتعامل مع نسخة المشروع القديمة على 5017 تلقائيًا.
2. شغّل `scripts\\run-frontend.cmd`.
3. افتح:
   `http://localhost:4200/admin/lessons/builder`
4. أنشئ/عدّل درسًا واضغط **حفظ وتحليل الدرس**.
5. بعد نجاح تحليل النص اضغط **ابدأ معالجة الكلمات وباقي المراحل**.

## ملاحظة التحقق
تم التحقق من source والمسارات والـcompiled artifacts الموجودة داخل النسخة المرفوعة. بيئة الفحص هنا لا تحتوي .NET SDK ولا dependencies الخاصة بالمشروع، لذلك يجب تشغيل `dotnet build` و`npm run build` على جهاز المشروع بعد تطبيق الملفات.
