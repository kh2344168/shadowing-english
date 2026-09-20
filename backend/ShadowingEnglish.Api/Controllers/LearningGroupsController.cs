using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ShadowingEnglish.Api.Data;
using ShadowingEnglish.Api.DTOs.Tracking;
using ShadowingEnglish.Api.Services;

namespace ShadowingEnglish.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/admin/learning-groups")]
public sealed class LearningGroupsController(StudentTrackingService service, AppDbContext db, ILogger<LearningGroupsController> logger) : ControllerBase
{
    [Authorize(Roles = "admin,supervisor,teacher")]
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<LearningGroupDto>>> GetAll(CancellationToken cancellationToken) =>
        Ok(await service.GetGroupsAsync(cancellationToken));

    [Authorize(Roles = "admin")]
    [HttpPut("{groupId}")]
    public async Task<ActionResult<LearningGroupDto>> Upsert(
        string groupId,
        UpsertLearningGroupRequest request,
        CancellationToken cancellationToken)
    {
        if (!string.Equals(groupId, request.Id, StringComparison.Ordinal))
        {
            return BadRequest(new { message = "Route group id must match body id." });
        }
        if (string.IsNullOrWhiteSpace(request.Id) || string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest(new { message = "Group id and name are required." });
        }

        var curriculumId = request.CurriculumId?.Trim() ?? string.Empty;
        if (!string.IsNullOrWhiteSpace(curriculumId))
        {
            var exists = await db.Curriculums.AsNoTracking().AnyAsync(item => item.Id == curriculumId, cancellationToken);
            if (!exists)
            {
                logger.LogWarning(
                    "[TRACKING][GROUP_UPSERT][CHECK_FAILED] GroupId={GroupId} CurriculumId={CurriculumId} Reason=curriculum_not_found",
                    groupId,
                    curriculumId);
                return BadRequest(new { message = "The selected curriculum does not exist in the backend." });
            }
            logger.LogInformation(
                "[TRACKING][GROUP_UPSERT][CHECK_OK] GroupId={GroupId} CurriculumId={CurriculumId}",
                groupId,
                curriculumId);
        }

        return Ok(await service.UpsertGroupAsync(request, cancellationToken));
    }

    [Authorize(Roles = "admin")]
    [HttpDelete("{groupId}")]
    public async Task<IActionResult> Delete(string groupId, CancellationToken cancellationToken)
    {
        var startedAt = DateTime.UtcNow;
        logger.LogInformation("[TRACKING][GROUP_DELETE][START] GroupId={GroupId}", groupId);
        try
        {
            var group = await db.LearningGroups.SingleOrDefaultAsync(item => item.Id == groupId && item.IsActive, cancellationToken);
            if (group is null)
            {
                logger.LogWarning("[TRACKING][GROUP_DELETE][CHECK_FAILED] GroupId={GroupId} Reason=not_found", groupId);
                return NotFound(new { message = "Group not found." });
            }

            var studentCount = await db.StudentAccounts.CountAsync(item => item.GroupId == groupId, cancellationToken);
            if (studentCount > 0)
            {
                logger.LogWarning(
                    "[TRACKING][GROUP_DELETE][CHECK_FAILED] GroupId={GroupId} Reason=linked_students Count={Count}",
                    groupId, studentCount);
                return Conflict(new
                {
                    message = $"Cannot delete this group because {studentCount} student(s) are still assigned to it. Move the students first.",
                    studentCount,
                });
            }

            group.IsActive = false;
            group.UpdatedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
            logger.LogInformation(
                "[TRACKING][GROUP_DELETE][SUCCESS] GroupId={GroupId} DurationMs={DurationMs}",
                groupId, (long)(DateTime.UtcNow - startedAt).TotalMilliseconds);
            return NoContent();
        }
        catch (Exception ex)
        {
            logger.LogError(ex,
                "[TRACKING][GROUP_DELETE][ERROR] GroupId={GroupId} DurationMs={DurationMs}",
                groupId, (long)(DateTime.UtcNow - startedAt).TotalMilliseconds);
            throw;
        }
    }
}
