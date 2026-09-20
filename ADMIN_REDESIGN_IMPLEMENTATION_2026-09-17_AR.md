# تنفيذ إعادة تصميم Admin — 17 سبتمبر 2026

## تم في هذه الدفعة

1. استبدال Admin Shell القديم بتصميم موحد قريب من Google Stitch:
   - Sidebar RTL ثابت على الشاشات الكبيرة.
   - Mobile overlay navigation.
   - تقسيم المحتوى / الإدارة / المتابعة / النظام.
   - Workspace: اللغة الإنجليزية.
   - Header + breadcrumb ديناميكي حسب Route.
   - بيانات المستخدم الحالية من AuthService بدون hardcoded admin name.

2. إعادة تصميم صفحة مكتبة الدروس `/admin/lessons`:
   - نفس visual language الخاص بـStitch.
   - Search حقيقي على بيانات الدروس.
   - CEFR filter يعتمد على Conversation config إن وجد؛ لا يتم اختراع مستوى غير موجود.
   - Status filter: جاهز / يحتاج معالجة / مسودة / مؤرشف.
   - Sort: الأحدث / الأقدم / الاسم.
   - Cards جديدة مرتبطة بالبيانات الحقيقية.
   - الحفاظ على Routes الحالية للـBuilder وAI Processing.
   - الحفاظ على Duplicate / Archive / Restore / Delete الآمن.
   - الحفاظ على Import.
   - Empty state وNo-results state.

## قواعد تم الحفاظ عليها

- Stitch مرجع بصري فقط.
- لم يتم نسخ inline JavaScript أو demo data من Stitch.
- لم يتم تغيير LessonRepository أو Backend APIs.
- Backend/SQL يظل Source of Truth.
- لم تتم إضافة JWT أو تغيير DB architecture.

## ملاحظة اختبار

تمت محاولة `npm run build -- --configuration development`، لكن الـZIP لا يحتوي node_modules وAngular CLI غير متاح محليًا (`ng: not found`). تمت محاولة `npm ci` مرتين، لكن تنزيل الاعتماديات انتهى بمهلة بيئة التشغيل قبل اكتماله. لذلك لم يتم الادعاء بنجاح build لم يحدث فعليًا.

## الخطوة التالية

- Lesson Builder
- AI Processing
- Content Review
- Admin Preview
- Curriculums Library + Details
- Groups + Group Details
- Students
- Supervisors
- Subscriptions
- Weekly Summaries
- Reports
- Settings
