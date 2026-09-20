using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ShadowingEnglish.Api.DTOs.Tracking;
using ShadowingEnglish.Api.Services;

namespace ShadowingEnglish.Api.Controllers;

[Authorize(Roles = "admin")]
[ApiController]
[Route("api/admin/students")]
public sealed class AdminStudentsController(StudentTrackingService service, ILogger<AdminStudentsController> logger) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<StudentDirectoryDto>>> GetAll(CancellationToken cancellationToken) =>
        Ok(await service.GetStudentsAsync(cancellationToken));

    [HttpGet("{studentId}")]
    public async Task<ActionResult<AdminStudentDetailDto>> GetDetail(string studentId, CancellationToken cancellationToken)
    {
        var result = await service.GetStudentDetailAsync(studentId, cancellationToken);
        return result is null ? NotFound(new { message = "Student not found." }) : Ok(result);
    }

    [HttpGet("{studentId}/events")]
    public async Task<ActionResult<StudentEventPageDto>> GetEvents(
        string studentId,
        [FromQuery] int skip = 0,
        [FromQuery] int take = 100,
        CancellationToken cancellationToken = default)
    {
        var result = await service.GetStudentEventsAsync(studentId, skip, take, cancellationToken);
        return result is null ? NotFound(new { message = "Student not found." }) : Ok(result);
    }

    [HttpPost]
    public async Task<ActionResult<CreateStudentResultDto>> Create(
        CreateStudentAccountRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Email) ||
            string.IsNullOrWhiteSpace(request.GroupId) || string.IsNullOrWhiteSpace(request.GroupName))
        {
            logger.LogWarning("[TRACKING][STUDENT_CREATE][CHECK_FAILED] Required fields missing");
            return BadRequest(new { message = "Name, email, group id, and group name are required." });
        }

        try
        {
            var result = await service.CreateStudentAsync(request, cancellationToken);
            return CreatedAtAction(nameof(GetDetail), new { studentId = result.Student.Id }, result);
        }
        catch (InvalidOperationException ex)
        {
            logger.LogWarning(ex, "[TRACKING][STUDENT_CREATE][CHECK_FAILED] Validation failed");
            return Conflict(new { message = ex.Message });
        }
    }

    [HttpPut("{studentId}/import-legacy")]
    public async Task<ActionResult<StudentDirectoryDto>> ImportLegacy(
        string studentId,
        ImportLegacyStudentRequest request,
        CancellationToken cancellationToken)
    {
        if (!string.Equals(studentId, request.Id, StringComparison.Ordinal))
        {
            return BadRequest(new { message = "Route student id must match body id." });
        }
        if (string.IsNullOrWhiteSpace(request.Id) || string.IsNullOrWhiteSpace(request.Name) ||
            string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.GroupId))
        {
            return BadRequest(new { message = "Student id, name, email, and group are required." });
        }

        try
        {
            return Ok(await service.ImportLegacyStudentAsync(request, cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            logger.LogWarning(ex, "[TRACKING][LEGACY_STUDENT_IMPORT][CHECK_FAILED] StudentId={StudentId}", studentId);
            return Conflict(new { message = ex.Message });
        }
    }

    [HttpPut("{studentId}/group")]
    public async Task<ActionResult<StudentDirectoryDto>> Move(
        string studentId,
        MoveStudentRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.GroupId) || string.IsNullOrWhiteSpace(request.GroupName))
        {
            return BadRequest(new { message = "Target group is required." });
        }
        try
        {
            var result = await service.MoveStudentAsync(studentId, request, cancellationToken);
            return result is null ? NotFound(new { message = "Student not found." }) : Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            logger.LogWarning(ex, "[TRACKING][STUDENT_MOVE][CHECK_FAILED] StudentId={StudentId} TargetGroupId={GroupId}", studentId, request.GroupId);
            return Conflict(new { message = ex.Message });
        }
    }

    [HttpPatch("{studentId}")]
    public async Task<ActionResult<StudentDirectoryDto>> Update(
        string studentId,
        UpdateStudentAccountRequest request,
        CancellationToken cancellationToken)
    {
        var result = await service.UpdateStudentAsync(studentId, request, cancellationToken);
        return result is null ? NotFound(new { message = "Student not found." }) : Ok(result);
    }

    [HttpPost("{studentId}/reset-password")]
    public async Task<ActionResult<ResetStudentPasswordDto>> ResetPassword(
        string studentId,
        CancellationToken cancellationToken)
    {
        var result = await service.ResetPasswordAsync(studentId, cancellationToken);
        return result is null ? NotFound(new { message = "Student not found." }) : Ok(result);
    }
}
