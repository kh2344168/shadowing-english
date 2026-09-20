# إصلاح HTTP 500 في فحص الذكاء الاصطناعي

تم تعديل مسار فحص AI بحيث لا ينهار `/api/lesson-ai/status?verify=true` بخطأ 500 عند حدوث استثناء غير متوقع أثناء فحص مزود نص أو صور. بدلاً من ذلك ترجع حالة `unavailable` وبداخلها رسالة الخطأ الفعلية لتظهر في واجهة الأدمن.

كما تم تحويل Angular dev proxy من HTTPS المحلي `https://localhost:7128` إلى HTTP المحلي `http://localhost:5017` لتجنب مشاكل شهادة HTTPS المحلية. `run-api.cmd` يشغل المنفذين معاً، لذلك لا يتغير تشغيل المشروع.

وأصبح الـFrontend يعرض نص استجابة الخطأ من الـBackend حتى لو كانت الاستجابة نصية وليست `ProblemDetails` JSON.

## الملفات المعدلة
- `proxy.conf.json`
- `backend/ShadowingEnglish.Api/Services/LessonAiService.cs`
- `src/app/features/lessons/data-access/lesson-ai-api.service.ts`

## التشغيل
1. أغلق نافذتي الـFrontend والـBackend القديمة.
2. شغّل `scripts\\run-api.cmd` وانتظر ظهور Listening on `http://localhost:5017`.
3. شغّل `scripts\\run-frontend.cmd`.
4. افتح صفحة معالجة الدرس من جديد.

إذا كان أحد المفاتيح أو النماذج غير صالح ستظهر الآن رسالة المزود نفسه داخل الصفحة بدلاً من HTTP 500 عام.
