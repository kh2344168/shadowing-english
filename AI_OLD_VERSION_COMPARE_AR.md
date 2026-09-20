# مقارنة إصلاح الذكاء الاصطناعي مع النسخة القديمة العاملة

تمت مقارنة النسخة القديمة التي كان فيها AI يعمل مع النسخة الحالية ملفًا بملف مع استبعاد build artifacts.

## النتيجة
الملفات المشتركة اختلفت فعليًا في 3 ملفات فقط:

1. `backend/ShadowingEnglish.Api/Services/LessonAiService.cs`
2. `public/server-config.js` (اختلاف مفاتيح/إعدادات التشغيل فقط)
3. `src/app/features/student/student.routes.ts` (غير متعلق بالذكاء الاصطناعي)

الـProxy وController وProgram.cs وواجهة Angular الخاصة بـ lesson-ai متطابقة.

## الفرق المهم في AI
النسخة العاملة القديمة لا ترسل `responseJsonSchema` إلى Gemini مباشرة داخل `generationConfig`.
بدلًا من ذلك تضع JSON schema داخل system instructions وتطلب JSON فقط مع `responseMimeType = application/json`.

النسخة الحالية كانت ترسل:

```csharp
responseMimeType = "application/json",
responseJsonSchema = schema,
```

وتم الآن إرجاع منطق Gemini إلى النسخة القديمة المعروفة بأنها كانت تعمل.

## ملاحظة عن رسالة Backend
رسالة فشل فحص الاتصال لا تنتج من مفاتيح AI وحدها؛ طلب `verify=false` يجب أن يرجع حالة الإعدادات بدون الاتصال بمزود خارجي.
إذا استمرت الرسالة بعد هذا الإصلاح، فهذا يعني أن `/api/lesson-ai/status` نفسه لا يصل إلى الـBackend الصحيح أو أن الـBackend لم يبدأ/تعطل أثناء التشغيل.

