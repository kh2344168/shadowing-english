# إصلاح النشر وظهور المنهج للطالب — 2026-09-20

هذا Patch تراكمي فوق آخر نسخة تحتوي على:
- Backend groups / tab sessions / publish verification
- Curriculum backend + group link

## المشاكل التي يصلحها

1. كان Backend يرجع HTTP 409 عند نشر مجموعة إذا كان Lesson داخل Published Snapshot حالته القديمة `draft` أو `archived`، رغم أن الدرس موجود في SQL وقد يكون منشورًا بالفعل في نسخة أقدم.
2. StudentCourse كان يخفي الدرس مرة ثانية إذا كانت حالته `draft`/`archived` حتى لو كان موجودًا صراحةً داخل Published Snapshot للمجموعة.
3. صفحة الطالب كانت تعتمد على وجود Group في cache محلي مسبقًا؛ على جهاز/Tab جديد قد يكون Session الطالب صحيحًا لكن الـGroup غير موجود محليًا فيظهر المنهج فارغًا.
4. خطأ 409 في Console كان يطبع body مطويًا فقط؛ أضيف `backendMessage` مباشرًا.

## السلوك بعد الإصلاح

- Group Published Snapshot هو بوابة الإظهار النهائية للطالب.
- النشر يفشل فقط إذا Group/Curriculum/Lesson ID المطلوب غير موجود في Backend/SQL.
- `draft` أو `archived` داخل Library يظهر كـ warning في Log ولا يحول النشر إلى 409.
- الطالب يبني Group الخاصة به مباشرة من Backend Session (`groupId/groupName/cefrLevel`) ثم يجلب Published Snapshot.
- لا يحتاج الطالب إلى أن يكون Admin فتح صفحة Groups سابقًا على نفس الجهاز.

## Logs المتوقعة عند الطالب

```text
[StudentCourse] session-group-bootstrap:check-ok
[StudentCourse] student-group-resolved:check-ok
[StudentCourse] published-snapshot-loaded:check-ok
[StudentCourse] refresh-published-course:success
```

داخل `published-snapshot-loaded` راقب:
- `groupId`
- `version`
- `publishedSlots`
- `loadedLessons`
- `missingLessonIds`

## اختبار المجموعة المحددة

إذا الطالب المفروض يكون داخل:

```text
group-1789509814381-3ceeb6ca71bb58
```

شغّل PowerShell قبل التشخيص:

```powershell
$env:SHADOWING_EXPECTED_GROUP_ID='group-1789509814381-3ceeb6ca71bb58'
.\scripts\diagnose-publishing.cmd
```

المطلوب:

```text
[CHECK][STUDENT_GROUP_TARGET][SUCCESS]
[CHECK][PUBLISH_VERIFY][SUCCESS]
[CHECK][STUDENT_VISIBILITY][SUCCESS]
[CHECK][PUBLISH][SUCCESS]
```

إذا ظهر `STUDENT_GROUP_TARGET FAILED` فالنشر قد يكون صحيحًا، لكن الطالب الذي تختبر به موجود في مجموعة أخرى في SQL.

## فحص تم في بيئة ChatGPT

- TypeScript syntax/noCheck: PASS
- C# brace/parenthesis smoke check: PASS
- `dotnet build`: لم يُشغّل لأن .NET SDK غير مثبت في بيئة التنفيذ هنا. شغّله على جهاز المشروع بعد تركيب Patch.

لا توجد Migration جديدة في هذا Patch.
