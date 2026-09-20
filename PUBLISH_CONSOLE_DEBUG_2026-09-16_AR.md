# تشخيص نشر المجموعة في الـConsole

تمت إضافة tracing واضح لمسار نشر Group Curriculum فقط.

## Browser DevTools Console
ابحث عن `[PUBLISH]`. سترى:
- ضغط زر النشر وحالة المجموعة قبل الطلب.
- الـDraft والـslot IDs قبل الإرسال.
- PUT request/response/error.
- GET read-back request/response/error.
- مقارنة version والـslots.
- نجاح أو فشل نهائي مع body الخطأ القادم من الـBackend.

## run-api.cmd
ابحث عن `[PUBLISH]`. سترى:
- دخول PUT/GET إلى ASP.NET.
- نتيجة validation.
- القراءة من قاعدة البيانات.
- version القديم والجديد وعدد slots.
- SaveChanges والـcommit.
- مزامنة StudentProgress.
- HTTP status النهائي ومدة الطلب.

هذه الإضافة تشخيصية ومقصودة لتحديد مكان توقف النشر بدل إخفاء الاستثناءات.
