# Shadowing English — Frontend Complete Preview

نسخة Angular كاملة لتصور المنتج قبل استكمال Backend .NET.

اقرأ أولًا:

- `FRONTEND_COMPLETE_HANDOFF_AR.md`
- `SHADOWING_ENGLISH_MASTER_HANDOFF_AR.txt` إذا كان موجودًا بجانب المشروع.

## التشغيل

```powershell
npm install
npm start
```

## الحسابات التجريبية

- Admin: `admin@demo.com` / `123456`
- Supervisor: `supervisor@demo.com` / `123456`
- Student: `khaled.demo@example.com` / `123456`

## التحقق

```powershell
npm run build
npm test -- --watch=false
```

تم الحفاظ على Lesson Builder وLesson Player وLocal Whisper Automatic Split، مع إضافة صفحات Admin وSupervisor وStudent الجديدة وبيانات Mock محلية.
