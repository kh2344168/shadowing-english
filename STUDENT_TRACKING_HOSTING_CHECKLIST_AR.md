# قائمة اختبار متابعة الطالب قبل رفع Shadowing English

## أولًا: إعداد الاستضافة

الأفضل نشر Angular وASP.NET على نفس الدومين لتعمل Cookie بسهولة.

متغيرات Production الأساسية:

```text
ASPNETCORE_ENVIRONMENT=Production
ConnectionStrings__DefaultConnection=<Hosted SQL Server connection string>
```

لو الـFrontend والـAPI على دومينين مختلفين:

```text
Cors__AllowedOrigins__0=https://your-frontend-domain.com
```

### دخول مؤقت للاستضافة التجريبية فقط

في Production حسابات Demo مقفولة افتراضيًا. للاختبار الخاص المؤقت:

```text
DemoAuth__Enabled=true
DemoAuth__Password=<strong-random-password>
```

ثم استخدم:

```text
admin@demo.com
```

بعد إنشاء نظام Admin حقيقي اقفل DemoAuth مرة أخرى.

## ثانيًا: Build

```bash
npm install
npm run build
```

```bash
dotnet restore backend/ShadowingEnglish.Api/ShadowingEnglish.Api.csproj
dotnet build backend/ShadowingEnglish.Api/ShadowingEnglish.Api.csproj
```

## ثالثًا: اختبار End-to-End

### 1. الأدمن

- سجل دخول كأدمن.
- افتح `/admin/groups` وتأكد أن المجموعات ظهرت من Backend.
- افتح `/admin/students`.
- أنشئ طالبًا باسم خالد وحدد المجموعة وA1.
- انسخ كلمة المرور المؤقتة.

### 2. الطالب من جهاز/Incognito مختلف

- سجل دخول ببريد خالد وكلمة المرور.
- تأكد أنه يرى دروس مجموعته المنشورة فقط.
- افتح درسًا.
- افتح كل مرحلة وأجب عن Vocabulary وListen & Type وQuiz.
- نفذ Shadowing وسجل صوتًا.
- نفذ محادثة AI لو مزود AI جاهز.

### 3. الأدمن مرة أخرى

- افتح `/admin/students`.
- يجب ظهور:
  - خالد.
  - المجموعة وA1.
  - آخر نشاط.
  - الالتزام.
  - التقدم وعدد التسجيلات.
- افتح ملف خالد.
- تحقق من:
  - رحلة كل درس.
  - المراحل المكتملة.
  - Quiz والمراجعات والمحادثات.
  - تشغيل التسجيل من السيرفر.
  - Timeline بكل الأحداث.
  - زر تحميل أحداث إضافية عند تجاوز 100 حدث.

### 4. اختبار جهاز ثانٍ

- سجل دخول خالد من جهاز آخر.
- يجب رجوع التقدم من SQL.
- لا يجب ظهور دروس غير منشورة أو خاصة بمجموعة أخرى.

### 5. اختبار الصلاحيات

- حاول فتح `/api/admin/students` بدون Admin: يجب 401/403.
- الطالب يحاول إرسال StudentId أو GroupId مختلفًا: يجب 403.
- الطالب يحاول فتح درس غير منشور لمجموعته: يجب 403.
- الطالب يحاول تعديل درس أو نشر منهج: يجب 403.

## رابعًا: اللوج المتوقع

أمثلة Backend:

```text
[HTTP][START]
[TRACKING][EVENT][START]
[TRACKING][EVENT][CHECK]
[TRACKING][EVENT][SUCCESS]
[TRACKING][RECORDING][START]
[TRACKING][STUDENT_DETAIL][SUCCESS]
[HTTP][SUCCESS] DurationMs=...
```

أمثلة Frontend:

```text
[Auth][START]
[StudentStage][CHECK]
[StudentTrackingApi][SUCCESS]
[AdminStudentDetails][SUCCESS]
```

لا يجب أن يظهر في اللوج:

- Password.
- Temporary Password أثناء API logging.
- API keys.
- Cookie values.
- Base64 أو Audio bytes.

## نقطتان قبل النشر العام

1. **Admin Accounts حقيقية**: النسخة الحالية تصلح Staging باستخدام DemoAuth بكلمة مرور قوية، لكن قبل الإطلاق العام يجب إنشاء Admin/Supervisor accounts في SQL بدل البريد الثابت.
2. **مفاتيح AI في Frontend**: يوجد في المشروع الحالي إعداد قديم يضع مفاتيح مزودي AI داخل `public/server-config.js`. أي مفتاح داخل Frontend يمكن رؤيته. قبل نشر URL عام يجب تدوير هذه المفاتيح ونقل استدعاءات AI للـBackend أو تعطيلها مؤقتًا.
