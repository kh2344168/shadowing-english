# إصلاح خطأ AI: HTTP 200 مع فشل قراءة الحالة

المشكلة لم تكن أن Backend نجح ثم فشل. Angular كان يطلب `/api/lesson-ai/status` أحيانًا بدون Proxy، فيعيد dev server ملف `index.html` بحالة HTTP 200. وبما أن HttpClient ينتظر JSON، يظهر `HttpErrorResponse` رغم أن الحالة 200.

تم الإصلاح عبر:
- إضافة `proxyConfig: proxy.conf.json` مباشرة إلى `angular.json` تحت `serve.options`، ليعمل الـProxy حتى مع `ng serve` المباشر.
- تبسيط `npm start` إلى `ng serve` لأن إعداد الـProxy أصبح مركزيًا في `angular.json`.
- تحسين رسالة الخطأ لاكتشاف HTML مع HTTP 200 وشرح أن الطلب رجع إلى Angular بدل الـBackend.

الـBackend المتوقع: `http://localhost:5017`.
