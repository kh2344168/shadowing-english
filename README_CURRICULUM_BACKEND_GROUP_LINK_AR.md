# إصلاح ربط المناهج بالمجموعات + نقل المناهج للـBackend

## المشكلة التي يعالجها الـPatch
- المنهج الجديد كان محفوظًا في LocalStorage فقط.
- صفحة تفاصيل المجموعة لم يكن بها اختيار لتغيير المنهج المرتبط.
- عند وجود Draft لمنهج جديد وPublished لمنهج قديم، قراءة النسخة المنشورة كانت تستطيع إعادة CurriculumId للمنهج القديم.

## ما تم تغييره
1. إضافة جدول SQL جديد: `Curriculums`.
2. إضافة API:
   - `GET /api/admin/curriculums`
   - `GET /api/admin/curriculums/{id}`
   - `PUT /api/admin/curriculums/{id}`
3. المناهج القديمة الموجودة في LocalStorage يتم ترحيل الناقص منها إلى SQL مرة واحدة.
4. `/admin/curriculums` يقرأ ويحفظ من Backend.
5. `/admin/groups` يقرأ قائمة المناهج من Backend قبل إنشاء المجموعة.
6. صفحة `/admin/groups/{groupId}` تعرض كل المناهج الموجودة في SQL مع زر `ربط / تغيير المنهج`.
7. تغيير المنهج يحدث Draft فقط، والطالب يظل على Published القديم حتى الضغط على `نشر التغييرات`.
8. إصلاح Draft/Published: قراءة Published قديم لا تعيد CurriculumId للقديم إذا كان لدى المجموعة Draft جديد.
9. Backend يرفض ربط مجموعة أو نشر Snapshot بمنهج غير موجود في جدول Curriculums.
10. `scripts/diagnose-publishing.cmd` أصبح يفحص أيضًا Group -> Curriculum integrity.

## Logs المتوقعة
Frontend:
- `[CurriculumApi] getAll:start/success`
- `[CurriculumRepository] backend-authoritative:check-ok`
- `[AdminGroupDetails] curriculum-selector-ready:check-ok`
- `[AdminGroupDetails] changeCurriculum-backend:check-ok`

Backend:
- `[CURRICULUM][LIST][START/SUCCESS]`
- `[CURRICULUM][UPSERT][START/SUCCESS]`
- `[TRACKING][GROUP_UPSERT][CHECK_OK]`
- `[PUBLISH][CURRICULUM][CHECK_OK]`

## الاختبار بعد التركيب
1. أوقف Frontend وBackend.
2. انسخ ملفات الـPatch فوق المشروع الحالي.
3. شغّل Backend. الـMigration `20260920113000_AddCurriculumLibrary` ستنشئ جدول `Curriculums` تلقائيًا.
4. شغّل Frontend وسجّل Admin.
5. افتح `/admin/curriculums`. أي مناهج قديمة محلية ناقصة سيتم ترحيلها مرة واحدة إلى SQL.
6. أنشئ منهجًا جديدًا واحفظه.
7. افتح المجموعة المطلوبة: `/admin/groups/{groupId}`.
8. في قسم `المنهج المرتبط بالمجموعة` يجب أن يظهر المنهج الجديد في القائمة.
9. اختره واضغط `ربط / تغيير المنهج`.
10. تأكد أن `خطة المنهج` تعرض مسودة المنهج الجديد، بينما الطالب يظل على النسخة المنشورة القديمة.
11. اضغط `نشر التغييرات`.
12. شغّل `scripts\diagnose-publishing.cmd`.

النتيجة المطلوبة:
`[CHECK][GROUP_CURRICULUM][SUCCESS]`
ثم نجاح `PUBLISH_VERIFY` و`STUDENT_VISIBILITY` للمجموعة المنشورة.

## فحص تم في بيئة ChatGPT
- فحص TypeScript syntax للملفات المعدلة: نجح.
- لا يوجد .NET SDK متاح في بيئة ChatGPT، لذلك `dotnet build` يجب تشغيله على جهاز المشروع قبل الاعتماد النهائي.
