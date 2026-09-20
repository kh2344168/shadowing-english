# إعادة تصميم Admin — النسخة الكاملة — 17 سبتمبر 2026

تم دمج نظام التصميم النهائي المستند إلى Google Stitch داخل مشروع Angular الحالي مع الحفاظ على الـbusiness logic والـBackend APIs الحالية.

## الشاشات المنفذة

1. مكتبة الدروس `/admin/lessons`
2. منشئ الدرس `/admin/lessons/builder`
3. معالجة محتوى الدرس بالذكاء الاصطناعي `/admin/lessons/:lessonId/processing`
4. مراجعة محتوى الدرس `/admin/lessons/:lessonId/content-review`
5. معاينة الدرس كطالب `/admin/lessons/:lessonId/preview-shadowing/:stageId`
6. مكتبة المناهج `/admin/curriculums`
7. تفاصيل المنهج `/admin/curriculums/:curriculumId`
8. المجموعات `/admin/groups`
9. تفاصيل المجموعة `/admin/groups/:groupId`
10. الطلاب `/admin/students`
11. المشرفون `/admin/supervisors`
12. الاشتراكات `/admin/subscriptions`
13. الملخصات الأسبوعية `/admin/weekly-summaries`
14. التقارير `/admin/reports`
15. الإعدادات `/admin/settings`

## ما تم الحفاظ عليه

- LessonRepository والـBackend APIs الحالية.
- Duplicate / Archive / Restore / Delete للدروس.
- AI Processing ثم Content Review بدون نشر تلقائي.
- Curriculum editing وربط الدروس بالأسابيع والأيام.
- Group draft/publish flow والنشر من المجموعة فقط.
- Student/subscription/supervisor/weekly-summary actions الموجودة.
- Student preview والـShadowing logic الحالي.
- Backend/SQL كمصدر الحقيقة الرئيسي.

## قواعد التصميم

- RTL عربي موحد.
- Admin shell مشترك: Sidebar + Header + Breadcrumb + Workspace.
- Search/filters حسب الحاجة.
- CEFR يظهر من بيانات حقيقية فقط؛ لا يتم اختراع مستوى غير موجود.
- لا توجد fake AI metrics أو pronunciation scores أو server status.
- لا توجد أسماء نماذج AI تقنية داخل واجهة الأدمن.
- Stitch تم استخدامه كمرجع بصري فقط، ولم يتم نسخ inline JavaScript أو demo data كـbusiness logic.

## التحقق

تم فحص Routes الأساسية وملفات الشاشات والتأكد من عدم وجود النصوص/المؤشرات الوهمية التي تم رفضها سابقًا.

تعذر تنفيذ Angular build النهائي داخل بيئة التسليم لأن تثبيت npm dependencies لم يكتمل بسبب timeout في الوصول إلى npm registry، و`node_modules/.bin/ng` غير متاح. لذلك لم يتم الادعاء بنجاح build غير منفذ.

على الجهاز المحلي شغّل:

```bash
npm install
npm run build
```

ثم شغّل المشروع واختبر عمليات الحفظ والنشر والحذف يدويًا مع الـBackend.
