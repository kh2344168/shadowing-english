إصلاح مباشر لخطأ StudentConversationDetailDto.

الطريقة المضمونة:
1) فك الضغط داخل جذر المشروع shadowing-english-app.
2) من PowerShell داخل جذر المشروع شغّل:
   .\apply-and-verify.ps1
3) لازم ترى:
   [DTO-HOTFIX][SUCCESS]
4) بعدها شغّل:
   npm run build

الملف الذي يجب أن يتغير فعليًا:
src/app/core/api/student-tracking-api.models.ts

الحقول المطلوبة:
grammarFocus
vocabularyFocus
strengths
textTurns
voiceTurns
