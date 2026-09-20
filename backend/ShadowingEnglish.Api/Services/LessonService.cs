using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using ShadowingEnglish.Api.Data;
using ShadowingEnglish.Api.DTOs.Lessons;
using ShadowingEnglish.Api.DTOs.Curriculums;
using ShadowingEnglish.Api.Models;

namespace ShadowingEnglish.Api.Services;

public sealed class LessonService(AppDbContext dbContext)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<IReadOnlyList<LessonDto>> GetAllAsync(CancellationToken cancellationToken)
    {
        var lessons = await dbContext.Lessons
            .AsNoTracking()
            .OrderByDescending(lesson => lesson.UpdatedAtUtc)
            .Select(lesson => new LessonHeader(
                lesson.Id,
                lesson.Title,
                lesson.Description,
                lesson.Status,
                lesson.RequiredRepetitions,
                lesson.MediaFileName,
                lesson.MediaType,
                lesson.ScriptLinesJson,
                lesson.ContentProfileJson,
                lesson.VocabularyJson,
                lesson.ActivitiesJson,
                lesson.CreatedAtUtc,
                lesson.UpdatedAtUtc))
            .ToListAsync(cancellationToken);

        var lessonIds = lessons.Select(lesson => lesson.Id).ToArray();
        var segments = lessonIds.Length == 0
            ? new List<LessonSegmentRecord>()
            : await dbContext.LessonSegments
                .AsNoTracking()
                .Where(segment => lessonIds.Contains(segment.LessonId))
                .OrderBy(segment => segment.LessonId)
                .ThenBy(segment => segment.SortOrder)
                .ToListAsync(cancellationToken);

        var segmentsByLesson = segments
            .GroupBy(segment => segment.LessonId)
            .ToDictionary(group => group.Key, group => group.AsEnumerable());

        return lessons
            .Select(lesson => ToDto(
                lesson,
                segmentsByLesson.GetValueOrDefault(lesson.Id) ?? Array.Empty<LessonSegmentRecord>()))
            .ToArray();
    }

    public async Task<IReadOnlyList<LessonDto>> GetPublishedForGroupAsync(
        string groupId,
        CancellationToken cancellationToken)
    {
        var publishedIds = await GetPublishedLessonIdsForGroupAsync(groupId, cancellationToken);
        if (publishedIds.Count == 0) return [];
        var all = await GetAllAsync(cancellationToken);
        return all.Where(item => publishedIds.Contains(item.Id)).ToArray();
    }

    public async Task<bool> IsPublishedForGroupAsync(
        string groupId,
        string lessonId,
        CancellationToken cancellationToken)
    {
        var publishedIds = await GetPublishedLessonIdsForGroupAsync(groupId, cancellationToken);
        return publishedIds.Contains(lessonId);
    }

    private async Task<HashSet<string>> GetPublishedLessonIdsForGroupAsync(
        string groupId,
        CancellationToken cancellationToken)
    {
        var json = await dbContext.GroupCurriculumPublications
            .AsNoTracking()
            .Where(item => item.GroupId == groupId)
            .Select(item => item.PublishedSnapshotJson)
            .SingleOrDefaultAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(json)) return new HashSet<string>(StringComparer.Ordinal);

        try
        {
            var snapshot = JsonSerializer.Deserialize<GroupCurriculumSnapshotDto>(json, JsonOptions);
            return (snapshot?.Weeks ?? [])
                .SelectMany(week => week.Days ?? [])
                .SelectMany(day => day.LessonSlots ?? [])
                .Select(slot => slot.LessonId)
                .Where(id => !string.IsNullOrWhiteSpace(id))
                .ToHashSet(StringComparer.Ordinal);
        }
        catch (JsonException)
        {
            return new HashSet<string>(StringComparer.Ordinal);
        }
    }

    public async Task<LessonDto?> GetByIdAsync(string id, CancellationToken cancellationToken)
    {
        var lesson = await dbContext.Lessons
            .AsNoTracking()
            .Where(item => item.Id == id)
            .Select(item => new LessonHeader(
                item.Id,
                item.Title,
                item.Description,
                item.Status,
                item.RequiredRepetitions,
                item.MediaFileName,
                item.MediaType,
                item.ScriptLinesJson,
                item.ContentProfileJson,
                item.VocabularyJson,
                item.ActivitiesJson,
                item.CreatedAtUtc,
                item.UpdatedAtUtc))
            .SingleOrDefaultAsync(cancellationToken);

        if (lesson is null)
        {
            return null;
        }

        var segments = await dbContext.LessonSegments
            .AsNoTracking()
            .Where(segment => segment.LessonId == id)
            .OrderBy(segment => segment.SortOrder)
            .ToListAsync(cancellationToken);

        return ToDto(lesson, segments);
    }

    public async Task<LessonDto> SaveAsync(
        SaveLessonRequest request,
        IFormFile? media,
        string? forcedId,
        CancellationToken cancellationToken)
    {
        var id = string.IsNullOrWhiteSpace(forcedId)
            ? string.IsNullOrWhiteSpace(request.Id)
                ? $"lesson-{Guid.NewGuid():N}"
                : request.Id.Trim()
            : forcedId.Trim();

        var lesson = await dbContext.Lessons
            .Include(item => item.Segments)
            .SingleOrDefaultAsync(item => item.Id == id, cancellationToken);

        var now = DateTime.UtcNow;

        if (lesson is null)
        {
            lesson = new LessonRecord
            {
                Id = id,
                CreatedAtUtc = now,
            };
            dbContext.Lessons.Add(lesson);
        }
        else if (lesson.Segments.Count > 0)
        {
            dbContext.LessonSegments.RemoveRange(lesson.Segments);
            lesson.Segments = new List<LessonSegmentRecord>();
        }

        lesson.Title = request.Title.Trim();
        lesson.Description = request.Description?.Trim() ?? string.Empty;
        lesson.Status = NormalizeStatus(request.Status);
        lesson.RequiredRepetitions = Math.Max(1, request.RequiredRepetitions);
        lesson.MediaFileName = request.MediaFileName?.Trim() ?? lesson.MediaFileName;
        lesson.MediaType = request.MediaType?.Trim() ?? lesson.MediaType;
        lesson.ScriptLinesJson = JsonSerializer.Serialize(
            request.ScriptLines ?? Array.Empty<string>(),
            JsonOptions);
        lesson.ContentProfileJson = JsonSerializer.Serialize(
            request.ContentProfile,
            JsonOptions);
        lesson.VocabularyJson = JsonSerializer.Serialize(
            request.Vocabulary ?? Array.Empty<LessonVocabularyItemDto>(),
            JsonOptions);
        lesson.ActivitiesJson = JsonSerializer.Serialize(
            request.Activities ?? Array.Empty<LessonActivityDto>(),
            JsonOptions);
        lesson.UpdatedAtUtc = now;

        if (media is not null && media.Length > 0)
        {
            await using var memoryStream = new MemoryStream();
            await media.CopyToAsync(memoryStream, cancellationToken);
            lesson.MediaData = memoryStream.ToArray();
            lesson.MediaFileName = string.IsNullOrWhiteSpace(media.FileName)
                ? lesson.MediaFileName
                : Path.GetFileName(media.FileName);
            lesson.MediaType = string.IsNullOrWhiteSpace(media.ContentType)
                ? lesson.MediaType
                : media.ContentType;
        }

        lesson.MediaFileName = string.IsNullOrWhiteSpace(lesson.MediaFileName)
            ? "lesson-media"
            : lesson.MediaFileName;
        lesson.MediaType = string.IsNullOrWhiteSpace(lesson.MediaType)
            ? "application/octet-stream"
            : lesson.MediaType;

        lesson.Segments = (request.Segments ?? Array.Empty<SaveLessonSegmentRequest>())
            .Select((segment, index) => new LessonSegmentRecord
            {
                LessonId = id,
                SortOrder = index,
                StartSeconds = segment.Start,
                EndSeconds = segment.End,
                EnglishText = segment.Text.Trim(),
                ArabicTranslation = segment.Translation?.Trim() ?? string.Empty,
            })
            .ToList();

        dbContext.LessonSegments.AddRange(lesson.Segments);

        await dbContext.SaveChangesAsync(cancellationToken);
        return ToDto(lesson);
    }

    public async Task<LessonMediaResult?> GetMediaAsync(
        string id,
        CancellationToken cancellationToken)
    {
        var media = await dbContext.Lessons
            .AsNoTracking()
            .Where(lesson => lesson.Id == id && lesson.MediaData != null)
            .Select(lesson => new LessonMediaResult(
                lesson.MediaData!,
                lesson.MediaType,
                lesson.MediaFileName))
            .SingleOrDefaultAsync(cancellationToken);

        return media;
    }

    public async Task<bool> DeleteAsync(string id, CancellationToken cancellationToken)
    {
        var lesson = await dbContext.Lessons.SingleOrDefaultAsync(
            item => item.Id == id,
            cancellationToken);

        if (lesson is null)
        {
            return false;
        }

        var progressRows = await dbContext.StudentProgress
            .Where(item => item.LessonId == id)
            .ToListAsync(cancellationToken);

        if (progressRows.Count > 0)
        {
            dbContext.StudentProgress.RemoveRange(progressRows);
        }

        dbContext.Lessons.Remove(lesson);
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<IReadOnlyList<LessonUsageDto>> GetPublishedUsageAsync(
        string lessonId,
        CancellationToken cancellationToken)
    {
        var publications = await dbContext.GroupCurriculumPublications
            .AsNoTracking()
            .Select(item => new
            {
                item.GroupId,
                item.GroupName,
                item.PublishedSnapshotJson,
            })
            .ToListAsync(cancellationToken);
        var usage = new List<LessonUsageDto>();

        foreach (var publication in publications)
        {
            GroupCurriculumSnapshotDto? snapshot;

            try
            {
                snapshot = JsonSerializer.Deserialize<GroupCurriculumSnapshotDto>(
                    publication.PublishedSnapshotJson,
                    JsonOptions);
            }
            catch (JsonException)
            {
                continue;
            }

            if (snapshot is null) continue;

            foreach (var week in snapshot.Weeks)
            {
                foreach (var day in week.Days)
                {
                    if (day.LessonSlots.Any(slot => slot.LessonId == lessonId))
                    {
                        usage.Add(new LessonUsageDto(
                            publication.GroupId,
                            publication.GroupName,
                            week.Name,
                            day.Name));
                    }
                }
            }
        }

        return usage;
    }

    private static LessonDto ToDto(LessonRecord lesson)
    {
        var scriptLines = DeserializeScriptLines(lesson.ScriptLinesJson);
        var segments = lesson.Segments
            .OrderBy(segment => segment.SortOrder)
            .Select(segment => new LessonSegmentDto(
                segment.EnglishText,
                segment.ArabicTranslation,
                segment.StartSeconds,
                segment.EndSeconds))
            .ToArray();

        return new LessonDto(
            lesson.Id,
            lesson.Title,
            lesson.Description,
            DeserializeJsonObject<LessonContentProfileDto>(lesson.ContentProfileJson),
            lesson.Status,
            string.Empty,
            string.Empty,
            lesson.RequiredRepetitions,
            lesson.MediaFileName,
            lesson.MediaType,
            $"/api/lessons/{Uri.EscapeDataString(lesson.Id)}/media",
            segments,
            scriptLines,
            DeserializeJsonList<LessonVocabularyItemDto>(lesson.VocabularyJson),
            DeserializeJsonList<LessonActivityDto>(lesson.ActivitiesJson),
            lesson.CreatedAtUtc,
            lesson.UpdatedAtUtc);
    }

    private static LessonDto ToDto(
        LessonHeader lesson,
        IEnumerable<LessonSegmentRecord> lessonSegments)
    {
        var segments = lessonSegments
            .OrderBy(segment => segment.SortOrder)
            .Select(segment => new LessonSegmentDto(
                segment.EnglishText,
                segment.ArabicTranslation,
                segment.StartSeconds,
                segment.EndSeconds))
            .ToArray();

        return new LessonDto(
            lesson.Id,
            lesson.Title,
            lesson.Description,
            DeserializeJsonObject<LessonContentProfileDto>(lesson.ContentProfileJson),
            lesson.Status,
            string.Empty,
            string.Empty,
            lesson.RequiredRepetitions,
            lesson.MediaFileName,
            lesson.MediaType,
            $"/api/lessons/{Uri.EscapeDataString(lesson.Id)}/media",
            segments,
            DeserializeScriptLines(lesson.ScriptLinesJson),
            DeserializeJsonList<LessonVocabularyItemDto>(lesson.VocabularyJson),
            DeserializeJsonList<LessonActivityDto>(lesson.ActivitiesJson),
            lesson.CreatedAtUtc,
            lesson.UpdatedAtUtc);
    }

    private static string NormalizeStatus(string? status)
    {
        return status?.Trim().ToLowerInvariant() switch
        {
            "ready" => "ready",
            "archived" => "archived",
            "draft" => "draft",
            _ => "ready",
        };
    }

    private static IReadOnlyList<string> DeserializeScriptLines(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<string[]>(json, JsonOptions) ?? Array.Empty<string>();
        }
        catch (JsonException)
        {
            return Array.Empty<string>();
        }
    }

    private static IReadOnlyList<T> DeserializeJsonList<T>(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<T[]>(json, JsonOptions) ?? Array.Empty<T>();
        }
        catch (JsonException)
        {
            return Array.Empty<T>();
        }
    }

    private static T? DeserializeJsonObject<T>(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<T>(json, JsonOptions);
        }
        catch (JsonException)
        {
            return default;
        }
    }

    private sealed record LessonHeader(
        string Id,
        string Title,
        string Description,
        string Status,
        int RequiredRepetitions,
        string MediaFileName,
        string MediaType,
        string ScriptLinesJson,
        string ContentProfileJson,
        string VocabularyJson,
        string ActivitiesJson,
        DateTime CreatedAtUtc,
        DateTime UpdatedAtUtc);
}
