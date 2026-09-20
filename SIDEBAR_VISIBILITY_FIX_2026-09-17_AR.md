# إصلاح ظهور Admin Sidebar — 17 سبتمبر 2026

## المشكلة
الـAdmin Sidebar كان يعتمد على Tailwind `xl` breakpoint (1280px) مع `translate-x-full` عندما `mobileNavOpen = false`.
لذلك عند عرض نافذة أقل من 1280px — بما في ذلك حالات Browser Zoom أو DevTools — كان الـSidebar يختفي افتراضيًا.

## الإصلاح
- فصل منطق ظهور الـSidebar الأساسي عن Tailwind breakpoints.
- من 1024px فما فوق: الـSidebar ظاهر دائمًا بعرض 260px.
- أقل من 1024px: يتحول إلى off-canvas drawer ويُفتح بزر القائمة.
- ضبط مساحة المحتوى والـTopbar تلقائيًا عند ظهور الـSidebar.
- إخفاء mobile backdrop وزر القائمة على الشاشات >= 1024px.

## الملفات المعدلة
- `src/app/layouts/admin-layout/admin-layout.html`
- `src/app/layouts/admin-layout/admin-layout.scss`
