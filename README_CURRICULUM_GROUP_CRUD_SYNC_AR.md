# إصلاح حذف المناهج/المجموعات ومزامنة حذف الدرس

## المشكلة
- لم يكن هناك DELETE حقيقي للـCurriculum أو Group في الـBackend/UI.
- حذف درس من Curriculum كان يحدث المنهج فقط، بينما Group.draftCurriculum بقي Snapshot قديمًا، لذلك صفحة النشر ظلت تعرض 3 دروس.
- زر Publish كان قادرًا على الاعتماد على Draft قديم في ذاكرة التاب.

## السلوك بعد الإصلاح
1. حذف Lesson slot من Curriculum:
   - يحفظ Curriculum فورًا في SQL.
   - الـBackend يحدث DraftCurriculumJson لكل Group نشطة مرتبطة بنفس Curriculum.
   - HasDraftChanges=true.
   - Published snapshot لا يتغير قبل الضغط على Publish.
   - قبل Publish مباشرة يتم إعادة جلب Draft المجموعة من SQL لمنع نشر Cache قديم.

2. حذف Curriculum:
   - DELETE /api/admin/curriculums/{id}
   - الحذف نهائي إذا لا توجد Groups نشطة مرتبطة به.
   - إذا توجد Groups يرجع 409 ويطلب نقل/حذف الجروبات أولًا.

3. حذف Group:
   - DELETE /api/admin/learning-groups/{id}
   - يتم تعطيل المجموعة في SQL (IsActive=false) فتختفي من الإدارة.
   - إذا يوجد طلاب مرتبطون بها يرجع 409 ويجب نقل الطلاب أولًا.

## Logs مهمة
Backend:
- [CURRICULUM][UPSERT][START]
- [CURRICULUM][GROUP_DRAFT_SYNC][CHECK_OK]
- [CURRICULUM][UPSERT][CHECK_OK]
- [CURRICULUM][DELETE][START|CHECK_FAILED|SUCCESS|ERROR]
- [TRACKING][GROUP_DELETE][START|CHECK_FAILED|SUCCESS|ERROR]

Frontend:
- [CurriculumRepository] removeLessonSlotPersisted...
- [GroupCurriculumRepository] publish-backend-draft-refreshed:check-ok
- [AdminCurriculums] delete...
- [AdminGroups] deleteGroup...

## اختبار حذف درس من المنهج
مثال: المنهج يحتوي 3 دروس والمجموعة مرتبطة به.
1. افتح Curriculum Details واحذف درسًا.
2. يجب أن تصبح صفحة المنهج = 2 درس.
3. افتح Group Details أو اعمل Refresh.
4. يجب أن ترى: Draft = 2، Published = 3.
5. اضغط Publish.
6. يجب أن تصبح: Draft = 2، Published = 2.
7. اعمل Refresh للطالب: يجب أن يرى درسين فقط.

## ملاحظات
- لا يوجد Migration جديدة في هذا Patch.
- تم فحص ملفات TypeScript المعدلة بـ tsc --noCheck بدون أخطاء.
- لم يتم تشغيل dotnet build داخل بيئة الإنشاء لأن .NET SDK غير متاح هنا؛ شغّل build على جهاز المشروع بعد تركيب الـPatch.
