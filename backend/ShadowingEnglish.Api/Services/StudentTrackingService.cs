using System.Diagnostics;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using ShadowingEnglish.Api.Data;
using ShadowingEnglish.Api.DTOs.Tracking;
using ShadowingEnglish.Api.Models;

namespace ShadowingEnglish.Api.Services;

public sealed class StudentTrackingService(
    AppDbContext dbContext,
    IPasswordHasher<StudentAccountRecord> passwordHasher,
    ILogger<StudentTrackingService> logger)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<IReadOnlyList<LearningGroupDto>> GetGroupsAsync(CancellationToken cancellationToken)
    {
        var timer = Stopwatch.StartNew();
        logger.LogInformation("[TRACKING][GROUPS][START] Loading groups");

        var rows = await dbContext.LearningGroups
            .AsNoTracking()
            .Where(item => item.IsActive)
            .OrderBy(item => item.Name)
            .ToListAsync(cancellationToken);

        logger.LogInformation(
            "[TRACKING][GROUPS][SUCCESS] Loaded {Count} groups in {ElapsedMs}ms",
            rows.Count,
            timer.ElapsedMilliseconds);

        return rows.Select(ToGroupDto).ToArray();
    }

    public async Task<LearningGroupDto> UpsertGroupAsync(
        UpsertLearningGroupRequest request,
        CancellationToken cancellationToken)
    {
        var timer = Stopwatch.StartNew();
        var groupId = request.Id.Trim();
        logger.LogInformation(
            "[TRACKING][GROUP_UPSERT][START] GroupId={GroupId} Name={GroupName} Level={Level}",
            groupId,
            request.Name,
            request.CefrLevel);

        var row = await dbContext.LearningGroups.SingleOrDefaultAsync(
            item => item.Id == groupId,
            cancellationToken);
        var now = DateTime.UtcNow;

        if (row is null)
        {
            row = new LearningGroupRecord
            {
                Id = groupId,
                CreatedAtUtc = now,
            };
            dbContext.LearningGroups.Add(row);
        }

        row.Name = request.Name.Trim();
        row.CefrLevel = NormalizeLevel(request.CefrLevel);
        row.SupervisorId = request.SupervisorId?.Trim() ?? string.Empty;
        row.SupervisorName = request.SupervisorName?.Trim() ?? string.Empty;
        row.CurriculumId = request.CurriculumId?.Trim() ?? string.Empty;
        row.CurriculumName = request.CurriculumName?.Trim() ?? string.Empty;
        row.StartDate = request.StartDate?.Trim() ?? string.Empty;
        row.DraftCurriculumJson = NormalizeJson(request.DraftCurriculumJson);
        row.HasDraftChanges = request.HasDraftChanges;
        row.IsActive = true;
        row.UpdatedAtUtc = now;

        await dbContext.SaveChangesAsync(cancellationToken);
        logger.LogInformation(
            "[TRACKING][GROUP_UPSERT][SUCCESS] GroupId={GroupId} in {ElapsedMs}ms",
            groupId,
            timer.ElapsedMilliseconds);
        return ToGroupDto(row);
    }

    public async Task<IReadOnlyList<StudentDirectoryDto>> GetStudentsAsync(
        CancellationToken cancellationToken)
    {
        var timer = Stopwatch.StartNew();
        logger.LogInformation("[TRACKING][STUDENTS][START] Loading student directory");

        var students = await dbContext.StudentAccounts
            .AsNoTracking()
            .OrderBy(item => item.Name)
            .ToListAsync(cancellationToken);

        var ids = students.Select(item => item.Id).ToArray();
        var progress = await dbContext.StudentProgress
            .AsNoTracking()
            .Where(item => ids.Contains(item.StudentId) && item.IsActive)
            .ToListAsync(cancellationToken);
        var recordings = await dbContext.StudentRecordings
            .AsNoTracking()
            .Where(item => ids.Contains(item.StudentId))
            .GroupBy(item => item.StudentId)
            .Select(group => new { StudentId = group.Key, Count = group.Count() })
            .ToDictionaryAsync(item => item.StudentId, item => item.Count, cancellationToken);
        var eventLastSeen = await dbContext.StudentActivityEvents
            .AsNoTracking()
            .Where(item => ids.Contains(item.StudentId))
            .GroupBy(item => item.StudentId)
            .Select(group => new { StudentId = group.Key, LastSeen = group.Max(item => item.OccurredAtUtc) })
            .ToDictionaryAsync(item => item.StudentId, item => (DateTime?)item.LastSeen, cancellationToken);

        var result = students.Select(student =>
        {
            var rows = progress.Where(item => item.StudentId == student.Id).ToArray();
            var lastSeen = MaxDate(student.LastSeenAtUtc, eventLastSeen.GetValueOrDefault(student.Id));
            return ToDirectoryDto(
                student,
                rows,
                recordings.GetValueOrDefault(student.Id),
                BuildEngagement(lastSeen, rows, Array.Empty<StudentActivityEventRecord>(), 0, 0));
        }).ToArray();

        logger.LogInformation(
            "[TRACKING][STUDENTS][SUCCESS] Loaded {Count} students in {ElapsedMs}ms",
            result.Length,
            timer.ElapsedMilliseconds);
        return result;
    }

    public async Task<CreateStudentResultDto> CreateStudentAsync(
        CreateStudentAccountRequest request,
        CancellationToken cancellationToken)
    {
        var timer = Stopwatch.StartNew();
        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        logger.LogInformation(
            "[TRACKING][STUDENT_CREATE][START] Email={Email} GroupId={GroupId} Level={Level}",
            normalizedEmail,
            request.GroupId,
            request.CefrLevel);

        if (await dbContext.StudentAccounts.AnyAsync(item => item.Email == normalizedEmail, cancellationToken))
        {
            logger.LogWarning("[TRACKING][STUDENT_CREATE][CHECK_FAILED] Duplicate email {Email}", normalizedEmail);
            throw new InvalidOperationException("A student with this email already exists.");
        }

        var targetGroup = await RequireGroupAsync(request.GroupId, cancellationToken);

        var now = DateTime.UtcNow;
        var password = string.IsNullOrWhiteSpace(request.TemporaryPassword)
            ? CreateTemporaryPassword()
            : request.TemporaryPassword.Trim();
        var student = new StudentAccountRecord
        {
            Id = $"student-{Guid.NewGuid():N}",
            Name = request.Name.Trim(),
            Email = normalizedEmail,
            GroupId = targetGroup.Id,
            GroupName = targetGroup.Name,
            CefrLevel = targetGroup.CefrLevel,
            AccountStatus = "active",
            SubscriptionStatus = "active",
            CreatedAtUtc = now,
            UpdatedAtUtc = now,
        };
        student.PasswordHash = passwordHasher.HashPassword(student, password);
        dbContext.StudentAccounts.Add(student);
        await dbContext.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "[TRACKING][STUDENT_CREATE][SUCCESS] StudentId={StudentId} in {ElapsedMs}ms",
            student.Id,
            timer.ElapsedMilliseconds);
        return new CreateStudentResultDto(
            ToDirectoryDto(student, Array.Empty<StudentProgressRecord>(), 0, BuildEngagement(null, [], [], 0, 0)),
            password);
    }

    public async Task<StudentDirectoryDto> ImportLegacyStudentAsync(
        ImportLegacyStudentRequest request,
        CancellationToken cancellationToken)
    {
        var timer = Stopwatch.StartNew();
        var normalizedId = request.Id.Trim();
        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        logger.LogInformation(
            "[TRACKING][LEGACY_STUDENT_IMPORT][START] StudentId={StudentId} Email={Email} GroupId={GroupId}",
            normalizedId,
            normalizedEmail,
            request.GroupId);

        var existing = await dbContext.StudentAccounts
            .SingleOrDefaultAsync(item => item.Id == normalizedId || item.Email == normalizedEmail, cancellationToken);
        if (existing is not null)
        {
            logger.LogInformation(
                "[TRACKING][LEGACY_STUDENT_IMPORT][CHECK_OK] Existing student reused StudentId={StudentId} DurationMs={DurationMs}",
                existing.Id,
                timer.ElapsedMilliseconds);
            return ToDirectoryDto(existing, Array.Empty<StudentProgressRecord>(), 0, BuildEngagement(existing.LastSeenAtUtc, [], [], 0, 0));
        }

        var group = await RequireGroupAsync(request.GroupId, cancellationToken);
        var createdAt = request.CreatedAtUtc ?? DateTime.UtcNow;
        var password = string.IsNullOrWhiteSpace(request.TemporaryPassword) ? "123456" : request.TemporaryPassword.Trim();
        var student = new StudentAccountRecord
        {
            Id = normalizedId,
            Name = request.Name.Trim(),
            Email = normalizedEmail,
            GroupId = group.Id,
            GroupName = group.Name,
            CefrLevel = group.CefrLevel,
            AccountStatus = "active",
            SubscriptionStatus = "active",
            CreatedAtUtc = createdAt,
            UpdatedAtUtc = DateTime.UtcNow,
        };
        student.PasswordHash = passwordHasher.HashPassword(student, password);
        dbContext.StudentAccounts.Add(student);
        await dbContext.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "[TRACKING][LEGACY_STUDENT_IMPORT][SUCCESS] StudentId={StudentId} DurationMs={DurationMs}",
            student.Id,
            timer.ElapsedMilliseconds);
        return ToDirectoryDto(student, Array.Empty<StudentProgressRecord>(), 0, BuildEngagement(null, [], [], 0, 0));
    }

    public async Task<StudentDirectoryDto?> MoveStudentAsync(
        string studentId,
        MoveStudentRequest request,
        CancellationToken cancellationToken)
    {
        var timer = Stopwatch.StartNew();
        logger.LogInformation(
            "[TRACKING][STUDENT_MOVE][START] StudentId={StudentId} TargetGroupId={GroupId}",
            studentId,
            request.GroupId);
        var student = await dbContext.StudentAccounts.SingleOrDefaultAsync(item => item.Id == studentId, cancellationToken);
        if (student is null)
        {
            logger.LogWarning("[TRACKING][STUDENT_MOVE][CHECK_FAILED] StudentId={StudentId} not found", studentId);
            return null;
        }

        var targetGroup = await RequireGroupAsync(request.GroupId, cancellationToken);
        var previousGroupId = student.GroupId;
        var now = DateTime.UtcNow;
        student.GroupId = targetGroup.Id;
        student.GroupName = targetGroup.Name;
        student.CefrLevel = targetGroup.CefrLevel;
        student.UpdatedAtUtc = now;

        var oldProgress = await dbContext.StudentProgress
            .Where(item => item.StudentId == student.Id && item.GroupId != targetGroup.Id && item.IsActive)
            .ToListAsync(cancellationToken);
        foreach (var row in oldProgress)
        {
            row.IsActive = false;
            row.UpdatedAtUtc = now;
        }

        dbContext.StudentActivityEvents.Add(new StudentActivityEventRecord
        {
            CorrelationId = $"student-move-{Guid.NewGuid():N}",
            StudentId = student.Id,
            GroupId = targetGroup.Id,
            EventType = "student_group_moved",
            Status = "success",
            DetailsJson = JsonSerializer.Serialize(new
            {
                fromGroupId = previousGroupId,
                toGroupId = targetGroup.Id,
                toGroupName = targetGroup.Name,
            }, JsonOptions),
            OccurredAtUtc = now,
            CreatedAtUtc = now,
        });

        await dbContext.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "[TRACKING][STUDENT_MOVE][SUCCESS] StudentId={StudentId} OldGroupId={OldGroupId} GroupId={GroupId} DeactivatedProgressRows={ProgressRows} in {ElapsedMs}ms",
            studentId,
            previousGroupId,
            student.GroupId,
            oldProgress.Count,
            timer.ElapsedMilliseconds);
        return ToDirectoryDto(student, Array.Empty<StudentProgressRecord>(), 0, BuildEngagement(student.LastSeenAtUtc, [], [], 0, 0));
    }

    public async Task<StudentDirectoryDto?> UpdateStudentAsync(
        string studentId,
        UpdateStudentAccountRequest request,
        CancellationToken cancellationToken)
    {
        var timer = Stopwatch.StartNew();
        logger.LogInformation(
            "[TRACKING][STUDENT_UPDATE][START] StudentId={StudentId} AccountStatus={AccountStatus} SubscriptionStatus={SubscriptionStatus}",
            studentId,
            request.AccountStatus,
            request.SubscriptionStatus);
        var student = await dbContext.StudentAccounts.SingleOrDefaultAsync(item => item.Id == studentId, cancellationToken);
        if (student is null) return null;

        student.AccountStatus = NormalizeStatus(request.AccountStatus, "active");
        student.SubscriptionStatus = NormalizeStatus(request.SubscriptionStatus, "active");
        student.CefrLevel = NormalizeLevel(request.CefrLevel);
        student.UpdatedAtUtc = DateTime.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "[TRACKING][STUDENT_UPDATE][SUCCESS] StudentId={StudentId} in {ElapsedMs}ms",
            studentId,
            timer.ElapsedMilliseconds);
        return ToDirectoryDto(student, Array.Empty<StudentProgressRecord>(), 0, BuildEngagement(student.LastSeenAtUtc, [], [], 0, 0));
    }

    public async Task<ResetStudentPasswordDto?> ResetPasswordAsync(
        string studentId,
        CancellationToken cancellationToken)
    {
        var timer = Stopwatch.StartNew();
        logger.LogInformation("[TRACKING][PASSWORD_RESET][START] StudentId={StudentId}", studentId);
        var student = await dbContext.StudentAccounts.SingleOrDefaultAsync(item => item.Id == studentId, cancellationToken);
        if (student is null) return null;
        var password = CreateTemporaryPassword();
        student.PasswordHash = passwordHasher.HashPassword(student, password);
        student.UpdatedAtUtc = DateTime.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        logger.LogInformation(
            "[TRACKING][PASSWORD_RESET][SUCCESS] StudentId={StudentId} in {ElapsedMs}ms",
            studentId,
            timer.ElapsedMilliseconds);
        return new ResetStudentPasswordDto(password);
    }

    public async Task<StudentLoginDto?> AuthenticateStudentAsync(
        StudentLoginRequest request,
        CancellationToken cancellationToken)
    {
        var timer = Stopwatch.StartNew();
        var email = request.Email.Trim().ToLowerInvariant();
        logger.LogInformation("[AUTH][STUDENT_LOGIN][START] Email={Email}", email);
        var student = await dbContext.StudentAccounts.SingleOrDefaultAsync(item => item.Email == email, cancellationToken);
        if (student is null)
        {
            logger.LogWarning("[AUTH][STUDENT_LOGIN][CHECK_FAILED] Email not found {Email}", email);
            return null;
        }

        var verification = passwordHasher.VerifyHashedPassword(student, student.PasswordHash, request.Password);
        if (verification == PasswordVerificationResult.Failed)
        {
            logger.LogWarning("[AUTH][STUDENT_LOGIN][CHECK_FAILED] Invalid password for StudentId={StudentId}", student.Id);
            return null;
        }
        if (student.AccountStatus != "active" || student.SubscriptionStatus != "active")
        {
            logger.LogWarning(
                "[AUTH][STUDENT_LOGIN][CHECK_FAILED] Access blocked StudentId={StudentId} Account={AccountStatus} Subscription={SubscriptionStatus}",
                student.Id,
                student.AccountStatus,
                student.SubscriptionStatus);
            return null;
        }

        var loginAt = DateTime.UtcNow;
        student.LastSeenAtUtc = loginAt;
        student.UpdatedAtUtc = loginAt;
        dbContext.StudentActivityEvents.Add(new StudentActivityEventRecord
        {
            CorrelationId = $"login-{Guid.NewGuid():N}",
            StudentId = student.Id,
            GroupId = student.GroupId,
            EventType = "student_login",
            Status = "success",
            DetailsJson = JsonSerializer.Serialize(new { source = "web" }, JsonOptions),
            OccurredAtUtc = loginAt,
            CreatedAtUtc = loginAt,
        });
        await dbContext.SaveChangesAsync(cancellationToken);
        logger.LogInformation(
            "[AUTH][STUDENT_LOGIN][SUCCESS] StudentId={StudentId} GroupId={GroupId} in {ElapsedMs}ms",
            student.Id,
            student.GroupId,
            timer.ElapsedMilliseconds);
        return new StudentLoginDto(
            student.Id,
            student.Name,
            student.Email,
            student.GroupId,
            student.GroupName,
            student.CefrLevel,
            student.AccountStatus,
            student.SubscriptionStatus);
    }

    public async Task<StudentLoginDto?> GetStudentSessionAsync(
        string studentId,
        CancellationToken cancellationToken)
    {
        var timer = Stopwatch.StartNew();
        logger.LogInformation("[AUTH][SESSION][START] StudentId={StudentId}", studentId);
        var student = await dbContext.StudentAccounts
            .AsNoTracking()
            .SingleOrDefaultAsync(item => item.Id == studentId, cancellationToken);
        if (student is null ||
            !string.Equals(student.AccountStatus, "active", StringComparison.OrdinalIgnoreCase) ||
            !string.Equals(student.SubscriptionStatus, "active", StringComparison.OrdinalIgnoreCase))
        {
            logger.LogWarning(
                "[AUTH][SESSION][CHECK_FAILED] StudentId={StudentId} MissingOrInactive=true",
                studentId);
            return null;
        }

        logger.LogInformation(
            "[AUTH][SESSION][SUCCESS] StudentId={StudentId} GroupId={GroupId} DurationMs={DurationMs}",
            student.Id,
            student.GroupId,
            timer.ElapsedMilliseconds);
        return new StudentLoginDto(
            student.Id,
            student.Name,
            student.Email,
            student.GroupId,
            student.GroupName,
            student.CefrLevel,
            student.AccountStatus,
            student.SubscriptionStatus);
    }

    public async Task<StudentActivityEventDto> TrackEventAsync(
        TrackStudentEventRequest request,
        CancellationToken cancellationToken)
    {
        var timer = Stopwatch.StartNew();
        var correlationId = string.IsNullOrWhiteSpace(request.CorrelationId)
            ? Guid.NewGuid().ToString("N")
            : request.CorrelationId.Trim();
        logger.LogInformation(
            "[TRACKING][EVENT][START] CorrelationId={CorrelationId} StudentId={StudentId} Event={EventType} LessonId={LessonId} StageId={StageId}",
            correlationId,
            request.StudentId,
            request.EventType,
            request.LessonId,
            request.StageId);

        var student = await RequireStudentAccountAsync(request.StudentId, request.GroupId, cancellationToken);
        var occurredAt = request.OccurredAtUtc?.ToUniversalTime() ?? DateTime.UtcNow;
        var measuredDurationMs = request.DurationMs;
        if (measuredDurationMs is null && request.EventType.EndsWith("_completed", StringComparison.OrdinalIgnoreCase))
        {
            var openedType = request.EventType.StartsWith("stage_", StringComparison.OrdinalIgnoreCase)
                ? "stage_opened"
                : request.EventType.StartsWith("lesson_", StringComparison.OrdinalIgnoreCase)
                    ? "lesson_opened"
                    : string.Empty;
            if (openedType.Length > 0)
            {
                var openedAt = await dbContext.StudentActivityEvents
                    .AsNoTracking()
                    .Where(item =>
                        item.StudentId == request.StudentId &&
                        item.LessonId == (request.LessonId ?? string.Empty) &&
                        item.StageId == (request.StageId ?? string.Empty) &&
                        item.EventType == openedType &&
                        item.OccurredAtUtc <= occurredAt)
                    .OrderByDescending(item => item.OccurredAtUtc)
                    .Select(item => (DateTime?)item.OccurredAtUtc)
                    .FirstOrDefaultAsync(cancellationToken);
                if (openedAt.HasValue)
                {
                    measuredDurationMs = Math.Max(0, (long)(occurredAt - openedAt.Value).TotalMilliseconds);
                    logger.LogInformation(
                        "[TRACKING][EVENT][CHECK] CorrelationId={CorrelationId} MeasuredDurationMs={DurationMs} OpenedType={OpenedType}",
                        correlationId,
                        measuredDurationMs,
                        openedType);
                }
            }
        }
        var row = new StudentActivityEventRecord
        {
            CorrelationId = correlationId,
            StudentId = request.StudentId.Trim(),
            GroupId = request.GroupId.Trim(),
            LessonId = request.LessonId?.Trim() ?? string.Empty,
            LessonTitle = request.LessonTitle?.Trim() ?? string.Empty,
            CurriculumSlotId = request.CurriculumSlotId?.Trim() ?? string.Empty,
            StageId = request.StageId?.Trim() ?? string.Empty,
            EventType = request.EventType.Trim(),
            Status = NormalizeStatus(request.Status, "success"),
            DetailsJson = NormalizeJson(request.DetailsJson),
            DurationMs = measuredDurationMs,
            OccurredAtUtc = occurredAt,
            CreatedAtUtc = DateTime.UtcNow,
        };
        dbContext.StudentActivityEvents.Add(row);
        student.LastSeenAtUtc = MaxDate(student.LastSeenAtUtc, occurredAt);
        student.UpdatedAtUtc = DateTime.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "[TRACKING][EVENT][SUCCESS] CorrelationId={CorrelationId} EventId={EventId} in {ElapsedMs}ms",
            correlationId,
            row.Id,
            timer.ElapsedMilliseconds);
        return ToEventDto(row);
    }

    public async Task<StudentRecordingDto> SaveRecordingAsync(
        string studentId,
        string groupId,
        string lessonId,
        string lessonTitle,
        string curriculumSlotId,
        string stageId,
        string recordingType,
        string clientRecordingId,
        int attemptNumber,
        long durationMs,
        IFormFile file,
        CancellationToken cancellationToken)
    {
        var timer = Stopwatch.StartNew();
        logger.LogInformation(
            "[TRACKING][RECORDING][START] StudentId={StudentId} LessonId={LessonId} StageId={StageId} ClientId={ClientId} Size={SizeBytes}",
            studentId,
            lessonId,
            stageId,
            clientRecordingId,
            file.Length);

        var existing = await dbContext.StudentRecordings.AsNoTracking().SingleOrDefaultAsync(
            item => item.ClientRecordingId == clientRecordingId,
            cancellationToken);
        if (existing is not null)
        {
            if (!string.Equals(existing.StudentId, studentId, StringComparison.Ordinal))
            {
                logger.LogWarning(
                    "[TRACKING][RECORDING][CHECK_FAILED] ClientId collision ClientId={ClientId} StudentId={StudentId}",
                    clientRecordingId,
                    studentId);
                throw new InvalidOperationException("The recording identifier is already used by another student.");
            }
            logger.LogInformation(
                "[TRACKING][RECORDING][CHECK] Duplicate upload reused ClientId={ClientId} RecordingId={RecordingId}",
                clientRecordingId,
                existing.Id);
            return ToRecordingDto(existing);
        }

        if (file.Length <= 0 || file.Length > 50 * 1024 * 1024)
        {
            logger.LogWarning(
                "[TRACKING][RECORDING][CHECK_FAILED] Invalid size StudentId={StudentId} Size={SizeBytes}",
                studentId,
                file.Length);
            throw new InvalidOperationException("Recording size must be between 1 byte and 50 MB.");
        }
        if (string.IsNullOrWhiteSpace(file.ContentType) || !file.ContentType.StartsWith("audio/", StringComparison.OrdinalIgnoreCase))
        {
            logger.LogWarning(
                "[TRACKING][RECORDING][CHECK_FAILED] Unsupported content type StudentId={StudentId} ContentType={ContentType}",
                studentId,
                file.ContentType);
            throw new InvalidOperationException("Only audio recordings are accepted.");
        }

        _ = await RequireStudentAccountAsync(studentId, groupId, cancellationToken);
        await using var stream = new MemoryStream();
        await file.CopyToAsync(stream, cancellationToken);
        var row = new StudentRecordingRecord
        {
            StudentId = studentId.Trim(),
            GroupId = groupId.Trim(),
            LessonId = lessonId.Trim(),
            LessonTitle = lessonTitle?.Trim() ?? string.Empty,
            CurriculumSlotId = curriculumSlotId?.Trim() ?? string.Empty,
            StageId = stageId?.Trim() ?? string.Empty,
            RecordingType = string.IsNullOrWhiteSpace(recordingType) ? "shadowing" : recordingType.Trim(),
            ClientRecordingId = clientRecordingId.Trim(),
            AttemptNumber = Math.Max(0, attemptNumber),
            DurationMs = Math.Max(0, durationMs),
            FileName = Path.GetFileName(file.FileName),
            ContentType = string.IsNullOrWhiteSpace(file.ContentType) ? "audio/webm" : file.ContentType,
            SizeBytes = file.Length,
            AudioData = stream.ToArray(),
            CreatedAtUtc = DateTime.UtcNow,
        };
        dbContext.StudentRecordings.Add(row);
        var student = await dbContext.StudentAccounts.SingleOrDefaultAsync(item => item.Id == studentId, cancellationToken);
        if (student is not null)
        {
            student.LastSeenAtUtc = row.CreatedAtUtc;
            student.UpdatedAtUtc = row.CreatedAtUtc;
        }
        await dbContext.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "[TRACKING][RECORDING][SUCCESS] RecordingId={RecordingId} StudentId={StudentId} in {ElapsedMs}ms",
            row.Id,
            studentId,
            timer.ElapsedMilliseconds);
        return ToRecordingDto(row);
    }

    public Task<StudentRecordingRecord?> GetRecordingAsync(Guid id, CancellationToken cancellationToken) =>
        dbContext.StudentRecordings.AsNoTracking().SingleOrDefaultAsync(item => item.Id == id, cancellationToken);

    public async Task<bool> DeleteRecordingAsync(Guid id, CancellationToken cancellationToken)
    {
        var timer = Stopwatch.StartNew();
        logger.LogInformation("[TRACKING][RECORDING_DELETE][START] RecordingId={RecordingId}", id);
        var row = await dbContext.StudentRecordings.SingleOrDefaultAsync(item => item.Id == id, cancellationToken);
        if (row is null)
        {
            logger.LogWarning("[TRACKING][RECORDING_DELETE][CHECK_FAILED] RecordingId={RecordingId} not found", id);
            return false;
        }
        dbContext.StudentRecordings.Remove(row);
        await dbContext.SaveChangesAsync(cancellationToken);
        logger.LogInformation(
            "[TRACKING][RECORDING_DELETE][SUCCESS] RecordingId={RecordingId} in {ElapsedMs}ms",
            id,
            timer.ElapsedMilliseconds);
        return true;
    }

    public async Task<bool> DeleteRecordingByClientIdAsync(
        string studentId,
        string clientRecordingId,
        CancellationToken cancellationToken)
    {
        var timer = Stopwatch.StartNew();
        logger.LogInformation(
            "[TRACKING][RECORDING_DELETE_CLIENT][START] StudentId={StudentId} ClientRecordingId={ClientRecordingId}",
            studentId,
            clientRecordingId);
        var row = await dbContext.StudentRecordings.SingleOrDefaultAsync(
            item => item.StudentId == studentId && item.ClientRecordingId == clientRecordingId,
            cancellationToken);
        if (row is null)
        {
            logger.LogWarning(
                "[TRACKING][RECORDING_DELETE_CLIENT][CHECK_FAILED] StudentId={StudentId} ClientRecordingId={ClientRecordingId} not found",
                studentId,
                clientRecordingId);
            return false;
        }

        dbContext.StudentRecordings.Remove(row);
        await dbContext.SaveChangesAsync(cancellationToken);
        logger.LogInformation(
            "[TRACKING][RECORDING_DELETE_CLIENT][SUCCESS] StudentId={StudentId} ClientRecordingId={ClientRecordingId} in {ElapsedMs}ms",
            studentId,
            clientRecordingId,
            timer.ElapsedMilliseconds);
        return true;
    }

    public async Task<StudentEventPageDto?> GetStudentEventsAsync(
        string studentId,
        int skip,
        int take,
        CancellationToken cancellationToken)
    {
        var timer = Stopwatch.StartNew();
        var safeSkip = Math.Max(0, skip);
        var safeTake = Math.Clamp(take, 1, 200);
        logger.LogInformation(
            "[TRACKING][EVENT_PAGE][START] StudentId={StudentId} Skip={Skip} Take={Take}",
            studentId,
            safeSkip,
            safeTake);

        var exists = await dbContext.StudentAccounts.AsNoTracking()
            .AnyAsync(item => item.Id == studentId, cancellationToken);
        if (!exists)
        {
            logger.LogWarning("[TRACKING][EVENT_PAGE][CHECK_FAILED] StudentId={StudentId} not found", studentId);
            return null;
        }

        var query = dbContext.StudentActivityEvents.AsNoTracking()
            .Where(item => item.StudentId == studentId);
        var total = await query.CountAsync(cancellationToken);
        var items = await query
            .OrderByDescending(item => item.OccurredAtUtc)
            .Skip(safeSkip)
            .Take(safeTake)
            .ToListAsync(cancellationToken);

        logger.LogInformation(
            "[TRACKING][EVENT_PAGE][SUCCESS] StudentId={StudentId} Returned={Count} Total={Total} DurationMs={DurationMs}",
            studentId,
            items.Count,
            total,
            timer.ElapsedMilliseconds);
        return new StudentEventPageDto(items.Select(ToEventDto).ToArray(), total, safeSkip, safeTake);
    }

    public async Task<AdminStudentDetailDto?> GetStudentDetailAsync(
        string studentId,
        CancellationToken cancellationToken)
    {
        var timer = Stopwatch.StartNew();
        logger.LogInformation("[TRACKING][STUDENT_DETAIL][START] StudentId={StudentId}", studentId);
        var student = await dbContext.StudentAccounts.AsNoTracking().SingleOrDefaultAsync(item => item.Id == studentId, cancellationToken);
        if (student is null)
        {
            logger.LogWarning("[TRACKING][STUDENT_DETAIL][CHECK_FAILED] StudentId={StudentId} not found", studentId);
            return null;
        }

        var progressRows = await dbContext.StudentProgress.AsNoTracking()
            .Where(item => item.StudentId == studentId && item.IsActive)
            .OrderByDescending(item => item.UpdatedAtUtc)
            .ToListAsync(cancellationToken);
        var eventQuery = dbContext.StudentActivityEvents.AsNoTracking()
            .Where(item => item.StudentId == studentId);
        var totalEventCount = await eventQuery.CountAsync(cancellationToken);
        var events = await eventQuery
            .OrderByDescending(item => item.OccurredAtUtc)
            .Take(100)
            .ToListAsync(cancellationToken);
        // Metadata-only projection: never load every audio blob while opening the admin profile.
        var recordings = await dbContext.StudentRecordings.AsNoTracking()
            .Where(item => item.StudentId == studentId)
            .OrderByDescending(item => item.CreatedAtUtc)
            .Select(item => new StudentRecordingDto(
                item.Id,
                item.ClientRecordingId,
                item.LessonId,
                item.LessonTitle,
                item.CurriculumSlotId,
                item.StageId,
                item.RecordingType,
                item.AttemptNumber,
                item.DurationMs,
                item.FileName,
                item.ContentType,
                item.SizeBytes,
                item.CreatedAtUtc))
            .ToListAsync(cancellationToken);
        var learningRow = await dbContext.StudentLearningStates.AsNoTracking()
            .SingleOrDefaultAsync(item => item.StudentId == studentId && item.GroupId == student.GroupId, cancellationToken);

        var learning = BuildLearningSnapshot(learningRow?.StateJson);
        var lastActivity = MaxDate(
            student.LastSeenAtUtc,
            events.FirstOrDefault()?.OccurredAtUtc,
            progressRows.FirstOrDefault()?.UpdatedAtUtc,
            learningRow?.UpdatedAtUtc);
        var engagement = BuildEngagement(
            lastActivity,
            progressRows,
            events,
            learning.CompletedStages.Count,
            learning.DueReviewCount);
        var directory = ToDirectoryDto(student, progressRows, recordings.Count, engagement);
        var lessonDtos = progressRows.Select(ToLessonDto).ToArray();

        logger.LogInformation(
            "[TRACKING][STUDENT_DETAIL][SUCCESS] StudentId={StudentId} Lessons={Lessons} Events={Events} Recordings={Recordings} in {ElapsedMs}ms",
            studentId,
            lessonDtos.Length,
            events.Count,
            recordings.Count,
            timer.ElapsedMilliseconds);
        return new AdminStudentDetailDto(
            directory,
            engagement,
            lessonDtos,
            learning,
            events.Select(ToEventDto).ToArray(),
            recordings,
            totalEventCount);
    }

    private async Task<LearningGroupRecord> RequireGroupAsync(
        string groupId,
        CancellationToken cancellationToken)
    {
        var normalizedId = groupId.Trim();
        var row = await dbContext.LearningGroups
            .SingleOrDefaultAsync(item => item.Id == normalizedId && item.IsActive, cancellationToken);
        if (row is null)
        {
            logger.LogWarning(
                "[TRACKING][GROUP_REQUIRE][CHECK_FAILED] GroupId={GroupId} does not exist or is inactive",
                normalizedId);
            throw new InvalidOperationException("The target group does not exist in the backend.");
        }

        logger.LogInformation(
            "[TRACKING][GROUP_REQUIRE][CHECK_OK] GroupId={GroupId} Name={GroupName} Level={Level}",
            row.Id,
            row.Name,
            row.CefrLevel);
        return row;
    }

    private async Task<StudentAccountRecord> RequireStudentAccountAsync(
        string studentId,
        string groupId,
        CancellationToken cancellationToken)
    {
        var normalizedStudentId = studentId.Trim();
        var normalizedGroupId = groupId.Trim();
        var row = await dbContext.StudentAccounts.SingleOrDefaultAsync(
            item => item.Id == normalizedStudentId,
            cancellationToken);
        if (row is null)
        {
            logger.LogWarning(
                "[TRACKING][IDENTITY][CHECK_FAILED] StudentId={StudentId} does not exist",
                normalizedStudentId);
            throw new InvalidOperationException("The student account does not exist.");
        }
        if (!string.Equals(row.GroupId, normalizedGroupId, StringComparison.Ordinal))
        {
            logger.LogWarning(
                "[TRACKING][IDENTITY][CHECK_FAILED] StudentId={StudentId} RequestedGroupId={RequestedGroupId} ActualGroupId={ActualGroupId}",
                normalizedStudentId,
                normalizedGroupId,
                row.GroupId);
            throw new InvalidOperationException("The student does not belong to the requested group.");
        }
        if (!string.Equals(row.AccountStatus, "active", StringComparison.OrdinalIgnoreCase) ||
            !string.Equals(row.SubscriptionStatus, "active", StringComparison.OrdinalIgnoreCase))
        {
            logger.LogWarning(
                "[TRACKING][IDENTITY][CHECK_FAILED] StudentId={StudentId} AccountStatus={AccountStatus} SubscriptionStatus={SubscriptionStatus}",
                normalizedStudentId,
                row.AccountStatus,
                row.SubscriptionStatus);
            throw new InvalidOperationException("The student account is not active.");
        }
        return row;
    }

    private static StudentDirectoryDto ToDirectoryDto(
        StudentAccountRecord student,
        IReadOnlyCollection<StudentProgressRecord> progress,
        int recordingCount,
        StudentEngagementDto engagement)
    {
        var total = progress.Count;
        var completed = progress.Count(item => item.RequiredRepetitions > 0 && item.CompletedRepetitions >= item.RequiredRepetitions);
        var required = progress.Sum(item => Math.Max(1, item.RequiredRepetitions));
        var done = progress.Sum(item => Math.Min(item.CompletedRepetitions, Math.Max(1, item.RequiredRepetitions)));
        var percent = required == 0 ? 0 : Math.Min(100, (int)Math.Round(done * 100d / required));
        return new StudentDirectoryDto(
            student.Id,
            student.Name,
            student.Email,
            student.GroupId,
            student.GroupName,
            student.CefrLevel,
            student.AccountStatus,
            student.SubscriptionStatus,
            engagement.Status,
            engagement.Reason,
            percent,
            completed,
            total,
            recordingCount,
            engagement.LastActivityAtUtc,
            student.CreatedAtUtc);
    }

    private static StudentEngagementDto BuildEngagement(
        DateTime? lastActivity,
        IReadOnlyCollection<StudentProgressRecord> progress,
        IReadOnlyCollection<StudentActivityEventRecord> events,
        int completedStages,
        int dueReviews)
    {
        var now = DateTime.UtcNow;
        var eventsLast7 = events.Count(item => item.OccurredAtUtc >= now.AddDays(-7));
        var activeDays = events
            .Where(item => item.OccurredAtUtc >= now.AddDays(-14))
            .Select(item => item.OccurredAtUtc.Date)
            .Distinct()
            .Count();
        if (lastActivity is null)
        {
            return new StudentEngagementDto("not-started", "لم يسجل أي نشاط بعد", null, activeDays, eventsLast7, completedStages, dueReviews);
        }

        var age = now - lastActivity.Value;
        if (age.TotalDays <= 3 && (eventsLast7 > 0 || progress.Any(item => item.CompletedRepetitions > 0)))
        {
            return new StudentEngagementDto("committed", "نشاط حديث خلال آخر 3 أيام", lastActivity, activeDays, eventsLast7, completedStages, dueReviews);
        }
        if (age.TotalDays <= 7)
        {
            return new StudentEngagementDto("needs-attention", "آخر نشاط بين 4 و7 أيام", lastActivity, activeDays, eventsLast7, completedStages, dueReviews);
        }
        return new StudentEngagementDto("not-committed", "لا يوجد نشاط منذ أكثر من 7 أيام", lastActivity, activeDays, eventsLast7, completedStages, dueReviews);
    }

    private static StudentLessonTrackingDto ToLessonDto(StudentProgressRecord row)
    {
        var required = Math.Max(1, row.RequiredRepetitions);
        var completed = Math.Max(0, row.CompletedRepetitions);
        var percent = Math.Min(100, (int)Math.Round(Math.Min(completed, required) * 100d / required));
        var status = completed >= required ? "Completed" : completed > 0 ? "InProgress" : "NotStarted";
        return new StudentLessonTrackingDto(
            row.CurriculumSlotId,
            row.LessonId,
            row.LessonTitle,
            completed,
            required,
            row.RecordingCount,
            percent,
            status,
            row.UpdatedAtUtc);
    }

    private static StudentLearningSnapshotDto BuildLearningSnapshot(string? stateJson)
    {
        if (string.IsNullOrWhiteSpace(stateJson))
        {
            return EmptyLearningSnapshot();
        }

        try
        {
            using var document = JsonDocument.Parse(stateJson);
            var root = document.RootElement;
            var journeyNodes = root.TryGetProperty("journeys", out var journeysNode) && journeysNode.ValueKind == JsonValueKind.Array
                ? journeysNode.EnumerateArray().ToArray()
                : [];
            var reviewNodes = root.TryGetProperty("reviews", out var reviewsNode) && reviewsNode.ValueKind == JsonValueKind.Array
                ? reviewsNode.EnumerateArray().ToArray()
                : [];
            var conversationNodes = root.TryGetProperty("conversations", out var conversationsNode) && conversationsNode.ValueKind == JsonValueKind.Array
                ? conversationsNode.EnumerateArray().ToArray()
                : [];

            var journeys = journeyNodes
                .Select(item => new StudentJourneyDetailDto(
                    ReadString(item, "curriculumSlotId"),
                    ReadString(item, "lessonId"),
                    ReadStringArray(item, "completedStages"),
                    ReadString(item, "currentStage"),
                    ReadNullableDate(item, "startedAt"),
                    ReadNullableDate(item, "updatedAt"),
                    ReadNullableDate(item, "completedAt"),
                    ReadNullableInt(item, "quizScore")))
                .OrderByDescending(item => item.UpdatedAt ?? DateTime.MinValue)
                .ToArray();

            var reviews = reviewNodes
                .Select(item => new StudentReviewDetailDto(
                    ReadString(item, "id"),
                    ReadString(item, "curriculumSlotId"),
                    ReadString(item, "lessonId"),
                    ReadInt(item, "intervalDays"),
                    ReadNullableDate(item, "dueAt"),
                    ReadString(item, "status"),
                    ReadNullableDate(item, "completedAt")))
                .OrderBy(item => item.DueAt ?? DateTime.MaxValue)
                .ToArray();

            var conversations = conversationNodes
                .Select(item => new StudentConversationDetailDto(
                    ReadString(item, "id"),
                    ReadString(item, "curriculumSlotId"),
                    ReadString(item, "lessonId"),
                    ReadNullableDate(item, "completedAt"),
                    ReadInt(item, "totalStudentTurns"),
                    ReadInt(item, "acceptedTurns"),
                    ReadInt(item, "goodAnswers"),
                    ReadInt(item, "correctionCount"),
                    ReadStringArray(item, "usedTargetPhrases")))
                .OrderByDescending(item => item.CompletedAt ?? DateTime.MinValue)
                .ToArray();

            var stages = journeys
                .SelectMany(item => item.CompletedStages)
                .Where(item => item.Length > 0)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray();
            var latest = journeys.FirstOrDefault();
            var dueReviews = reviews.Count(item =>
                string.Equals(item.Status, "scheduled", StringComparison.OrdinalIgnoreCase) &&
                item.DueAt.HasValue &&
                item.DueAt.Value <= DateTime.UtcNow);
            var corrections = conversations.Sum(item => item.CorrectionCount);

            return new StudentLearningSnapshotDto(
                stages,
                latest?.CurrentStage ?? string.Empty,
                latest?.StartedAt,
                latest?.UpdatedAt,
                latest?.CompletedAt,
                latest?.QuizScore,
                reviews.Length,
                dueReviews,
                conversations.Length,
                corrections,
                journeys,
                reviews,
                conversations);
        }
        catch (JsonException)
        {
            return EmptyLearningSnapshot();
        }
    }

    private static StudentLearningSnapshotDto EmptyLearningSnapshot() => new(
        [],
        string.Empty,
        null,
        null,
        null,
        null,
        0,
        0,
        0,
        0,
        [],
        [],
        []);

    private static IReadOnlyList<string> ReadStringArray(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Array
            ? value.EnumerateArray()
                .Where(item => item.ValueKind == JsonValueKind.String)
                .Select(item => item.GetString() ?? string.Empty)
                .Where(item => item.Length > 0)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray()
            : [];

    private static string ReadString(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString() ?? string.Empty
            : string.Empty;
    private static int ReadInt(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.TryGetInt32(out var result) ? result : 0;
    private static int? ReadNullableInt(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.TryGetInt32(out var result) ? result : null;
    private static DateTime ReadDate(JsonElement element, string name) => ReadNullableDate(element, name) ?? DateTime.MinValue;
    private static DateTime? ReadNullableDate(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String && DateTime.TryParse(value.GetString(), out var result)
            ? result.ToUniversalTime()
            : null;

    private static StudentActivityEventDto ToEventDto(StudentActivityEventRecord row) => new(
        row.Id,
        row.CorrelationId,
        row.LessonId,
        row.LessonTitle,
        row.CurriculumSlotId,
        row.StageId,
        row.EventType,
        row.Status,
        row.DetailsJson,
        row.DurationMs,
        row.OccurredAtUtc);

    private static StudentRecordingDto ToRecordingDto(StudentRecordingRecord row) => new(
        row.Id,
        row.ClientRecordingId,
        row.LessonId,
        row.LessonTitle,
        row.CurriculumSlotId,
        row.StageId,
        row.RecordingType,
        row.AttemptNumber,
        row.DurationMs,
        row.FileName,
        row.ContentType,
        row.SizeBytes,
        row.CreatedAtUtc);

    private static LearningGroupDto ToGroupDto(LearningGroupRecord row) => new(
        row.Id,
        row.Name,
        row.CefrLevel,
        row.SupervisorId,
        row.SupervisorName,
        row.CurriculumId,
        row.CurriculumName,
        row.StartDate,
        row.DraftCurriculumJson,
        row.HasDraftChanges,
        row.IsActive,
        row.UpdatedAtUtc);

    private static string NormalizeLevel(string? value)
    {
        var normalized = value?.Trim().ToUpperInvariant() ?? "A1";
        return normalized is "A1" or "A2" or "B1" or "B2" or "C1" or "C2" ? normalized : "A1";
    }

    private static string NormalizeStatus(string? value, string fallback)
    {
        var normalized = value?.Trim().ToLowerInvariant();
        return string.IsNullOrWhiteSpace(normalized) ? fallback : normalized;
    }

    private static string NormalizeJson(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "{}";
        try
        {
            using var document = JsonDocument.Parse(value);
            return JsonSerializer.Serialize(document.RootElement, JsonOptions);
        }
        catch
        {
            return JsonSerializer.Serialize(new { text = value }, JsonOptions);
        }
    }

    private static string CreateTemporaryPassword() => Random.Shared.Next(100000, 999999).ToString();

    private static DateTime? MaxDate(params DateTime?[] values)
    {
        var available = values.Where(value => value.HasValue).Select(value => value!.Value).ToArray();
        return available.Length == 0 ? null : available.Max();
    }
}
