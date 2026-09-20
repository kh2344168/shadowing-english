using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using ShadowingEnglish.Api.Data;
using ShadowingEnglish.Api.DTOs.Progress;
using ShadowingEnglish.Api.Models;

namespace ShadowingEnglish.Api.Services;

public sealed class ProgressService(AppDbContext dbContext)
{
    public async Task<IReadOnlyList<StudentProgressDto>> SyncStudentCourseAsync(
        SyncStudentCourseRequest request,
        CancellationToken cancellationToken)
    {
        var studentId = request.StudentId.Trim();
        var studentName = request.StudentName.Trim();
        var groupId = request.GroupId.Trim();
        var groupName = request.GroupName.Trim();

        var slotIds = request.Lessons
            .Select(item => item.CurriculumSlotId.Trim())
            .Where(item => item.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var allStudentRows = await dbContext.StudentProgress
            .Where(item => item.StudentId == studentId)
            .ToListAsync(cancellationToken);
        var allStudentGroupRows = allStudentRows
            .Where(item => item.GroupId == groupId)
            .ToList();
        var existingRows = allStudentGroupRows
            .Where(item => slotIds.Contains(item.CurriculumSlotId))
            .ToList();

        foreach (var existingRow in allStudentRows)
        {
            existingRow.IsActive =
                existingRow.GroupId == groupId &&
                slotIds.Contains(existingRow.CurriculumSlotId);
        }

        var existingBySlot = existingRows.ToDictionary(
            item => item.CurriculumSlotId,
            StringComparer.OrdinalIgnoreCase);

        foreach (var lesson in request.Lessons)
        {
            var slotId = lesson.CurriculumSlotId.Trim();
            if (slotId.Length == 0 || lesson.LessonId.Trim().Length == 0)
            {
                continue;
            }

            if (!existingBySlot.TryGetValue(slotId, out var row))
            {
                row = new StudentProgressRecord
                {
                    StudentId = studentId,
                    StudentName = studentName,
                    GroupId = groupId,
                    GroupName = groupName,
                    CurriculumSlotId = slotId,
                    LessonId = lesson.LessonId.Trim(),
                    LessonTitle = lesson.LessonTitle.Trim(),
                    CompletedRepetitions = Math.Clamp(
                        lesson.CompletedRepetitions,
                        0,
                        Math.Max(1, lesson.RequiredRepetitions)),
                    RequiredRepetitions = Math.Max(1, lesson.RequiredRepetitions),
                    RecordingCount = Math.Max(0, lesson.RecordingCount),
                    IsActive = true,
                    UpdatedAtUtc = DateTime.UtcNow,
                };

                dbContext.StudentProgress.Add(row);
                existingBySlot[slotId] = row;
            }
            else
            {
                row.StudentName = studentName;
                row.GroupName = groupName;
                row.LessonId = lesson.LessonId.Trim();
                row.LessonTitle = lesson.LessonTitle.Trim();
                row.RequiredRepetitions = Math.Max(1, lesson.RequiredRepetitions);
                var requestedCompleted = Math.Clamp(
                    lesson.CompletedRepetitions,
                    0,
                    row.RequiredRepetitions);
                row.CompletedRepetitions = Math.Max(
                    Math.Clamp(row.CompletedRepetitions, 0, row.RequiredRepetitions),
                    requestedCompleted);
                row.RecordingCount = Math.Max(row.RecordingCount, Math.Max(0, lesson.RecordingCount));
                row.IsActive = true;
                row.UpdatedAtUtc = DateTime.UtcNow;
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);

        return request.Lessons
            .Select(lesson => existingBySlot.GetValueOrDefault(lesson.CurriculumSlotId.Trim()))
            .Where(row => row is not null)
            .Select(row => ToDto(row!))
            .ToArray();
    }

    public async Task<StudentProgressDto> SaveProgressAsync(
        SaveStudentProgressRequest request,
        CancellationToken cancellationToken)
    {
        var studentId = request.StudentId.Trim();
        var studentName = request.StudentName.Trim();
        var groupId = request.GroupId.Trim();
        var groupName = request.GroupName.Trim();
        var curriculumSlotId = request.CurriculumSlotId.Trim();

        var studentRows = await dbContext.StudentProgress
            .Where(item => item.StudentId == studentId)
            .ToListAsync(cancellationToken);
        var row = studentRows.SingleOrDefault(item =>
            item.GroupId == groupId &&
            item.CurriculumSlotId == curriculumSlotId);

        foreach (var otherGroupRow in studentRows.Where(item => item.GroupId != groupId))
        {
            otherGroupRow.IsActive = false;
        }

        var requiredRepetitions = Math.Max(1, request.RequiredRepetitions);
        var completedRepetitions = Math.Clamp(
            request.CompletedRepetitions,
            0,
            requiredRepetitions);

        if (row is null)
        {
            row = new StudentProgressRecord
            {
                StudentId = studentId,
                StudentName = studentName,
                GroupId = groupId,
                GroupName = groupName,
                CurriculumSlotId = curriculumSlotId,
                LessonId = request.LessonId.Trim(),
                LessonTitle = request.LessonTitle.Trim(),
                CompletedRepetitions = completedRepetitions,
                RequiredRepetitions = requiredRepetitions,
                RecordingCount = Math.Max(0, request.RecordingCount),
                IsActive = true,
                UpdatedAtUtc = DateTime.UtcNow,
            };

            dbContext.StudentProgress.Add(row);
        }
        else
        {
            row.StudentName = studentName;
            row.GroupName = groupName;
            row.LessonId = request.LessonId.Trim();
            row.LessonTitle = request.LessonTitle.Trim();
            row.RequiredRepetitions = requiredRepetitions;
            row.CompletedRepetitions = completedRepetitions;
            row.RecordingCount = Math.Max(row.RecordingCount, Math.Max(0, request.RecordingCount));
            row.IsActive = true;
            row.UpdatedAtUtc = DateTime.UtcNow;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return ToDto(row);
    }

    public async Task<IReadOnlyList<StudentProgressDto>> GetStudentProgressAsync(
        string studentId,
        CancellationToken cancellationToken)
    {
        studentId = studentId.Trim();

        var rows = await dbContext.StudentProgress
            .AsNoTracking()
            .Where(item => item.StudentId == studentId && item.IsActive)
            .OrderBy(item => item.UpdatedAtUtc)
            .ToListAsync(cancellationToken);

        return rows.Select(ToDto).ToArray();
    }

    public async Task<StudentLearningStateDto> GetStudentLearningStateAsync(
        string studentId,
        string groupId,
        CancellationToken cancellationToken)
    {
        studentId = studentId.Trim();
        groupId = groupId.Trim();

        var row = await dbContext.StudentLearningStates
            .AsNoTracking()
            .SingleOrDefaultAsync(
                item => item.StudentId == studentId && item.GroupId == groupId,
                cancellationToken);

        if (row is null)
        {
            return new StudentLearningStateDto(
                2,
                studentId,
                string.Empty,
                groupId,
                string.Empty,
                Array.Empty<StudentLearningJourneyDto>(),
                Array.Empty<StudentReviewScheduleItemDto>(),
                Array.Empty<StudentConversationSummaryDto>(),
                0,
                DateTime.UnixEpoch);
        }

        var payload = DeserializeLearningPayload(row.StateJson);
        return new StudentLearningStateDto(
            payload.SchemaVersion,
            row.StudentId,
            row.StudentName,
            row.GroupId,
            row.GroupName,
            payload.Journeys,
            payload.Reviews,
            payload.Conversations,
            row.Revision,
            row.UpdatedAtUtc);
    }

    public async Task<StudentLearningStateDto> SaveStudentLearningStateAsync(
        SaveStudentLearningStateRequest request,
        CancellationToken cancellationToken)
    {
        var studentId = request.StudentId.Trim();
        var studentName = request.StudentName.Trim();
        var groupId = request.GroupId.Trim();
        var groupName = request.GroupName.Trim();
        var now = DateTime.UtcNow;

        var journeys = (request.Journeys ?? Array.Empty<StudentLearningJourneyDto>())
            .Where(item =>
                item.StudentId.Trim() == studentId &&
                item.GroupId.Trim() == groupId &&
                !string.IsNullOrWhiteSpace(item.CurriculumSlotId) &&
                !string.IsNullOrWhiteSpace(item.LessonId))
            .GroupBy(item => item.CurriculumSlotId.Trim(), StringComparer.OrdinalIgnoreCase)
            .Select(group => group.OrderByDescending(item => item.UpdatedAt).First())
            .ToArray();

        var reviews = (request.Reviews ?? Array.Empty<StudentReviewScheduleItemDto>())
            .Where(item =>
                item.StudentId.Trim() == studentId &&
                item.GroupId.Trim() == groupId &&
                !string.IsNullOrWhiteSpace(item.Id))
            .GroupBy(item => item.Id.Trim(), StringComparer.OrdinalIgnoreCase)
            .Select(group => group.OrderByDescending(item => item.CompletedAt ?? DateTime.MinValue).First())
            .ToArray();

        var conversations = (request.Conversations ?? Array.Empty<StudentConversationSummaryDto>())
            .Where(item =>
                item.StudentId.Trim() == studentId &&
                item.GroupId.Trim() == groupId &&
                !string.IsNullOrWhiteSpace(item.Id))
            .GroupBy(item => item.Id.Trim(), StringComparer.OrdinalIgnoreCase)
            .Select(group => group.OrderByDescending(item => item.CompletedAt).First())
            .OrderBy(item => item.CompletedAt)
            .ToArray();

        var incomingPayload = new StudentLearningPayload(
            Math.Max(2, request.SchemaVersion),
            journeys,
            reviews,
            conversations);

        var row = await dbContext.StudentLearningStates
            .SingleOrDefaultAsync(
                item => item.StudentId == studentId && item.GroupId == groupId,
                cancellationToken);

        var payload = incomingPayload;
        if (row is null)
        {
            row = new StudentLearningStateRecord
            {
                StudentId = studentId,
                StudentName = studentName,
                GroupId = groupId,
                GroupName = groupName,
                StateJson = JsonSerializer.Serialize(payload, JsonOptions),
                Revision = 1,
                UpdatedAtUtc = now,
            };
            dbContext.StudentLearningStates.Add(row);
        }
        else
        {
            payload = MergeLearningPayload(DeserializeLearningPayload(row.StateJson), incomingPayload);
            row.StudentName = studentName;
            row.GroupName = groupName;
            row.StateJson = JsonSerializer.Serialize(payload, JsonOptions);
            row.Revision += 1;
            row.UpdatedAtUtc = now;
        }

        await dbContext.SaveChangesAsync(cancellationToken);

        return new StudentLearningStateDto(
            payload.SchemaVersion,
            row.StudentId,
            row.StudentName,
            row.GroupId,
            row.GroupName,
            payload.Journeys,
            payload.Reviews,
            payload.Conversations,
            row.Revision,
            row.UpdatedAtUtc);
    }

    public async Task<IReadOnlyList<TeacherGroupProgressSummaryDto>> GetTeacherSummaryAsync(
        CancellationToken cancellationToken)
    {
        var rows = await dbContext.StudentProgress
            .AsNoTracking()
            .Where(item => item.IsActive)
            .OrderBy(item => item.GroupName)
            .ThenBy(item => item.StudentName)
            .ThenBy(item => item.UpdatedAtUtc)
            .ToListAsync(cancellationToken);

        var studentSummaries = rows
            .GroupBy(item => new
            {
                item.StudentId,
                item.StudentName,
                item.GroupId,
                item.GroupName,
            })
            .Select(group =>
            {
                var lessons = group.Select(ToDto).ToArray();
                var totalRequired = lessons.Sum(item => item.RequiredRepetitions);
                var totalCompleted = lessons.Sum(item =>
                    Math.Min(item.CompletedRepetitions, item.RequiredRepetitions));
                var progressPercent = totalRequired == 0
                    ? 0
                    : Math.Min(100, (int)Math.Round(totalCompleted * 100d / totalRequired));
                var completedLessons = lessons.Count(item => item.Status == "Completed");
                var inProgressLessons = lessons.Count(item => item.Status == "InProgress");
                var status = lessons.Length > 0 && completedLessons == lessons.Length
                    ? "Completed"
                    : lessons.Any(item => item.CompletedRepetitions > 0)
                        ? "InProgress"
                        : "NotStarted";

                return new TeacherStudentProgressSummaryDto(
                    group.Key.StudentId,
                    group.Key.StudentName,
                    group.Key.GroupId,
                    group.Key.GroupName,
                    completedLessons,
                    lessons.Length,
                    inProgressLessons,
                    progressPercent,
                    status,
                    lessons);
            })
            .ToArray();

        return studentSummaries
            .GroupBy(item => new { item.GroupId, item.GroupName })
            .Select(group =>
            {
                var students = group.OrderBy(item => item.StudentName).ToArray();
                var completedStudents = students.Count(item => item.Status == "Completed");
                var progressPercent = students.Length == 0
                    ? 0
                    : (int)Math.Round(students.Average(item => item.ProgressPercent));

                return new TeacherGroupProgressSummaryDto(
                    group.Key.GroupId,
                    group.Key.GroupName,
                    students.Length,
                    completedStudents,
                    Math.Max(0, students.Length - completedStudents),
                    progressPercent,
                    students);
            })
            .OrderBy(item => item.GroupName)
            .ToArray();
    }

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private static StudentLearningPayload DeserializeLearningPayload(string json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return EmptyLearningPayload();
        }

        try
        {
            return JsonSerializer.Deserialize<StudentLearningPayload>(json, JsonOptions)
                ?? EmptyLearningPayload();
        }
        catch (JsonException)
        {
            return EmptyLearningPayload();
        }
    }

    private static StudentLearningPayload MergeLearningPayload(
        StudentLearningPayload current,
        StudentLearningPayload incoming)
    {
        var journeys = current.Journeys
            .Concat(incoming.Journeys)
            .GroupBy(item => item.CurriculumSlotId, StringComparer.OrdinalIgnoreCase)
            .Select(group => group.OrderByDescending(item => item.UpdatedAt).First())
            .ToArray();

        var reviews = current.Reviews
            .Concat(incoming.Reviews)
            .GroupBy(item => item.Id, StringComparer.OrdinalIgnoreCase)
            .Select(group => group
                .OrderByDescending(item => item.Status.Equals("completed", StringComparison.OrdinalIgnoreCase))
                .ThenByDescending(item => item.CompletedAt ?? DateTime.MinValue)
                .First())
            .ToArray();

        var conversations = current.Conversations
            .Concat(incoming.Conversations)
            .GroupBy(item => item.Id, StringComparer.OrdinalIgnoreCase)
            .Select(group => group.OrderByDescending(item => item.CompletedAt).First())
            .OrderBy(item => item.CompletedAt)
            .ToArray();

        return new StudentLearningPayload(
            Math.Max(current.SchemaVersion, incoming.SchemaVersion),
            journeys,
            reviews,
            conversations);
    }

    private static StudentLearningPayload EmptyLearningPayload() => new(
        2,
        Array.Empty<StudentLearningJourneyDto>(),
        Array.Empty<StudentReviewScheduleItemDto>(),
        Array.Empty<StudentConversationSummaryDto>());

    private sealed record StudentLearningPayload(
        int SchemaVersion,
        IReadOnlyList<StudentLearningJourneyDto> Journeys,
        IReadOnlyList<StudentReviewScheduleItemDto> Reviews,
        IReadOnlyList<StudentConversationSummaryDto> Conversations);

    private static StudentProgressDto ToDto(StudentProgressRecord row)
    {
        var required = Math.Max(1, row.RequiredRepetitions);
        var completed = Math.Clamp(row.CompletedRepetitions, 0, required);
        var percent = Math.Min(100, (int)Math.Round(completed * 100d / required));
        var status = completed >= required
            ? "Completed"
            : completed > 0
                ? "InProgress"
                : "NotStarted";

        return new StudentProgressDto(
            row.StudentId,
            row.StudentName,
            row.GroupId,
            row.GroupName,
            row.CurriculumSlotId,
            row.LessonId,
            row.LessonTitle,
            completed,
            required,
            Math.Max(0, row.RecordingCount),
            percent,
            status,
            row.UpdatedAtUtc);
    }
}
