# إصلاح اختفاء الدروس بعد تبديل حساب الطالب/الأدمن

## السبب
بعد تحديثات Student Tracking/Auth أصبح GET /api/lessons يعيد بيانات مختلفة حسب الدور:
- admin: كل الدروس من قاعدة البيانات.
- student: فقط الدروس المنشورة لمجموعته.

لكن LessonRepository كان يحتفظ بأول نتيجة في الذاكرة ويمنع إعادة التحميل بسبب initializedFromDatabase=true.
لذلك لو دخل الطالب أولاً ثم دخل الأدمن في نفس تشغيل Angular، كان الأدمن يرى قائمة الطالب المفلترة بدل كل دروس SQL.
والعكس كان ممكن يعرّض للطالب قائمة الأدمن المخزنة في الذاكرة.

## الإصلاح
- إعادة تحميل الدروس من Backend عند كل Login ناجح.
- تنظيف ذاكرة الدروس عند Logout.
- عدم استخدام LocalStorage أو IndexedDB كـfallback للدروس.
- إضافة Diagnostics:
  - [Lessons] session-reload:start
  - [Lessons] session-cache-cleared:check-ok
  - [Lessons] initialize-from-backend:start
  - [Lessons] backend-result:check-ok
  - [Lessons] initialize-from-backend:success
  - [Lessons] session-reload:success

## المتوقع
- Admin يرى كل الدروس الموجودة في جدول Lessons.
- Student يرى فقط الدروس الموجودة في PublishedSnapshot لمجموعته.
- تبديل الحسابات لا يعيد استخدام قائمة الحساب السابق.

## تحقق سريع
1. سجل خروج بالكامل.
2. سجل Admin.
3. راقب Console: يجب أن يظهر session-reload وlessonCount يساوي عدد دروس SQL.
4. سجل خروج ثم Student.
5. يجب أن يظهر lessonCount يساوي عدد الدروس المنشورة لمجموعة الطالب فقط.
