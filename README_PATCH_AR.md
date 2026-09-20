# Student Stage / Conversation / Shadowing UX Patch — 2026-09-20

## ما تم إصلاحه

1. **نهاية مرحلة الشادوينج**
   - مودال «برافو عليك» يفتح الآن بعد آخر تكرار فعليًا.
   - إزالة الأرقام الوهمية الثابتة `95%` و`04:32`.
   - عرض متوسط تطابق الكلمات الملتقطة، أفضل تكرار، ووقت الجلسة الحقيقي.
   - حفظ حدث `shadowing_stage_evaluated` في Student Tracking بالتقييم والتكرارات.
   - التقييم موضح أنه Speech Recognition text match وليس Pronunciation/Accent score.

2. **التدقيق في الشادوينج اختياري للطالب أو مطلوب من المدرس**
   - القيمة الافتراضية: `student-request`.
   - الطالب يرى زر «دقق كلامي» ويقرر فتح التدقيق بنفسه.
   - المدرس/الأدمن يستطيع من Content Review اختيار `teacher-required` للمرحلة.
   - التدقيق لا يمنع الانتقال بين الجمل.
   - الانتقال التلقائي لم يعد يشترط تطابق الجملة 100%؛ بعد نهاية نتيجة Speech Recognition ومع التقاط قدر كافٍ من الكلام يمكن الانتقال تلقائيًا.

3. **المحادثة والأدوار**
   - Role-play يطلب اختيار طرف من طرفي الموقف، وليس Agent/Customer إلا لو السيناريو Call Center فعلًا.
   - تعليمات توليد AI أصبحت تطلب استنتاج المشاركين من محتوى الدرس: أصدقاء، نادل/ضيف، موظف متجر/عميل، إلخ، والحفاظ على الأسماء إن كانت موجودة في المصدر.
   - لو Lesson قديم فيه Role واحد فقط، الواجهة تنشئ اختيارًا معاكسًا آمنًا من `studentRole/aiRole` بدل بدء المحادثة دون اختيار.

4. **التصحيح في المحادثة**
   - AI مطلوب منه تسجيل كل خطأ حقيقي في spelling / wrong word / word form / grammar في كل turn.
   - الخطأ الصغير لا يوقف المحادثة، لكنه يظهر في Feedback.
   - تم رفع حد التصحيحات الظاهرة من 5 إلى 12.
   - Feedback الذي يحتوي spelling/grammar يفتح تلقائيًا.

5. **زر الحفظ على الموبايل**
   - أضيف زر Sticky أسفل شاشة Content Review في الموبايل: «حفظ التعديلات والرجوع».
   - Settings drawer للشادوينج يستخدم `100dvh` وsafe-area ويثبت زر حفظ الإعدادات أسفل الهاتف.

## Checks / Logs

ابحث في Console عن:
- `[LessonPlayer TEST] shadowing-completion-modal-open:check-ok`
- `[LessonPlayer TEST] shadowing-repetition-quality-captured`
- `[LessonPlayer TEST] student-speech-finished-auto-advance`
- `[LessonPlayer TEST] speech-review-toggle`

وفي Backend Student Tracking يجب أن يظهر event:
- `shadowing_stage_evaluated`

## اختبار يدوي سريع

1. افتح مرحلة Shadowing وحدد 1 أو 2 تكرار.
2. أنهِ آخر جملة/تكرار.
3. يجب أن يظهر مودال «برافو عليك» مع تقييم حقيقي والمرحلة التالية.
4. أعد المرحلة وافتح «دقق كلامي»؛ أغلِقه وتأكد أن الجمل لا تتوقف على التدقيق.
5. من Admin Content Review اختر `مطلوب من المدرس` وافتح المرحلة كطالب؛ التدقيق يجب أن يظهر بدون ضغط الطالب.
6. افتح AI Conversation Role-play؛ يجب أن ترى طرفين وتختار من ستكون.
7. اكتب جملة بها spelling + grammar errors؛ يجب أن يظهر كلا التصحيحين.
8. من الهاتف افتح مراجعة Shadowing كأدمن؛ زر الحفظ يجب أن يظل ظاهرًا أسفل الشاشة.

## التحقق
- فحص TypeScript syntax/no-check للملفات المعدلة: PASS.
- لم يتم تنفيذ Angular full template build داخل بيئة التسليم؛ شغّل `npm start`/`ng build` على جهاز المشروع كاختبار نهائي.
- لا توجد Migration جديدة؛ الإعداد الجديد محفوظ داخل Activities JSON الحالية.
