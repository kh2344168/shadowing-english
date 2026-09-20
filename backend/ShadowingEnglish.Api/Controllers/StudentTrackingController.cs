using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ShadowingEnglish.Api.DTOs.Tracking;
using ShadowingEnglish.Api.Services;

namespace ShadowingEnglish.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/student-tracking")]
public sealed class StudentTrackingController(StudentTrackingService service, ILogger<StudentTrackingController> logger) : ControllerBase
{
    [HttpPost("events")]
    public async Task<ActionResult<StudentActivityEventDto>> Track(
        TrackStudentEventRequest request,
        CancellationToken cancellationToken)
    {
        if (!CanAccessStudent(request.StudentId) || !CanAccessGroup(request.GroupId)) return Forbid();
        if (string.IsNullOrWhiteSpace(request.StudentId) || string.IsNullOrWhiteSpace(request.GroupId) ||
            string.IsNullOrWhiteSpace(request.EventType))
        {
            logger.LogWarning("[TRACKING][EVENT][CHECK_FAILED] Missing identity or event type");
            return BadRequest(new { message = "Student id, group id, and event type are required." });
        }
        if (request.EventType.Trim().Length > 80 ||
            (request.DetailsJson?.Length ?? 0) > 16_000 ||
            (request.LessonId?.Length ?? 0) > 160 ||
            (request.StageId?.Length ?? 0) > 120)
        {
            logger.LogWarning("[TRACKING][EVENT][CHECK_FAILED] Oversized event metadata StudentId={StudentId}", request.StudentId);
            return BadRequest(new { message = "Event metadata is too long." });
        }
        try
        {
            return Ok(await service.TrackEventAsync(request, cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            logger.LogWarning(ex, "[TRACKING][EVENT][CHECK_FAILED] Event rejected StudentId={StudentId}", request.StudentId);
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("recordings")]
    [RequestSizeLimit(52_428_800)]
    public async Task<ActionResult<StudentRecordingDto>> UploadRecording(
        [FromForm] string studentId,
        [FromForm] string groupId,
        [FromForm] string lessonId,
        [FromForm] string lessonTitle,
        [FromForm] string curriculumSlotId,
        [FromForm] string stageId,
        [FromForm] string recordingType,
        [FromForm] string clientRecordingId,
        [FromForm] int attemptNumber,
        [FromForm] long durationMs,
        [FromForm] IFormFile file,
        CancellationToken cancellationToken)
    {
        if (!CanAccessStudent(studentId) || !CanAccessGroup(groupId)) return Forbid();
        if (string.IsNullOrWhiteSpace(studentId) || string.IsNullOrWhiteSpace(groupId) ||
            string.IsNullOrWhiteSpace(clientRecordingId) || file is null)
        {
            return BadRequest(new { message = "Student, group, client recording id, and file are required." });
        }
        if (studentId.Length > 120 || groupId.Length > 120 || lessonId.Length > 160 ||
            lessonTitle.Length > 240 || curriculumSlotId.Length > 160 || stageId.Length > 120 ||
            recordingType.Length > 40 || clientRecordingId.Length > 180 ||
            attemptNumber < 0 || durationMs < 0)
        {
            logger.LogWarning("[TRACKING][RECORDING][CHECK_FAILED] Invalid metadata StudentId={StudentId}", studentId);
            return BadRequest(new { message = "Recording metadata is invalid." });
        }
        try
        {
            var result = await service.SaveRecordingAsync(
                studentId,
                groupId,
                lessonId,
                lessonTitle,
                curriculumSlotId,
                stageId,
                recordingType,
                clientRecordingId,
                attemptNumber,
                durationMs,
                file,
                cancellationToken);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            logger.LogWarning(ex, "[TRACKING][RECORDING][CHECK_FAILED] Upload rejected");
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("recordings/{recordingId:guid}/content")]
    public async Task<IActionResult> GetRecording(Guid recordingId, CancellationToken cancellationToken)
    {
        var row = await service.GetRecordingAsync(recordingId, cancellationToken);
        if (row is null) return NotFound();
        if (!CanAccessStudent(row.StudentId)) return Forbid();
        Response.Headers.CacheControl = "private, no-store";
        return File(row.AudioData, row.ContentType, row.FileName, enableRangeProcessing: true);
    }

    [HttpDelete("recordings/{recordingId:guid}")]
    public async Task<IActionResult> DeleteRecording(Guid recordingId, CancellationToken cancellationToken)
    {
        var row = await service.GetRecordingAsync(recordingId, cancellationToken);
        if (row is null) return NotFound();
        if (!CanAccessStudent(row.StudentId)) return Forbid();
        return await service.DeleteRecordingAsync(recordingId, cancellationToken) ? NoContent() : NotFound();
    }

    [HttpDelete("recordings/by-client/{clientRecordingId}")]
    public async Task<IActionResult> DeleteRecordingByClientId(
        string clientRecordingId,
        [FromQuery] string studentId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(clientRecordingId) || string.IsNullOrWhiteSpace(studentId))
        {
            logger.LogWarning("[TRACKING][RECORDING_DELETE][CHECK_FAILED] Client recording id or student id missing");
            return BadRequest(new { message = "Client recording id and student id are required." });
        }
        if (!CanAccessStudent(studentId)) return Forbid();

        var deleted = await service.DeleteRecordingByClientIdAsync(
            studentId,
            clientRecordingId,
            cancellationToken);
        return deleted ? NoContent() : NotFound();
    }

    private bool CanAccessStudent(string studentId)
    {
        if (User.IsInRole("admin")) return true;
        return User.IsInRole("student") && string.Equals(
            User.FindFirstValue(ClaimTypes.NameIdentifier),
            studentId,
            StringComparison.Ordinal);
    }

    private bool CanAccessGroup(string groupId)
    {
        if (User.IsInRole("admin")) return true;
        return User.IsInRole("student") && string.Equals(
            User.FindFirstValue("group_id"),
            groupId,
            StringComparison.Ordinal);
    }
}
