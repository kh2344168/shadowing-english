# تشغيل Shadowing English — Merged MVP V4

## المتطلبات

- .NET SDK 10.
- `dotnet-ef` إصدار 10.
- Node.js وnpm.
- SQL Server Express وخدمة `MSSQL$SQLEXPRESS` في حالة Running.
- شهادة HTTPS للتطوير موثوقة باستخدام `dotnet dev-certs https --trust`.

## تجهيز قاعدة البيانات مرة واحدة

افتح PowerShell داخل جذر المشروع:

```powershell
Set-Location "D:\english projct\shadowing-english-merged-v4"
.\scripts\setup-content-database.cmd
```

المشروع يحتوي Migrations كاملة بالترتيب:

1. `InitialProgressMvp` — جدول تقدم الطالب الأصلي.
2. `AddLessonStorage` — الدروس والجمل وملفات الـMedia.
3. `AddGroupCurriculumStorage` — آخر نسخة منشورة لكل مجموعة.
4. `ImproveProgressSlotLifecycle` — إيقاف Progress للـSlots المحذوفة أو للمجموعة القديمة بدون حذف التاريخ.

لو كانت قاعدة `ShadowingEnglishMvp` الحالية تحتوي Migration الأولى، سيطبق EF Core الثلاثة الباقية فقط.

## التشغيل اليومي

PowerShell أول:

```powershell
.\scripts\run-api.cmd
```

انتظر:

```text
Now listening on: https://localhost:7128
```

وتأكد من:

```text
https://localhost:7128/api/health
```

PowerShell ثانٍ:

```powershell
.\scripts\run-frontend.cmd
```

ثم افتح:

```text
http://localhost:4200
```

ملف تشغيل الواجهة يستخدم `proxy.conf.json` ليوجه `/api` إلى `https://localhost:7128`؛ لذلك شغّل الـAPI أولًا.

## ما أصبح محفوظًا في SQL Server؟

- Lesson metadata.
- Segments والنص والترجمة والتوقيت.
- ملف Audio أو Video نفسه.
- Published Group Curriculum snapshot.
- Student Progress لكل Group وCurriculum Slot.
- Active/Inactive lifecycle لصفوف التقدم بعد الحذف أو النقل أو الاستبدال.

## ما لا يزال محليًا في هذه المرحلة؟

- حسابات الطلاب والمجموعات وCurriculum Templates وGroup Drafts محفوظة أيضًا في Browser Storage.
- تسجيلات الطالب وملفاتها داخل IndexedDB.
- Demo authentication وكلمات المرور المؤقتة ليست Production Authentication.

هذا مقصود في الـMVP. البيانات المشتركة اللازمة لإثبات الفكرة بين المدرس والطالب بدأت تنتقل إلى الـBackend، بينما Auth ورفع Recordings للسيرفر مرحلة لاحقة.

## سيناريو قبول أساسي

1. أنشئ Lesson واحفظها.
2. ضع نفس Lesson في Slot أول بعدد 3 تكرارات وSlot ثانٍ بعدد 10.
3. أضفهما إلى Group Draft.
4. تأكد أن الطالب لا يراهما قبل Publish.
5. اضغط Publish Changes.
6. أكمل 3 تكرارات في الـSlot الأول.
7. تأكد أن الـSlot الأول مكتمل، لكن الـSlot الثاني ما زال مستقلًا ولم يكتمل.
8. انقل Slot إلى Day آخر؛ يجب أن يحتفظ بالتقدم لأن slotId لم يتغير.
9. استبدل Lesson داخل Slot؛ يجب أن يبدأ تقدم هذا الـSlot من الصفر.

## أوامر فحص المطور

```powershell
npm test -- --watch=false
npm run build
dotnet build .\backend\ShadowingEnglish.Api\ShadowingEnglish.Api.csproj
```

## أخطاء شائعة

- `ECONNREFUSED /api/...`: الـAPI غير شغال أو لم يصل إلى `https://localhost:7128`.
- خطأ `cd` في PowerShell: ضع المسار الذي يحتوي مسافات بين `" "` واستخدم `Set-Location`.
- خطأ شهادة HTTPS: شغّل `dotnet dev-certs https --trust` ثم أعد تشغيل المتصفح والـAPI.
- عدم ظهور درس الطالب: تأكد أنه داخل Group Draft ثم تم الضغط على Publish Changes، وأن الطالب داخل نفس المجموعة.
- Microphone على الهاتف عبر HTTP/IP: المتصفحات غالبًا تحتاج Secure Context؛ استخدم HTTPS عند اختبار التسجيل على الهاتف.
