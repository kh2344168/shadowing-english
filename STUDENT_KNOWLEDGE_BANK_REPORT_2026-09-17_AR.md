# بنك الكلمات والجمل + تقرير الطالب — 17 سبتمبر 2026

## ما تم تنفيذه

### 1) بنك معرفة تراكمي للطالب
المسار الجديد:

`/student/knowledge-bank`

يجمع تلقائيًا من الدروس التي بدأ الطالب وأكمل مراحلها:
- الكلمات التي ظهرت في مرحلة Vocabulary المكتملة.
- الـChunks / العبارات الجاهزة.
- جمل الشادوينج التي تدرب عليها الطالب بعد اكتمال مرحلة Shadowing.

القواعد:
- لا يتم كشف محتوى درس مستقبلي أو مرحلة لم يكملها الطالب.
- العنصر المتكرر لا يتكرر في القائمة؛ يتم دمج مصادره وإظهار الدروس التي ظهر فيها.
- يعتمد على المحتوى الذي يراه الطالب فعلًا عبر `StudentLessonContentService`.
- بحث + فلتر كلمات/عبارات/جمل + فلتر حسب الدرس.
- زر نطق لكل عنصر باستخدام Browser Speech Synthesis.

### 2) AI Context
يوجد زر "نسخ سياق للذكاء الاصطناعي" يبني نصًا منظمًا يحتوي:
- اسم الطالب والمنهج والتقدم.
- الكلمات المعروفة سابقًا.
- العبارات والـChunks.
- الجمل التي تدرب عليها.
- تعليمات للـAI بأن هذه العناصر تعني تعرضًا سابقًا وليست إتقانًا 100%.

تم أيضًا ربط هذا السياق بمحادثة الدرس داخل التطبيق. قبل كل Turn يتم إرسال Snapshot محدود من المعرفة السابقة فقط، مع استبعاد الدرس الحالي لأن محتوى الدرس الحالي يُرسل أصلًا منفصلًا.

### 3) تقرير طالب شامل
المسار الجديد:

`/student/report`

يعرض:
- اسم الطالب والبريد والمجموعة والمنهج.
- نسبة التقدم.
- عدد الدروس المكتملة/الكل.
- عدد التسجيلات.
- المراجعات المجدولة والمستحقة.
- متوسط درجات الاختبارات المحفوظة.
- تفاصيل كل درس بدأه الطالب: النسبة، المراحل، التسجيلات، ودرجة الاختبار لو موجودة.
- إحصائيات المحادثات الجديدة المحفوظة: الجلسات، الأدوار المقبولة، الإجابات الجيدة، والتصحيحات المهمة.
- ملخص بنك الكلمات/العبارات/الجمل.

### 4) تنزيل PDF حقيقي
زر "تنزيل PDF" يولد ملف PDF مباشرة في المتصفح بدون إضافة dependency جديدة.

الـPDF يحتوي:
- بيانات الطالب.
- ملخص التقدم.
- تفاصيل الدروس.
- جميع الكلمات في البنك.
- جميع العبارات.
- جميع الجمل المدروسة.
- ملاحظة واضحة لأي AI يقرأ التقرير عن كيفية تفسير المعرفة السابقة.

يتم رسم الصفحات داخل Canvas ثم تجميعها في PDF متعدد الصفحات، لذلك يدعم العربية بدون الحاجة لإضافة مكتبة PDF أو Font package للمشروع.

### 5) حفظ ملخص المحادثة
تم توسيع StudentLearningRepository من schemaVersion 1 إلى 2 مع migration تلقائية من بيانات v1.
تمت إضافة حفظ Conversation Summary بعد إكمال مرحلة المحادثة:
- totalStudentTurns
- acceptedTurns
- goodAnswers
- correctionCount
- usedTargetPhrases

البيانات القديمة لا تضيع عند الترقية.

### 6) التنقل
تمت إضافة:
- "بنك الكلمات" في Student desktop navigation.
- "البنك" في mobile bottom navigation.
- "تقرير الطالب" داخل قائمة الحساب.
- روابط بنك الكلمات وPDF داخل صفحة "تقدمي".

## الملفات الجديدة
- `src/app/features/student/data-access/student-knowledge.models.ts`
- `src/app/features/student/data-access/student-knowledge-bank.service.ts`
- `src/app/features/student/data-access/student-report.service.ts`
- `src/app/features/student/data-access/student-knowledge-bank.service.spec.ts`
- `src/app/features/student/pages/knowledge-bank/*`
- `src/app/features/student/pages/report/*`

## الملفات المعدلة
- `src/app/features/student/student.routes.ts`
- `src/app/layouts/student-layout/student-layout.ts`
- `src/app/layouts/student-layout/student-layout.html`
- `src/app/layouts/student-layout/student-layout.scss`
- `src/app/features/student/data-access/student-learning.models.ts`
- `src/app/features/student/data-access/student-learning.repository.ts`
- `src/app/features/student/data-access/student-learning.repository.spec.ts`
- `src/app/features/student/pages/lesson-stage/student-lesson-stage.page.ts`
- `src/app/features/student/pages/progress/student-progress.page.html`
- `src/app/features/student/pages/progress/student-progress.page.scss`
- `src/app/features/lessons/data-access/lesson-ai.models.ts`
- `src/app/core/ai/frontend-ai.prompts.ts`

## التحقق
- تم عمل TypeScript syntax transpile check للملفات الجديدة والمعدلة: Passed.
- تم parsing لصفحات HTML الجديدة: Passed.
- حاولنا تشغيل `npm ci` لتجهيز Angular build كامل، لكن بيئة التنفيذ أوقفت تنزيل dependencies قبل اكتماله، لذلك لم يتم الادعاء بوجود `ng build` ناجح.
- لم تتم إضافة أي npm dependency جديدة.
