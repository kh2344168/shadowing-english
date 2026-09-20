using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using ShadowingEnglish.Api.Auth;
using ShadowingEnglish.Api.Data;
using ShadowingEnglish.Api.Models;
using ShadowingEnglish.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddOpenApi();
builder.Services.AddHttpContextAccessor();
builder.Services.AddSingleton<DatabaseReadinessState>();
builder.Services.AddSingleton<TabSessionTokenService>();
builder.Services
    .AddAuthentication(options =>
    {
        options.DefaultScheme = "ShadowingSmartAuth";
        options.DefaultAuthenticateScheme = "ShadowingSmartAuth";
        options.DefaultChallengeScheme = "ShadowingSmartAuth";
    })
    .AddPolicyScheme("ShadowingSmartAuth", "Per-tab session first, cookie fallback", options =>
    {
        options.ForwardDefaultSelector = context =>
            context.Request.Headers.ContainsKey(TabSessionAuthenticationHandler.HeaderName)
                ? TabSessionAuthenticationHandler.SchemeName
                : CookieAuthenticationDefaults.AuthenticationScheme;
    })
    .AddScheme<AuthenticationSchemeOptions, TabSessionAuthenticationHandler>(
        TabSessionAuthenticationHandler.SchemeName,
        _ => { })
    .AddCookie(CookieAuthenticationDefaults.AuthenticationScheme, options =>
    {
        options.Cookie.Name = "shadowing.session";
        options.Cookie.HttpOnly = true;
        options.Cookie.SameSite = SameSiteMode.Lax;
        options.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
            ? CookieSecurePolicy.SameAsRequest
            : CookieSecurePolicy.Always;
        options.SlidingExpiration = true;
        options.ExpireTimeSpan = TimeSpan.FromHours(12);
        options.Events.OnRedirectToLogin = context =>
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return Task.CompletedTask;
        };
        options.Events.OnRedirectToAccessDenied = context =>
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return Task.CompletedTask;
        };
    });
builder.Services.AddAuthorization();

var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException("Connection string 'DefaultConnection' is missing.");

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(connectionString, sqlServerOptions =>
        sqlServerOptions.EnableRetryOnFailure()));

builder.Services.AddScoped<ProgressService>();
builder.Services.AddScoped<LessonService>();
builder.Services.AddScoped<GroupCurriculumService>();
builder.Services.AddScoped<StudentTrackingService>();
builder.Services.AddScoped<IPasswordHasher<StudentAccountRecord>, PasswordHasher<StudentAccountRecord>>();
builder.Services.AddHttpClient<LessonAiService>(client =>
{
    client.Timeout = TimeSpan.FromMinutes(3);
});

builder.Services.Configure<FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = 262_144_000;
});

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? ["http://localhost:4200", "https://localhost:4200"];

