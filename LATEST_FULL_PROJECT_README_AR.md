# Shadowing English - Latest Full Project

هذه نسخة كاملة مجمعة من أحدث حالة للمشروع، وتشمل آخر تعديلات:
- Admin redesign + sidebar fix
- Student knowledge bank + report + PDF + AI context
- Student learning backend persistence
- Hosted lessons/server-only source of truth
- Student tracking/admin monitoring backend
- Student recordings metadata/audio backend flow
- Auth HTTP 500 diagnostics + database readiness + health endpoint

## التشغيل
Frontend:
```bash
npm install
npm start
```

Backend:
```bash
scripts\run-api.cmd
```

ثم التشخيص:
```bash
scripts\diagnose-auth.cmd
```

Health endpoint:
`http://localhost:5017/api/health`
