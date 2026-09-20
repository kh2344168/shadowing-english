SHADOWING ENGLISH — اقرأ هذا الملف أولًا
النسخة: MERGED MVP V4
التاريخ: 18 يوليو 2026

==================================================
ما هذه النسخة؟
==================================================

هذه ليست Patch منفصلة، وليست Backend ثانيًا.
هذه نسخة مشروع كاملة تجمع:

- تطبيق Angular المرسل كما هو كأساس.
- نفس backend/ShadowingEnglish.Api الحالي.
- نفس قاعدة ShadowingEnglishMvp الحالية.
- كل التعديلات المطلوبة بعد دمجها بدون حذف Features النسخة المرسلة.

يفضّل فك النسخة داخل فولدر جديد، مثل:

D:\english projct\shadowing-english-merged-v4

قاعدة البيانات الحالية لن تُحذف. Migration البداية الموجودة داخل المشروع تحمل نفس المعرّف الذي ظهر عندك:

20260715221116_InitialProgressMvp

وبالتالي سيطبق Entity Framework التحديثات الجديدة فقط إذا كانت Migration البداية مطبقة بالفعل.

==================================================
أول تشغيل خطوة بخطوة
==================================================

1. أوقف نافذتي الـFrontend والـAPI القديمتين.

2. خذ Backup من فولدر مشروعك القديم قبل أي استبدال.

3. فك المشروع في فولدر جديد.

4. افتح PowerShell واكتب المسار بين علامتي تنصيص بسبب وجود مسافة في english projct:

Set-Location "D:\english projct\shadowing-english-merged-v4"

5. جهز أو حدّث قاعدة البيانات مرة واحدة:

.\scripts\setup-content-database.cmd

6. بعد ظهور Database setup completed successfully افتح PowerShell أول وشغّل:

.\scripts\run-api.cmd

7. افتح الرابط التالي وتأكد أن databaseConnected تساوي true:

https://localhost:7128/api/health

8. افتح PowerShell ثانٍ داخل نفس فولدر المشروع وشغّل:

.\scripts\run-frontend.cmd

9. افتح:

http://localhost:4200

مهم: اترك نافذتي الـAPI والـFrontend مفتوحتين أثناء التجربة.

==================================================
ما الذي لا يجب فعله؟
==================================================

- لا تنشئ Backend جديدًا؛ عدّل المشروع الموجود فقط.
- لا تغيّر storage key: english-shadowing-platform-v8 بدون Migration.
- لا تمسح LocalStorage أو IndexedDB كحل عادي لمشكلة درس واحد.
- لا تجعل تعديل Curriculum الأصلية يغيّر مجموعات قديمة تلقائيًا.
- لا تعرض Group Draft للطالب؛ الطالب يرى Published فقط.
- لا تبحث عن Progress بواسطة lessonId فقط؛ المفتاح الحقيقي يتضمن curriculumSlotId.
- لا تعيد كتابة Lesson Builder أو Lesson Player من الصفر.
- لا تنشئ Component ثانية لشاشة موجودة.

==================================================
اختبار سريع بعد التشغيل
==================================================

1. ادخل كمدرس: teacher@demo.com / 123456.
2. افتح Lessons وتأكد من ظهور Import Lesson وCreate Lesson.
3. أنشئ درسًا أو افتح درس Demo واضغط Save Lesson.
4. افتح Groups ثم Curriculum داخل المجموعة.
5. أضف الدرس إلى Draft؛ لا يجب أن يظهر للطالب بعد.
6. اضغط Publish Changes.
7. ادخل كطالب من نفس المجموعة؛ يجب أن يظهر الدرس.
8. أكمل تكرارًا ثم ارجع إلى Teacher Home وتأكد من التقدم.

للتفاصيل الكاملة اقرأ:

- MVP_SETUP_AR.md
- MASTER_REQUIREMENTS_V4_AR.txt
- MERGED_V4_CHANGELOG_AR.txt
