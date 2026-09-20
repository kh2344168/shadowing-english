using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using ShadowingEnglish.Api.Data;
using ShadowingEnglish.Api.DTOs.Curriculums;
using ShadowingEnglish.Api.Models;

namespace ShadowingEnglish.Api.Services;

public sealed class GroupCurriculumService(
    AppDbContext dbContext,
    ILogger<GroupCurriculumService> logger)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<GroupCurriculumSnapshotDto?> GetPublishedAsync(
        string groupId,
        CancellationToken cancellationToken)
    {
        logger.LogInformation("[PUBLISH][DB][GET] Looking up published snapshot for group {GroupId}.", groupId);
        var json = await dbContext.GroupCurriculumPublications
            .AsNoTracking()
            .Where(item => item.GroupId == groupId)
            .Select(item => item.PublishedSnapshotJson)
            .SingleOrDefaultAsync(cancellationToken);

        if (string.IsNullOrWhiteSpace(json))
        {
            logger.LogWarning("[PUBLISH][DB][GET] No row/snapshot for group {GroupId}.", groupId);
            return null;
        }

        var snapshot = DeserializeSnapshot(json);
        logger.LogInformation(
            "[PUBLISH][DB][GET] Deserialized group {GroupId}: Version={Version}, Slots={SlotCount}.",
            groupId,
            snapshot?.Version,
            snapshot is null ? 0 : CountSlots(snapshot));
        return snapshot;
    }

    public async Task<GroupCurriculumSnapshotDto> PublishAsync(
        string groupId,
        PublishGroupCurriculumRequest request,
        CancellationToken cancellationToken)
    {
        logger.LogInformation(
            "[PUBLISH][DB][PUT] Begin. Group={GroupId}, IncomingVersion={Version}, IncomingSlots={SlotCount}.",
            groupId,
            request.Snapshot?.Version,
            request.Snapshot is null ? 0 : CountSlots(request.Snapshot));

        var groupRow = await dbContext.LearningGroups
            .SingleOrDefaultAsync(item => item.Id == groupId && item.IsActive, cancellationToken);
        if (groupRow is null)
        {
            logger.LogWarning("[PUBLISH][CHECK_FAILED] Group {GroupId} does not exist in LearningGroups.", groupId);
            throw new InvalidOperationException("The group must exist in the backend before publishing.");
        }

        var sourceCurriculumId = request.Snapshot?.SourceCurriculumId?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(sourceCurriculumId) ||
            !await dbContext.Curriculums.AsNoTracking().AnyAsync(item => item.Id == sourceCurriculumId, cancellationToken))
        {
            logger.LogWarning(
                "[PUBLISH][CURRICULUM][CHECK_FAILED] Group={GroupId} CurriculumId={CurriculumId} Reason=curriculum_not_found",
                groupId,
                sourceCurriculumId);
            throw new InvalidOperationException("The source curriculum must exist in the backend before publishing.");
        }
        logger.LogInformation(
            "[PUBLISH][CURRICULUM][CHECK_OK] Group={GroupId} CurriculumId={CurriculumId}",
            groupId,
            sourceCurriculumId);

        await ValidatePublishedLessonsAsync(request.Snapshot!, cancellationToken);

        var publication = await dbContext.GroupCurriculumPublications
            .SingleOrDefaultAsync(item => item.GroupId == groupId, cancellationToken);

        logger.LogInformation(
            "[PUBLISH][DB][PUT] Existing publication: {Exists}, ExistingVersion={ExistingVersion}.",
            publication is not null,
            publication?.Version);

        // PUT /published is an explicit publish command. Never ignore the incoming
        // curriculum just because the browser has an older local version number. The
        // server owns the publication version and always advances it monotonically.
        var now = DateTime.UtcNow;
        var nextVersion = publication is null
            ? Math.Max(request.Snapshot!.Version, 1)
            : publication.Version + 1;
        var normalizedSnapshot = NormalizeSnapshot(request.Snapshot!, nextVersion, now);
        var isNewPublication = publication is null;
        logger.LogInformation(
            "[PUBLISH][DB][PUT] Normalized snapshot. ServerVersion={Version}, Slots={SlotCount}, IsNew={IsNew}.",
            normalizedSnapshot.Version,
            CountSlots(normalizedSnapshot),
            isNewPublication);

        if (publication is null)
        {
            publication = new GroupCurriculumPublicationRecord
            {
                GroupId = groupId,
            };
            dbContext.GroupCurriculumPublications.Add(publication);
        }

        ApplyPublication(publication, request.GroupName, normalizedSnapshot, now);
        groupRow.Name = request.GroupName.Trim();
        groupRow.CurriculumId = normalizedSnapshot.SourceCurriculumId;
        groupRow.CurriculumName = normalizedSnapshot.SourceCurriculumName;
        groupRow.DraftCurriculumJson = JsonSerializer.Serialize(normalizedSnapshot, JsonOptions);
        groupRow.HasDraftChanges = false;
        groupRow.UpdatedAtUtc = now;

        // Persist the published snapshot first. Publishing the curriculum is the
        // authoritative operation; student-progress synchronization is secondary and
        // must never make a successfully published curriculum look like a failure.
        try
        {
            logger.LogInformation("[PUBLISH][DB][PUT] Saving publication row for group {GroupId}...", groupId);
            await dbContext.SaveChangesAsync(cancellationToken);
            logger.LogInformation(
                "[PUBLISH][DB][PUT] Publication row committed. Group={GroupId}, Version={Version}.",
                groupId,
                normalizedSnapshot.Version);
        }
        catch (DbUpdateException ex) when (isNewPublication)
        {
            logger.LogWarning(ex, "[PUBLISH][DB][PUT] Insert race detected for group {GroupId}; retrying as update.", groupId);
            // A second browser/tab may have created the publication between the read
            // and insert. Reload it and update the existing row instead.
            dbContext.ChangeTracker.Clear();
            publication = await dbContext.GroupCurriculumPublications
                .SingleOrDefaultAsync(item => item.GroupId == groupId, cancellationToken);

            if (publication is null)
            {
                throw;
            }

            groupRow = await dbContext.LearningGroups
                .SingleOrDefaultAsync(item => item.Id == groupId && item.IsActive, cancellationToken)
                ?? throw new InvalidOperationException("The group disappeared while retrying publication.");

            now = DateTime.UtcNow;
            nextVersion = publication.Version + 1;
            normalizedSnapshot = NormalizeSnapshot(request.Snapshot!, nextVersion, now);
            ApplyPublication(publication, request.GroupName, normalizedSnapshot, now);
            groupRow.Name = request.GroupName.Trim();
            groupRow.CurriculumId = normalizedSnapshot.SourceCurriculumId;
            groupRow.CurriculumName = normalizedSnapshot.SourceCurriculumName;
            groupRow.DraftCurriculumJson = JsonSerializer.Serialize(normalizedSnapshot, JsonOptions);
            groupRow.HasDraftChanges = false;
            groupRow.UpdatedAtUtc = now;
            logger.LogInformation(
                "[PUBLISH][DB][RETRY][CHECK_OK] Reloaded group metadata row {GroupId} before retry save.",
                groupId);
            await dbContext.SaveChangesAsync(cancellationToken);
            logger.LogInformation("[PUBLISH][DB][PUT] Retry update committed for group {GroupId}, version {Version}.", groupId, normalizedSnapshot.Version);
        }

        // Progress rows are a convenience cache/lifecycle aid. If an older database
        // has a progress-schema issue, keep the published snapshot intact and log the
        // secondary failure instead of returning HTTP 500 for the publish operation.
        try
        {
            logger.LogInformation("[PUBLISH][PROGRESS] Sync starting for group {GroupId}.", groupId);
            await SyncProgressActivityAsync(
                groupId,
                normalizedSnapshot,
                cancellationToken);
            await dbContext.SaveChangesAsync(cancellationToken);
            logger.LogInformation("[PUBLISH][PROGRESS] Sync completed for group {GroupId}.", groupId);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(
                ex,
                "Published group curriculum {GroupId} version {Version}, but progress synchronization failed.",
                groupId,
                normalizedSnapshot.Version);

            // Discard failed progress mutations from this scoped DbContext. The
            // publication was already committed by the previous SaveChanges call.
            dbContext.ChangeTracker.Clear();
        }

        logger.LogInformation(
            "[PUBLISH][DB][PUT] ✅ Publish service complete. Group={GroupId}, Version={Version}, Slots={SlotCount}.",
            groupId,
            normalizedSnapshot.Version,
            CountSlots(normalizedSnapshot));
        return normalizedSnapshot;
    }

    private async Task ValidatePublishedLessonsAsync(
        GroupCurriculumSnapshotDto snapshot,
        CancellationToken cancellationToken)
    {
        var lessonIds = (snapshot.Weeks ?? Array.Empty<CurriculumWeekDto>())
            .SelectMany(week => week.Days ?? Array.Empty<CurriculumDayDto>())
            .SelectMany(day => day.LessonSlots ?? Array.Empty<CurriculumLessonSlotDto>())
            .Select(slot => slot.LessonId.Trim())
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        if (lessonIds.Length == 0)
        {
            logger.LogInformation("[PUBLISH][LESSONS][CHECK_OK] Snapshot contains no lesson slots.");
            return;
        }

        var lessons = await dbContext.Lessons
            .AsNoTracking()
            .Where(item => lessonIds.Contains(item.Id))
            .Select(item => new { item.Id, item.Status })
            .ToListAsync(cancellationToken);
        var found = lessons.Select(item => item.Id).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var missing = lessonIds.Where(id => !found.Contains(id)).ToArray();
        if (missing.Length > 0)
        {
            logger.LogWarning(
                "[PUBLISH][LESSONS][CHECK_FAILED] Missing lesson ids: {LessonIds}",
                string.Join(",", missing));
            throw new InvalidOperationException($"Cannot publish: {missing.Length} lesson(s) do not exist in the database.");
        }

        var statusWarnings = lessons
            .Where(item => string.Equals(item.Status, "draft", StringComparison.OrdinalIgnoreCase) ||
                           string.Equals(item.Status, "archived", StringComparison.OrdinalIgnoreCase))
            .Select(item => new { item.Id, item.Status })
            .ToArray();
        if (statusWarnings.Length > 0)
        {
            // Group publication is the final exposure gate in this MVP. A lesson may
            // still carry a legacy library status (draft/archived) while already being
            // referenced by an existing published group snapshot. Do not turn that
            // metadata mismatch into a 409. Missing lesson rows are still a hard error.
            logger.LogWarning(
                "[PUBLISH][LESSONS][STATUS_WARNING] Group publication contains {Count} lesson(s) with legacy draft/archived status: {Lessons}",
                statusWarnings.Length,
                string.Join(",", statusWarnings.Select(item => $"{item.Id}:{item.Status}")));
        }

        logger.LogInformation(
            "[PUBLISH][LESSONS][CHECK_OK] Verified {LessonCount} lesson references. StatusWarnings={StatusWarningCount}.",
            lessonIds.Length,
            statusWarnings.Length);
    }

    public async Task<GroupPublicationVerificationDto> VerifyPublishedAsync(
        string groupId,
        CancellationToken cancellationToken)
    {
        var timer = System.Diagnostics.Stopwatch.StartNew();
        logger.LogInformation("[PUBLISH][VERIFY][START] GroupId={GroupId}", groupId);
        var snapshot = await GetPublishedAsync(groupId, cancellationToken);
        if (snapshot is null)
        {
            logger.LogWarning("[PUBLISH][VERIFY][CHECK_FAILED] No publication GroupId={GroupId}", groupId);
            return new GroupPublicationVerificationDto(groupId, false, 0, 0, 0, [], [], DateTime.UtcNow);
        }

        var ids = snapshot.Weeks
            .SelectMany(week => week.Days)
            .SelectMany(day => day.LessonSlots)
            .Select(slot => slot.LessonId)
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct(StringComparer.Ordinal)
            .ToArray();
        var lessons = await dbContext.Lessons
            .AsNoTracking()
            .Where(item => ids.Contains(item.Id))
            .Select(item => new { item.Id, item.Status })
            .ToListAsync(cancellationToken);
        var existing = lessons.Select(item => item.Id).ToHashSet(StringComparer.Ordinal);
        var missing = ids.Where(id => !existing.Contains(id)).ToArray();
        var unavailable = lessons
            .Where(item => string.Equals(item.Status, "draft", StringComparison.OrdinalIgnoreCase) ||
                           string.Equals(item.Status, "archived", StringComparison.OrdinalIgnoreCase))
            .Select(item => item.Id)
            .ToArray();
        var result = new GroupPublicationVerificationDto(
            groupId,
            missing.Length == 0,
            snapshot.Version,
            CountSlots(snapshot),
            ids.Length,
            missing,
            unavailable,
            DateTime.UtcNow);
        logger.LogInformation(
            "[PUBLISH][VERIFY][{Status}] GroupId={GroupId} Version={Version} Slots={Slots} Lessons={Lessons} Missing={Missing} Unavailable={Unavailable} DurationMs={DurationMs}",
            result.IsValid ? "SUCCESS" : "CHECK_FAILED",
            groupId,
            result.Version,
            result.SlotCount,
            result.DistinctLessonCount,
            result.MissingLessonIds.Count,
            result.UnavailableLessonIds.Count,
            timer.ElapsedMilliseconds);
        return result;
    }

    private static int CountSlots(GroupCurriculumSnapshotDto snapshot) =>
        (snapshot.Weeks ?? Array.Empty<CurriculumWeekDto>())
            .Sum(week => (week.Days ?? Array.Empty<CurriculumDayDto>())
                .Sum(day => (day.LessonSlots ?? Array.Empty<CurriculumLessonSlotDto>()).Count));

    private async Task SyncProgressActivityAsync(
        string groupId,
        GroupCurriculumSnapshotDto snapshot,
        CancellationToken cancellationToken)
    {
        var activeSlots = snapshot.Weeks
            .SelectMany(week => week.Days)
            .SelectMany(day => day.LessonSlots)
            .GroupBy(slot => slot.Id, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                group => group.Key,
                group => group.First(),
                StringComparer.OrdinalIgnoreCase);
        var lessonIds = activeSlots.Values
            .Select(slot => slot.LessonId)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        var lessonTitleRows = await dbContext.Lessons
            .AsNoTracking()
            .Where(lesson => lessonIds.Contains(lesson.Id))
            .Select(lesson => new { lesson.Id, lesson.Title })
            .ToListAsync(cancellationToken);
        var lessonTitles = lessonTitleRows.ToDictionary(
            lesson => lesson.Id,
            lesson => lesson.Title,
            StringComparer.OrdinalIgnoreCase);
        var progressRows = await dbContext.StudentProgress
            .Where(item => item.GroupId == groupId)
            .ToListAsync(cancellationToken);

        foreach (var progressRow in progressRows)
        {
            if (!activeSlots.TryGetValue(progressRow.CurriculumSlotId, out var slot))
            {
                progressRow.IsActive = false;
                continue;
            }

            var lessonWasReplaced = !string.Equals(
                progressRow.LessonId,
                slot.LessonId,
                StringComparison.OrdinalIgnoreCase);

            progressRow.IsActive = true;
            progressRow.LessonId = slot.LessonId;
            progressRow.RequiredRepetitions = Math.Max(1, slot.RepetitionCount);
            progressRow.CompletedRepetitions = lessonWasReplaced
                ? 0
                : Math.Clamp(
                    progressRow.CompletedRepetitions,
                    0,
                    progressRow.RequiredRepetitions);

            if (lessonTitles.TryGetValue(slot.LessonId, out var lessonTitle))
            {
                progressRow.LessonTitle = lessonTitle;
            }

            progressRow.UpdatedAtUtc = DateTime.UtcNow;
        }
    }

    private static void ApplyPublication(
        GroupCurriculumPublicationRecord publication,
        string groupName,
        GroupCurriculumSnapshotDto snapshot,
        DateTime now)
    {
        publication.GroupName = groupName.Trim();
        publication.SourceCurriculumId = snapshot.SourceCurriculumId;
        publication.SourceCurriculumName = snapshot.SourceCurriculumName;
        publication.Version = snapshot.Version;
        publication.PublishedSnapshotJson = JsonSerializer.Serialize(snapshot, JsonOptions);
        publication.UpdatedAtUtc = now;
        publication.PublishedAtUtc = now;
    }

    private static GroupCurriculumSnapshotDto? DeserializeSnapshot(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<GroupCurriculumSnapshotDto>(json, JsonOptions);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static GroupCurriculumSnapshotDto NormalizeSnapshot(
        GroupCurriculumSnapshotDto snapshot,
        int version,
        DateTime now)
    {
        var weeks = (snapshot.Weeks ?? Array.Empty<CurriculumWeekDto>())
            .OrderBy(week => week.Order)
            .Select((week, weekIndex) => new CurriculumWeekDto
            {
                Id = week.Id.Trim(),
                Name = week.Name.Trim(),
                Order = weekIndex,
                Days = (week.Days ?? Array.Empty<CurriculumDayDto>())
                    .OrderBy(day => day.Order)
                    .Select((day, dayIndex) => new CurriculumDayDto
                    {
                        Id = day.Id.Trim(),
                        Name = day.Name.Trim(),
                        Order = dayIndex,
                        LessonSlots = (day.LessonSlots ?? Array.Empty<CurriculumLessonSlotDto>())
                            .OrderBy(slot => slot.Order)
                            .Select((slot, slotIndex) => new CurriculumLessonSlotDto
                            {
                                Id = slot.Id.Trim(),
                                LessonId = slot.LessonId.Trim(),
                                RepetitionCount = Math.Max(1, slot.RepetitionCount),
                                Required = slot.Required,
                                Order = slotIndex,
                            })
                            .ToArray(),
                    })
                    .ToArray(),
            })
            .ToArray();

        return new GroupCurriculumSnapshotDto
        {
            SourceCurriculumId = snapshot.SourceCurriculumId.Trim(),
            SourceCurriculumName = snapshot.SourceCurriculumName.Trim(),
            Version = version,
            Weeks = weeks,
            UpdatedAt = now,
            PublishedAt = now,
        };
    }
}
