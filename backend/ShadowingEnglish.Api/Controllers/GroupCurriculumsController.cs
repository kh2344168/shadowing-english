using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ShadowingEnglish.Api.DTOs.Curriculums;
using ShadowingEnglish.Api.Services;

namespace ShadowingEnglish.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/group-curriculums")]
public sealed class GroupCurriculumsController(
    GroupCurriculumService groupCurriculumService,
    ILogger<GroupCurriculumsController> logger) : ControllerBase
{
    [HttpGet("{groupId}/published")]
    [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
    public async Task<ActionResult<GroupCurriculumSnapshotDto>> GetPublished(
        string groupId,
        CancellationToken cancellationToken)
    {
        logger.LogInformation("[PUBLISH][GET] Request received for group {GroupId}.", groupId);
        if (User.IsInRole("student") &&
            !string.Equals(User.FindFirstValue("group_id"), groupId, StringComparison.Ordinal))
        {
            logger.LogWarning("[PUBLISH][GET][CHECK_FAILED] Student requested another group {GroupId}", groupId);
            return Forbid();
        }

        if (string.IsNullOrWhiteSpace(groupId) || groupId.Trim().Length > 120)
        {
            return BadRequest(new { message = "A valid group id is required." });
        }

        var snapshot = await groupCurriculumService.GetPublishedAsync(
            groupId.Trim(),
            cancellationToken);

        if (snapshot is null)
        {
            logger.LogWarning("[PUBLISH][GET] No published snapshot found for group {GroupId}.", groupId);
            return NotFound();
        }

        logger.LogInformation(
            "[PUBLISH][GET] Returning group {GroupId} version {Version} with {SlotCount} slots.",
            groupId,
            snapshot.Version,
            CountSlots(snapshot));
        return Ok(snapshot);
    }

    [Authorize(Roles = "admin")]
    [HttpPut("{groupId}/published")]
    public async Task<ActionResult<GroupCurriculumSnapshotDto>> Publish(
        string groupId,
        PublishGroupCurriculumRequest? request,
        CancellationToken cancellationToken)
    {
        logger.LogInformation(
            "[PUBLISH][PUT] Request received. Group={GroupId}, Name={GroupName}, RequestedVersion={Version}, Slots={SlotCount}.",
            groupId,
            request?.GroupName,
            request?.Snapshot?.Version,
            request?.Snapshot is null ? 0 : CountSlots(request.Snapshot));

        if (request is null)
        {
            return BadRequest(new { message = "A publication request is required." });
        }

        var validationError = Validate(groupId, request);
        if (validationError is not null)
        {
            logger.LogWarning("[PUBLISH][PUT] Validation failed for group {GroupId}: {ValidationError}", groupId, validationError);
            return BadRequest(new { message = validationError });
        }

        try
        {
            logger.LogInformation("[PUBLISH][PUT] Calling service for group {GroupId}.", groupId);
            var snapshot = await groupCurriculumService.PublishAsync(
                groupId.Trim(),
                request,
                cancellationToken);

            logger.LogInformation(
                "[PUBLISH][PUT] Success. Group={GroupId}, SavedVersion={Version}, Slots={SlotCount}.",
                groupId,
                snapshot.Version,
                CountSlots(snapshot));
            return Ok(snapshot);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (InvalidOperationException ex)
        {
            logger.LogWarning(ex, "[PUBLISH][PUT][CHECK_FAILED] Group={GroupId}", groupId);
            return Conflict(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to publish curriculum for group {GroupId}.", groupId);
            return Problem(
                statusCode: StatusCodes.Status500InternalServerError,
                title: "Group curriculum publication failed",
                detail: ex.GetBaseException().Message);
        }
    }

    [Authorize(Roles = "admin,supervisor,teacher")]
    [HttpGet("{groupId}/verify")]
    [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
    public async Task<ActionResult<GroupPublicationVerificationDto>> Verify(
        string groupId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(groupId) || groupId.Trim().Length > 120)
        {
            return BadRequest(new { message = "A valid group id is required." });
        }
        return Ok(await groupCurriculumService.VerifyPublishedAsync(groupId.Trim(), cancellationToken));
    }


    private static int CountSlots(GroupCurriculumSnapshotDto snapshot) =>
        (snapshot.Weeks ?? Array.Empty<CurriculumWeekDto>())
            .Sum(week => (week.Days ?? Array.Empty<CurriculumDayDto>())
                .Sum(day => (day.LessonSlots ?? Array.Empty<CurriculumLessonSlotDto>()).Count));

    private static string? Validate(
        string groupId,
        PublishGroupCurriculumRequest request)
    {
        if (string.IsNullOrWhiteSpace(groupId) || groupId.Trim().Length > 120)
        {
            return "A valid group id is required.";
        }

        if (string.IsNullOrWhiteSpace(request.GroupName) || request.GroupName.Trim().Length > 160)
        {
            return "A valid group name is required.";
        }

        if (request.Snapshot is null)
        {
            return "The published curriculum snapshot is required.";
        }

        if (string.IsNullOrWhiteSpace(request.Snapshot.SourceCurriculumId) ||
            string.IsNullOrWhiteSpace(request.Snapshot.SourceCurriculumName) ||
            request.Snapshot.SourceCurriculumId.Trim().Length > 160 ||
            request.Snapshot.SourceCurriculumName.Trim().Length > 240)
        {
            return "Valid curriculum information is required.";
        }

        foreach (var week in request.Snapshot.Weeks ?? Array.Empty<CurriculumWeekDto>())
        {
            if (string.IsNullOrWhiteSpace(week.Id) ||
                string.IsNullOrWhiteSpace(week.Name) ||
                week.Id.Trim().Length > 160 ||
                week.Name.Trim().Length > 160)
            {
                return "Every week needs a valid id and name.";
            }

            foreach (var day in week.Days ?? Array.Empty<CurriculumDayDto>())
            {
                if (string.IsNullOrWhiteSpace(day.Id) ||
                    string.IsNullOrWhiteSpace(day.Name) ||
                    day.Id.Trim().Length > 160 ||
                    day.Name.Trim().Length > 160)
                {
                    return "Every day needs a valid id and name.";
                }

                if ((day.LessonSlots ?? Array.Empty<CurriculumLessonSlotDto>()).Any(slot =>
                        string.IsNullOrWhiteSpace(slot.Id) ||
                        string.IsNullOrWhiteSpace(slot.LessonId) ||
                        slot.Id.Trim().Length > 160 ||
                        slot.LessonId.Trim().Length > 160 ||
                        slot.RepetitionCount < 1))
                {
                    return "Every lesson slot needs valid lesson data.";
                }
            }
        }

        return null;
    }
}