builder.Services.AddCors(options =>
{
    options.AddPolicy("AngularDevelopment", policy =>
    {
        policy
            .WithOrigins(allowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

var app = builder.Build();
var databaseState = app.Services.GetRequiredService<DatabaseReadinessState>();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}
else
{
    app.UseHttpsRedirection();
}

// Apply migrations, but do not make every development API endpoint disappear when
// the local database schema is temporarily broken. Production still fails fast.
using (var scope = app.Services.CreateScope())
{
    var migrationTimer = System.Diagnostics.Stopwatch.StartNew();
    app.Logger.LogInformation("[DB][MIGRATION][START] Applying database migrations");
    try
    {
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await dbContext.Database.MigrateAsync();
        databaseState.MarkReady();
        app.Logger.LogInformation(
            "[DB][MIGRATION][SUCCESS] Database migrations completed in {DurationMs}ms",
            migrationTimer.ElapsedMilliseconds);
    }
    catch (Exception ex)
    {
        databaseState.MarkFailed("MIGRATION_FAILED", ex);
        app.Logger.LogCritical(
            ex,
            "[DB][MIGRATION][ERROR] Database migration failed after {DurationMs}ms. Environment={Environment}",
            migrationTimer.ElapsedMilliseconds,
            app.Environment.EnvironmentName);

        if (!app.Environment.IsDevelopment())
        {
            throw;
        }

        app.Logger.LogWarning(
            "[DB][MIGRATION][DEV_CONTINUE] API stays online for diagnostics and demo auth. DB-dependent routes will return 503 until the database is fixed.");
    }
}

// Seed the explicit local demo student only in Development when DemoAuth is enabled.
// This is intentionally never executed in Production.
if (app.Environment.IsDevelopment() &&
    app.Configuration.GetValue<bool>("DemoAuth:Enabled") &&
    databaseState.IsReady)
{
    using var scope = app.Services.CreateScope();
    var seedTimer = System.Diagnostics.Stopwatch.StartNew();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher<StudentAccountRecord>>();
    app.Logger.LogInformation("[DB][DEMO_SEED][START] Ensuring local demo student exists");
    try
    {
        var group = await db.LearningGroups.OrderBy(item => item.CreatedAtUtc).FirstOrDefaultAsync();
        if (group is null)
        {
            group = new LearningGroupRecord
            {
                Id = "group-demo-a1",
                Name = "A1 Demo Group",
                CefrLevel = "A1",
                SupervisorId = "supervisor-demo",
                SupervisorName = "Supervisor Demo",
                IsActive = true,
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow,
            };
            db.LearningGroups.Add(group);
            app.Logger.LogInformation("[DB][DEMO_SEED][CHECK] Created demo group GroupId={GroupId}", group.Id);
        }

        const string demoEmail = "khaled.demo@example.com";
        var student = await db.StudentAccounts.SingleOrDefaultAsync(item => item.Email == demoEmail);
        if (student is null)
        {
            student = new StudentAccountRecord
            {
                Id = "student-demo-khaled",
                Name = "Khaled Demo",
                Email = demoEmail,
                GroupId = group.Id,
                GroupName = group.Name,
                CefrLevel = group.CefrLevel,
                AccountStatus = "active",
                SubscriptionStatus = "active",
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow,
            };
            student.PasswordHash = hasher.HashPassword(student, "123456");
            db.StudentAccounts.Add(student);
            app.Logger.LogInformation("[DB][DEMO_SEED][CHECK] Created demo student StudentId={StudentId}", student.Id);
        }

        await db.SaveChangesAsync();
        app.Logger.LogInformation(
            "[DB][DEMO_SEED][SUCCESS] Demo student ready Email={Email} GroupId={GroupId} DurationMs={DurationMs}",
            demoEmail,
            student.GroupId,
            seedTimer.ElapsedMilliseconds);
    }
    catch (Exception ex)
    {
        databaseState.MarkFailed("DEMO_SEED_FAILED", ex);
        app.Logger.LogError(
            ex,
            "[DB][DEMO_SEED][ERROR] Demo seed failed after {DurationMs}ms",
            seedTimer.ElapsedMilliseconds);
    }
}

// Correlation + exception diagnostics must be before authentication/authorization so
// authentication failures are visible as well. Passwords/request bodies are never logged.
app.Use(async (context, next) =>
{
    var path = context.Request.Path;
    var correlationId = context.Request.Headers["X-Correlation-ID"].FirstOrDefault()
        ?? Guid.NewGuid().ToString("N");
    context.Response.Headers["X-Correlation-ID"] = correlationId;
    var started = System.Diagnostics.Stopwatch.StartNew();

    var tracked = path.StartsWithSegments("/api");
    if (tracked)
    {
        app.Logger.LogInformation(
            "[HTTP][START] CorrelationId={CorrelationId} Method={Method} Path={Path}",
            correlationId,
            context.Request.Method,
            path);
    }

    try
    {
        await next();
        if (tracked)
        {
            app.Logger.LogInformation(
                "[HTTP][END] CorrelationId={CorrelationId} Status={StatusCode} DurationMs={DurationMs} Path={Path}",
                correlationId,
                context.Response.StatusCode,
                started.ElapsedMilliseconds,
                path);
        }
    }
    catch (Exception ex)
    {
        app.Logger.LogError(
            ex,
            "[HTTP][ERROR] CorrelationId={CorrelationId} DurationMs={DurationMs} Path={Path}",
            correlationId,
            started.ElapsedMilliseconds,
            path);

        if (context.Response.HasStarted)
        {
            throw;
        }

        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsJsonAsync(new
        {
            code = "UNHANDLED_BACKEND_ERROR",
            correlationId,
            message = app.Environment.IsDevelopment() ? ex.Message : "Unexpected backend error.",
            exceptionType = app.Environment.IsDevelopment() ? ex.GetType().Name : null,
        });
    }
});

app.UseCors("AngularDevelopment");
app.UseAuthentication();
app.UseAuthorization();

// When the database is unavailable in Development, return an explicit 503 instead of
// a misleading generic 500. Demo-role login and health remain available for diagnosis.
app.Use(async (context, next) =>
{
    if (databaseState.IsReady)
    {
        await next();
        return;
    }

    var path = context.Request.Path;
    var dbRequired = path.StartsWithSegments("/api/admin") ||
        path.StartsWithSegments("/api/student-tracking") ||
        path.StartsWithSegments("/api/progress") ||
        path.StartsWithSegments("/api/lessons") ||
        path.StartsWithSegments("/api/group-curriculums") ||
        path.StartsWithSegments("/api/lesson-ai") ||
        path.StartsWithSegments("/api/auth/student-login");

    if (!dbRequired)
    {
        await next();
        return;
    }

    var correlationId = context.Response.Headers["X-Correlation-ID"].FirstOrDefault()
        ?? Guid.NewGuid().ToString("N");
    app.Logger.LogWarning(
        "[DB][NOT_READY] CorrelationId={CorrelationId} Path={Path} Code={Code}",
        correlationId,
        path,
        databaseState.ErrorCode);
    context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
    await context.Response.WriteAsJsonAsync(new
    {
        code = "DATABASE_NOT_READY",
        correlationId,
        databaseErrorCode = databaseState.ErrorCode,
        message = app.Environment.IsDevelopment()
            ? databaseState.ErrorMessage
            : "Database is not ready.",
    });
});

// Temporary high-signal tracing for the group publication flow.
app.Use(async (context, next) =>
{
    if (!context.Request.Path.StartsWithSegments("/api/group-curriculums"))
    {
        await next();
        return;
    }

    var startedAt = DateTime.UtcNow;
    app.Logger.LogInformation(
        "[PUBLISH][HTTP] → {Method} {Path}{QueryString}",
        context.Request.Method,
        context.Request.Path,
        context.Request.QueryString);

    try
    {
        await next();
    }
    catch (Exception ex)
    {
        app.Logger.LogError(
            ex,
            "[PUBLISH][HTTP] ✖ Unhandled exception for {Method} {Path}",
            context.Request.Method,
            context.Request.Path);
        throw;
    }
    finally
    {
        var elapsedMs = (DateTime.UtcNow - startedAt).TotalMilliseconds;
        app.Logger.LogInformation(
            "[PUBLISH][HTTP] ← {StatusCode} {Method} {Path} in {ElapsedMs:0} ms",
            context.Response.StatusCode,
            context.Request.Method,
            context.Request.Path,
            elapsedMs);
    }
});

app.UseDefaultFiles();
app.UseStaticFiles();

app.MapGet("/api/health", async (AppDbContext db, DatabaseReadinessState readiness) =>
{
    var timer = System.Diagnostics.Stopwatch.StartNew();
    var canConnect = false;
    string[] pendingMigrations = [];
    string? databaseCheckError = null;
    try
    {
        canConnect = await db.Database.CanConnectAsync();
        if (canConnect)
        {
            pendingMigrations = (await db.Database.GetPendingMigrationsAsync()).ToArray();
        }
    }
    catch (Exception ex)
    {
        databaseCheckError = ex.Message;
    }

    return Results.Ok(new
    {
        api = "ok",
        environment = app.Environment.EnvironmentName,
        database = new
        {
            readiness.IsReady,
            canConnect,
            readiness.ErrorCode,
            errorMessage = app.Environment.IsDevelopment() ? readiness.ErrorMessage : string.Empty,
            databaseCheckError = app.Environment.IsDevelopment() ? databaseCheckError : null,
            pendingMigrations,
        },
        durationMs = timer.ElapsedMilliseconds,
    });
}).AllowAnonymous();

app.MapControllers();
app.MapFallbackToFile("index.html");

app.Run();
