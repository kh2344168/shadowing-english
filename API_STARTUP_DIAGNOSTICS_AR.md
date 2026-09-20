# تشخيص تشغيل الـBackend

إذا ظهر في `diagnose-auth.cmd`:

`Unable to connect to the remote server`

بدون Status Code، فهذا يعني أن المشكلة حدثت **قبل الـAuth**: لا يوجد API يستمع على `localhost:5017`.

## أسرع اختبار

شغّل:

`scripts\start-api-and-diagnose.cmd`

السكريبت يقوم بـ:

1. التأكد من وجود .NET SDK 10.
2. فحص SQL Express ومحاولة تشغيل الخدمة إن كانت متوقفة.
3. التأكد أن port 5017 غير مستخدم من برنامج آخر.
4. تشغيل `dotnet build` قبل تشغيل الـAPI.
5. حفظ كل Startup output في `artifacts\logs\api-startup.log`.
6. الانتظار حتى يبدأ الـAPI فعليًا في الاستماع على 5017.
7. تشغيل Health + Admin login + Khaled login تلقائيًا.

إذا فشل الـBuild أو Startup، لا تبدأ في تعديل Angular أو Auth. اقرأ آخر سطور `artifacts\logs\api-startup.log` لأنها تحتوي السبب الحقيقي.
