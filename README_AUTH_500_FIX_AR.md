# إصلاح Auth HTTP 500 — Shadowing English

## التشخيص من اللوج

ظهر 500 في ثلاث نقاط:
- `GET /api/auth/session`
- `POST /api/auth/demo-login`
- `POST /api/auth/student-login`

أهم دليل: `demo-login` لا يحتاج قاعدة البيانات أصلًا، لذلك رجوع 500 منه يشير غالبًا إلى أن الـBackend نفسه غير متاح بصورة سليمة أو أنه توقف أثناء Startup/Migration، وليس إلى خطأ في البريد أو كلمة المرور.

## ما الذي تم إصلاحه؟

1. **الـAPI لا يختفي بالكامل في Development لو الـMigration فشلت.**
   - يسجل `[DB][MIGRATION][ERROR]` بالتفصيل.
   - يظل `/api/health` وDemo Auth متاحين للتشخيص.
   - الـAPIs التي تحتاج SQL ترجع `503 DATABASE_NOT_READY` بدل 500 مبهم.
   - Production يظل Fail Fast لو الـMigration فشلت.

2. **الـMigrations الجديدة أصبحت idempotent.**
   - `RecordingCount` لا يُضاف إذا كان موجودًا.
   - جداول Student Tracking لا تُنشأ إذا كانت موجودة.
   - الـIndexes لا يعاد إنشاؤها لو كانت موجودة.
   - هذا يعالج قواعد البيانات التي وصلتها تعديلات جزئية سابقًا.

3. **Seed لحساب خالد في Development فقط.**
   عند `DemoAuth:Enabled=true` وبعد نجاح SQL، السيرفر يضمن وجود:
   - Email: `khaled.demo@example.com`
   - Password: `123456`
   - Level: A1
   - Account: active
   - Subscription: active

4. **Endpoint تشخيص جديد:**
   - `GET http://localhost:5017/api/health`
   - يعرض API status + DB connection + migration readiness + pending migrations.

5. **Logging أعلى إشارة.**
   كل طلب `/api` أصبح له:
   - START
   - END / ERROR
   - HTTP status
   - DurationMs
   - CorrelationId
   بدون Request Body أو Password أو Audio bytes.

6. **Frontend يعرض سبب أوضح.**
   - Backend غير متاح.
   - Database not ready.
   - HTTP 500 مع Correlation ID.
   - 401 credentials.

## التركيب

فك الـZIP داخل جذر المشروع ثم وافق على Replace/Merge.

بعدها:

1. أغلق Backend وAngular إن كانا مفتوحين.
2. شغّل:
   `scripts\run-api.cmd`
3. في نافذة الـBackend ابحث عن:
   - `[DB][MIGRATION][SUCCESS]`
   - `[DB][DEMO_SEED][SUCCESS]`
   - `Now listening on: http://localhost:5017`
4. افتح في المتصفح:
   `http://localhost:5017/api/health`
5. أو شغّل:
   `scripts\diagnose-auth.cmd`
6. بعدها شغّل Angular وجرب:
   - `admin@demo.com / 123456`
   - `khaled.demo@example.com / 123456`

## النتيجة المتوقعة

لو SQL تعمل:
- `/api/health` => 200 و`IsReady=true`
- Admin demo login => 200
- Khaled login => 200

لو SQL أو Migration فيها مشكلة:
- `/api/health` يوضح السبب.
- Admin demo login يظل يعمل في Development.
- Student login => 503 `DATABASE_NOT_READY` بدل 500 غير مفهوم.

## ملاحظة Build

لم يتوفر .NET SDK داخل بيئة التنفيذ الحالية لتشغيل `dotnet build`، ونسخة `node_modules` الموجودة هنا لا تحتوي Angular CLI، لذلك يلزم تشغيل Build على جهاز المشروع بعد تركيب الـPatch.
