# AI Backend Only Patch — 2026-09-20

هذا التعديل يلغي اتصال Angular المباشر بمزودي AI ويلغي مسارات `/__ai/*`.

المسار الجديد:

`Angular -> /api/lesson-ai/* -> ASP.NET Backend -> Groq / Gemini / Mistral / Pexels`

## مهم أمنيًا قبل نشر النسخة للناس

النسخة القديمة كانت تضع مفاتيح AI داخل `public/server-config.js`، وبالتالي أي مفتاح كان موجودًا هناك يجب اعتباره مكشوفًا. بدّل/Rotate مفاتيح Groq وGemini وMistral وPexels من مواقع المزودين، ثم ضع المفاتيح الجديدة في Azure App Service فقط. لا تضع المفاتيح الجديدة داخل ملفات Angular أو Git.

## Azure App Service > Settings > Environment variables > App settings

أضف القيم التالية (القيمة هي المفتاح الجديد عندك):

- `GROQ_API_KEY`
- `GEMINI_API_KEY`
- `MISTRAL_API_KEY`
- `PEXELS_API_KEY`

اختياريًا لتغيير الموديلات:

- `GROQ_MODEL` = `openai/gpt-oss-120b`
- `GEMINI_MODEL` = `gemini-3.1-flash-lite`
- `MISTRAL_MODEL` = `mistral-small-latest`

ثم اضغط Apply وأعد تشغيل App Service.

## للتشغيل المحلي بدون كشف المفاتيح

من مجلد `backend/ShadowingEnglish.Api` استخدم User Secrets:

```powershell
dotnet user-secrets set "Groq:ApiKey" "YOUR_NEW_KEY"
dotnet user-secrets set "Gemini:ApiKey" "YOUR_NEW_KEY"
dotnet user-secrets set "Mistral:ApiKey" "YOUR_NEW_KEY"
dotnet user-secrets set "Pexels:ApiKey" "YOUR_NEW_KEY"
```

## بعد تركيب التعديل

من جذر المشروع:

```powershell
npm run build
dotnet build .\backend\ShadowingEnglish.Api\ShadowingEnglish.Api.csproj
```

ثم استخدم نفس خطوات Azure ZIP التي استخدمتها سابقًا.

## Logs

Frontend:
- `[LessonAI][START]`
- `[LessonAI][CHECK]`
- `[LessonAI][SUCCESS]`
- `[LessonAI][ERROR]`

Backend:
- `[LessonAI][STRUCTURED][START/SUCCESS/ERROR]`
- `[LessonAI][PROVIDER][START/CHECK/SUCCESS/ERROR]`

لا يتم تسجيل API keys أو محتوى الأسرار.
