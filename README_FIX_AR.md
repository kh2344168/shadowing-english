# Fix: Backend Build CS0428

الخطأ كان في `backend/ShadowingEnglish.Api/Program.cs` السطر الخاص بسياسة Cookie SecurePolicy.

قبل:
```csharp
options.Cookie.SecurePolicy = builder.Environment.IsDevelopment
```

بعد:
```csharp
options.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
```

السبب: `IsDevelopment` هي method وليست property، وعدم استدعائها بالأقواس كان يمنع الـBackend بالكامل من الـBuild ويؤدي لاحقًا إلى `ECONNREFUSED` من Angular proxy.

## بعد تركيب التعديل
شغّل:

```bat
scripts\start-api-and-diagnose.cmd
```

أو:

```bat
scripts\run-api.cmd
```

ثم افتح:

```text
http://localhost:5017/api/health
```
