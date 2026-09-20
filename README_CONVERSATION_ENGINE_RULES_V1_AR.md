# Conversation Engine Rules v1 — Shadowing English

هذا الـPatch يطبق قواعد المحادثة التي تم الاتفاق عليها، ولا يحتوي نسخة كاملة من المشروع.

## القواعد الأساسية

1. المحادثة تنتهي بعد **10 ردود مقبولة** من الطالب.
2. Retry لا يحسب ضمن العشرة.
3. لا يوجد خيار "تكمل المحادثة؟" بعد الجولة العاشرة؛ النهاية إلزامية.
4. الجولة العاشرة تنتهي برد طبيعي من الـAI بدون سؤال جديد.
5. الطالب يختار بوضوح بين:
   - 💬 شات: تصحيح spelling + word choice + grammar.
   - 🎙 ريكورد: حفظ الصوت + تحليل transcript + word choice + grammar. لا يتم الادعاء بتقييم accent/pronunciation من Speech Recognition.
6. كل Turn له Feedback وتصحيح؛ الأخطاء الصغيرة لا توقف المحادثة إلا إذا كان الخطأ يؤثر على الهدف/المعنى بدرجة تستدعي Retry.
7. الأدوار تأتي من السيناريو نفسه. Agent/Customer فقط للـCall Center.
8. في نهاية المحادثة يظهر نفس كارت نهاية المراحل الموحد، مع تقرير إضافي:
   - ركز على القواعد.
   - راجع الكلمات.
   - كنت كويس في.
9. ملخص المحادثة يحفظ أيضًا في Backend learning state: textTurns / voiceTurns / grammarFocus / vocabularyFocus / strengths.
10. إعداد الأدمن للمحادثة أصبح يوضح أن العدد ثابت 10 وأن التصحيح بعد كل رد، مع تقرير نهائي.

## مثال النتيجة

- النتيجة: 82% — جيد جدًا
- جولات مكتملة: 10/10
- شات / ريكورد: 4 / 6
- ركز على القواعد: Present Continuous, Prepositions
- راجع الكلمات: went, restaurant, available
- كنت كويس في: أجبت مباشرة، استخدمت target phrase بشكل طبيعي

## Checks / Diagnostics

ابحث في Console عن:
- `[StudentStage] conversation-input-mode`
- `[StudentStage] conversation-turn-limit-reached`
- `[StudentStage] completion-summary-ready`
- `conversation_completed` في StudentActivityEvents

## التحقق المنفذ هنا

- TypeScript syntax/noCheck على الملفات المعدلة: PASS.
- فحص توازن tags للقوالب المعدلة: PASS.
- dotnet build غير متاح في بيئة التنفيذ الحالية، لذلك يجب تشغيله محليًا قبل الدمج/الرفع.

## اختبار يدوي مقترح

1. افتح مرحلة AI Conversation.
2. اختر دورًا من السيناريو إن كان Role Play.
3. أرسل Turn بالشات وتأكد أن رد AI نصي والتصحيح يتعامل مع spelling/grammar.
4. اختر ريكورد وسجل Turn؛ تأكد أن التسجيل محفوظ وأن رد AI صوتي وأن النص يوضح أن التقييم مبني على transcript.
5. اصنع Retry وتأكد أنه لا يزيد عداد accepted turns.
6. أكمل حتى 10 accepted turns.
7. تأكد أن المحادثة تنتهي تلقائيًا ولا يظهر خيار الاستمرار.
8. تأكد أن Bottom Sheet النهائي يعرض القواعد والكلمات ونقاط القوة.
9. افتح Admin Student Details وتأكد أن ملخص المحادثة يحوي طريقة الإجابة ونقاط التركيز بعد المزامنة.
