# تحديث حفظ الدروس في قاعدة البيانات

هذا التحديث يجعل زر **Save Lesson** يحفظ الدرس فعليًا داخل SQL Server، وليس داخل المتصفح فقط.

## ما يتم حفظه

- اسم الدرس ووصفه وحالته.
- عدد التكرارات المطلوبة.
- ملف الصوت أو الفيديو نفسه داخل SQL Server.
- جميع الجمل بالترتيب.
- وقت بداية ونهاية كل جملة.
- النص الإنجليزي والترجمة العربية.
- سطور السكريبت.
- وقت إنشاء الدرس وآخر تعديل.

## التركيب مرة واحدة

بعد نسخ ملفات التحديث فوق المشروع الحالي، افتح PowerShell داخل:

```text
D:\english projct\shadowing-demo
```

ثم شغّل:

```powershell
.\scripts\setup-lessons-database.cmd
```

يضيف الأمر جدولي `Lessons` و`LessonSegments` إلى قاعدة `ShadowingEnglishMvp` مع الحفاظ على جدول تقدم الطلاب الموجود.

## التشغيل اليومي

نافذة PowerShell أولى:

```powershell
.\scripts\run-api.cmd
```

نافذة PowerShell ثانية:

```powershell
.\scripts\run-frontend.cmd
```

بعد ذلك افتح Lesson Builder، جهز الدرس، ثم اضغط **Save Lesson**. عند نجاح الحفظ ستظهر رسالة:

```text
Lesson saved in the database and added to Lesson Library.
```

الدروس القديمة الموجودة في المتصفح لن تضيع. لنقل أي درس قديم إلى قاعدة البيانات، افتحه من Lesson Library واضغط **Save Lesson** مرة واحدة.

## واجهات الـ API المتاحة

- `GET /api/lessons` — استدعاء كل الدروس.
- `GET /api/lessons/{id}` — استدعاء درس واحد.
- `GET /api/lessons/{id}/media` — استدعاء ملف الصوت أو الفيديو.
- `PUT /api/lessons/{id}` — إنشاء الدرس أو تحديثه.
- `DELETE /api/lessons/{id}` — حذف الدرس.

عند فتح الموقع لاحقًا، يستدعي Angular الدروس من قاعدة البيانات تلقائيًا. وعند فتح درس على جهاز جديد، يتم تنزيل ملفه من الـ API وتخزين نسخة مؤقتة في المتصفح لتشغيله.
