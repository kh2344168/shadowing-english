# إصلاح ظهور المجموعات والطلاب عند فتح الصفحة

## المشكلة
البيانات كانت تصل من الـBackend بعد `await`، لكن المشروع يعمل بنمط Angular zoneless.
لذلك الـtemplate لم يكن يعيد الرسم فورًا، وكانت البيانات تظهر فقط بعد أول Click مثل "إنشاء مجموعة" أو "إضافة طالب" لأن الـClick نفسه يطلق change detection.

## الإصلاح
تم تعديل ملفين فقط:
- `src/app/features/admin/pages/groups/admin-groups.page.ts`
- `src/app/features/admin/pages/students/admin-students.page.ts`

تم حقن `ChangeDetectorRef` واستدعاء `detectChanges()` بعد اكتمال التحميل غير المتزامن.

## Diagnostics
المجموعات:
- `[AdminGroups] initialize:start`
- `[AdminGroups] backend-data-loaded:check-ok`
- `[AdminGroups] initialize:success`

الطلاب:
- `[AdminStudents] reload:start`
- `[AdminStudents] backend-data-loaded:check-ok`
- `[AdminStudents] initial-render-complete:check-ok`
- `[AdminStudents] reload:success`

## الاختبار
1. افتح `/admin/groups` مباشرة بدون الضغط على إنشاء مجموعة.
2. يجب أن تظهر المجموعات الموجودة في SQL فورًا.
3. افتح `/admin/students` مباشرة بدون الضغط على إضافة طالب.
4. يجب أن يظهر الطلاب الموجودون في SQL فورًا.
5. راقب Console وتأكد أن counts في backend/rendered متطابقة.
