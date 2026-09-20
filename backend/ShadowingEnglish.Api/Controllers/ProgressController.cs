using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ShadowingEnglish.Api.DTOs.Progress;
using ShadowingEnglish.Api.Services;

namespace ShadowingEnglish.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/progress")]
public sealed class ProgressController(ProgressService progressService) : ControllerBase
{
    [HttpPost("course")]
    public async Task<ActionResult<IReadOnlyList<StudentProgressDto>>> SyncCourse(
        SyncStudentCourseRequest request,
        CancellationToken cancellationToken)
    {
        if (!CanAccessStudent(request.StudentId) || !CanAccessGroup(request.GroupId)) return Forbid();
        var validationError = ValidateIdentity(
            request.StudentId,
            request.StudentName,
            request.GroupId,
            request.GroupName);

        if (validationError is not null)
        {
            return BadRequest(new { message = validationError });
        }

        if (request.Lessons is null)
        {
            return BadRequest(new { message = "Lessons are required." });
        }

        if (request.Lessons.Any(lesson =>
                string.IsNullOrWhiteSpace(lesson.CurriculumSlotId) ||
                string.IsNullOrWhiteSpace(lesson.LessonId) ||
                string.IsNullOrWhiteSpace(lesson.LessonTitle)))
        {
            return BadRequest(new { message = "Every lesson needs a slot id, lesson id, and title." });
        }

        if (request.Lessons.Any(lesson =>
                lesson.RequiredRepetitions < 1 ||
                lesson.CompletedRepetitions < 0 ||
                lesson.RecordingCount < 0))
        {
            return BadRequest(new { message = "Lesson repetition values are invalid." });
        }

        var result = await progressService.SyncStudentCourseAsync(request, cancellationToken);
        return Ok(result);
    }

    [HttpPost("repetitions")]
    public async Task<ActionResult<StudentProgressDto>> SaveRepetitions(
        SaveStudentProgressRequest request,
        CancellationToken cancellationToken)
    {
        if (!CanAccessStudent(request.StudentId) || !CanAccessGroup(request.GroupId)) return Forbid();
        var validationError = ValidateIdentity(
            request.StudentId,
            request.StudentName,
            request.GroupId,
            request.GroupName);

        if (validationError is not null)
        {
            return BadRequest(new { message = validationError });
        }

        if (string.IsNullOrWhiteSpace(request.CurriculumSlotId) ||
            string.IsNullOrWhiteSpace(request.LessonId) ||
            string.IsNullOrWhiteSpace(request.LessonTitle))
        {
            return BadRequest(new { message = "Slot, lesson id, and lesson title are required." });
        }

        if (request.RequiredRepetitions < 1 || request.CompletedRepetitions < 0 || request.RecordingCount < 0)
        {
            return BadRequest(new { message = "Repetition values are invalid." });
        }

        var result = await progressService.SaveProgressAsync(request, cancellationToken);
        return Ok(result);
    }

    [HttpGet("student/{studentId}")]
    public async Task<ActionResult<IReadOnlyList<StudentProgressDto>>> GetStudentProgress(
        string studentId,
        CancellationToken cancellationToken)
    {
        if (!CanAccessStudent(studentId)) return Forbid();
        if (string.IsNullOrWhiteSpace(studentId))
        {
            return BadRequest(new { message = "Student id is required." });
        }

        var result = await progressService.GetStudentProgressAsync(studentId, cancellationToken);
        return Ok(result);
    }

    [HttpGet("learning-state/{studentId}/{groupId}")]
    public async Task<ActionResult<StudentLearningStateDto>> GetStudentLearningState(
        string studentId,
        string groupId,
        CancellationToken cancellationToken)
    {
        if (!CanAccessStudent(studentId) || !CanAccessGroup(groupId)) return Forbid();
        if (string.IsNullOrWhiteSpace(studentId) || string.IsNullOrWhiteSpace(groupId))
        {
            return BadRequest(new { message = "Student id and group id are required." });
        }

        var result = await progressService.GetStudentLearningStateAsync(
            studentId,
            groupId,
            cancellationToken);
        return Ok(result);
    }

    [HttpPut("learning-state")]
    public async Task<ActionResult<StudentLearningStateDto>> SaveStudentLearningState(
        SaveStudentLearningStateRequest request,
        CancellationToken cancellationToken)
    {
        if (!CanAccessStudent(request.StudentId) || !CanAccessGroup(request.GroupId)) return Forbid();
        var validationError = ValidateIdentity(
            request.StudentId,
            request.StudentName,
            request.GroupId,
            request.GroupName);
        if (validationError is not null)
        {
            return BadRequest(new { message = validationError });
        }

        if (request.Journeys is null || request.Reviews is null || request.Conversations is null)
        {
            return BadRequest(new { message = "Learning-state collections are required." });
        }

        var identityMismatch = request.Journeys.Any(item =>
                item.StudentId != request.StudentId || item.GroupId != request.GroupId) ||
            request.Reviews.Any(item =>
                item.StudentId != request.StudentId || item.GroupId != request.GroupId) ||
            request.Conversations.Any(item =>
                item.StudentId != request.StudentId || item.GroupId != request.GroupId);
        if (identityMismatch)
        {
            return BadRequest(new { message = "Learning-state items must belong to the same student and group." });
        }

        var result = await progressService.SaveStudentLearningStateAsync(
            request,
            cancellationToken);
        return Ok(result);
    }

    [Authorize(Roles = "admin,supervisor,teacher")]
    [HttpGet("teacher")]
    public async Task<ActionResult<IReadOnlyList<TeacherGroupProgressSummaryDto>>> GetTeacherSummary(
        CancellationToken cancellationToken)
    {
        var result = await progressService.GetTeacherSummaryAsync(cancellationToken);
        return Ok(result);
    }

    private bool CanAccessStudent(string studentId)
    {
        if (User.IsInRole("admin") || User.IsInRole("supervisor") || User.IsInRole("teacher")) return true;
        return User.IsInRole("student") && string.Equals(
            User.FindFirstValue(ClaimTypes.NameIdentifier),
            studentId,
            StringComparison.Ordinal);
    }

    private bool CanAccessGroup(string groupId)
    {
        if (User.IsInRole("admin") || User.IsInRole("supervisor") || User.IsInRole("teacher")) return true;
        return User.IsInRole("student") && string.Equals(
            User.FindFirstValue("group_id"),
            groupId,
            StringComparison.Ordinal);
    }

    private static string? ValidateIdentity(
        string studentId,
        string studentName,
        string groupId,
        string groupName)
    {
        if (string.IsNullOrWhiteSpace(studentId) || string.IsNullOrWhiteSpace(studentName))
        {
            return "Student id and name are required.";
        }

        if (string.IsNullOrWhiteSpace(groupId) || string.IsNullOrWhiteSpace(groupName))
        {
            return "Group id and name are required.";
        }

        return null;
    }
}
