# إصلاح انتقال بطاقات Vocabulary - 2026-09-16

## المشكلة
بعد الضغط على «عارف» أو «التالي» كانت البطاقة الأولى تعمل حركة الخروج، لكن البطاقة التالية لا تظهر.

## السبب
تغيير `activeIndex` وإنهاء حالة الـ animation يحدثان داخل `window.setTimeout`. في وضع Angular zoneless الحالي لا يكفي تغيير property داخل الـ timeout لتحديث القالب تلقائيًا. لذلك ظل عنصر البطاقة محتفظًا بحالة animation الخروج (`forwards`, opacity 0)، بينما تغيرت البيانات داخليًا فقط.

## الإصلاح
- إجبار `ChangeDetectorRef.detectChanges()` فور تغيير `activeIndex` إلى البطاقة التالية.
- إجبار refresh آخر بعد انتهاء animation الدخول وإرجاع الحالة إلى `idle`.
- تنظيف timer قبل الانتقال للمرحلة التالية عند آخر بطاقة.
- إضافة `data-card-index` و `data-card-term` على عنصر البطاقة لتسهيل تشخيص DevTools بدون تغيير التصميم.

## الملفات المعدلة
- `src/app/features/student/pages/lesson-stage/student-lesson-stage.page.ts`
- `src/app/features/student/pages/lesson-stage/student-lesson-stage.page.html`
