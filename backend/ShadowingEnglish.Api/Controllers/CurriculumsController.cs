using System.Diagnostics;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ShadowingEnglish.Api.Data;
using ShadowingEnglish.Api.DTOs.Curriculums;
using ShadowingEnglish.Api.Models;

namespace ShadowingEnglish.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/admin/curriculums")]
public sealed class CurriculumsController(
    AppDbContext db,
    ILogger<CurriculumsController> logger) : ControllerBase
{
    [Authorize(Roles = "admin,supervisor,teacher")]
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<CurriculumLibraryDto>>> GetAll(CancellationToken cancellationToken)
    {
        var watch = Stopwatch.StartNew();
        logger.LogInformation("[CURRICULUM][LIST][START]");
        try
        {
            var rows = await db.Curriculums
                .AsNoTracking()
                .OrderByDescending(item => item.UpdatedAtUtc)
                .ToListAsync(cancellationToken);
            logger.LogInformation("[CURRICULUM][LIST][SUCCESS] Count={Count} DurationMs={DurationMs}", rows.Count, watch.ElapsedMilliseconds);
            return Ok(rows.Select(ToDto).ToArray());
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "[CURRICULUM][LIST][ERROR] DurationMs={DurationMs}", watch.ElapsedMilliseconds);
            throw;
        }
    }

    [Authorize(Roles = "admin,supervisor,teacher")]
    [HttpGet("{curriculumId}")]
    public async Task<ActionResult<CurriculumLibraryDto>> GetById(string curriculumId, CancellationToken cancellationToken)
    {
        var watch = Stopwatch.StartNew();
        logger.LogInformation("[CURRICULUM][GET][START] CurriculumId={CurriculumId}", curriculumId);
        var row = await db.Curriculums.AsNoTracking().SingleOrDefaultAsync(item => item.Id == curriculumId, cancellationToken);
        if (row is null)
        {
            logger.LogWarning("[CURRICULUM][GET][CHECK_FAILED] CurriculumId={CurriculumId} Reason=not_found DurationMs={DurationMs}", curriculumId, watch.ElapsedMilliseconds);
            return NotFound(new { message = "Curriculum not found." });
        }
        logger.LogInformation("[CURRICULUM][GET][SUCCESS] CurriculumId={CurriculumId} DurationMs={DurationMs}", curriculumId, watch.ElapsedMilliseconds);
        return Ok(ToDto(row));
    }

    [Authorize(Roles = "admin")]
    [HttpPut("{curriculumId}")]
    public async Task<ActionResult<CurriculumLibraryDto>> Upsert(
        string curriculumId,
        UpsertCurriculumRequest request,
        CancellationToken cancellationToken)
    {
        var watch = Stopwatch.StartNew();
        logger.LogInformation("[CURRICULUM][UPSERT][START] CurriculumId={CurriculumId} Status={Status}", curriculumId, request.Status);

        if (!string.Equals(curriculumId, request.Id, StringComparison.Ordinal))
        {
            logger.LogWarning("[CURRICULUM][UPSERT][CHECK_FAILED] CurriculumId={CurriculumId} Reason=id_mismatch", curriculumId);
            return BadRequest(new { message = "Route curriculum id must match body id." });
        }
        if (string.IsNullOrWhiteSpace(request.Id) || string.IsNullOrWhiteSpace(request.Name))
        {
            logger.LogWarning("[CURRICULUM][UPSERT][CHECK_FAILED] CurriculumId={CurriculumId} Reason=missing_required", curriculumId);
            return BadRequest(new { message = "Curriculum id and name are required." });
        }
        var description = request.Description ?? string.Empty;
        var weeksJson = request.WeeksJson ?? string.Empty;
        var status = request.Status ?? string.Empty;
        if (request.Id.Length > 160 || request.Name.Trim().Length > 240 || description.Length > 4000)
        {
            logger.LogWarning("[CURRICULUM][UPSERT][CHECK_FAILED] CurriculumId={CurriculumId} Reason=length", curriculumId);
            return BadRequest(new { message = "Curriculum fields are too long." });
        }
        var normalizedStatus = status.Trim().ToLowerInvariant();
        if (normalizedStatus is not ("draft" or "ready" or "archived"))
        {
            logger.LogWarning("[CURRICULUM][UPSERT][CHECK_FAILED] CurriculumId={CurriculumId} Reason=status Status={Status}", curriculumId, request.Status);
            return BadRequest(new { message = "Curriculum status must be draft, ready, or archived." });
        }
        if (!LooksLikeJsonArray(weeksJson))
        {
            logger.LogWarning("[CURRICULUM][UPSERT][CHECK_FAILED] CurriculumId={CurriculumId} Reason=weeks_json", curriculumId);
            return BadRequest(new { message = "WeeksJson must contain a JSON array." });
        }

        try
        {
            var now = DateTime.UtcNow;
            var row = await db.Curriculums.SingleOrDefaultAsync(item => item.Id == curriculumId, cancellationToken);
            var created = row is null;
            if (row is null)
            {
                row = new CurriculumRecord
                {
                    Id = curriculumId,
                    CreatedAtUtc = request.CreatedAtUtc?.ToUniversalTime() ?? now,
                };
                db.Curriculums.Add(row);
            }

            row.Name = request.Name.Trim();
            row.Description = description.Trim();
            row.Status = normalizedStatus;
            row.WeeksJson = weeksJson;
            row.UpdatedAtUtc = now;
            await db.SaveChangesAsync(cancellationToken);

            var syncedGroups = await SyncLinkedGroupDraftsAsync(row, cancellationToken);
            logger.LogInformation(
                "[CURRICULUM][UPSERT][CHECK_OK] CurriculumId={CurriculumId} LinkedGroupDraftsSynced={SyncedGroups}",
                curriculumId,
                syncedGroups);

            logger.LogInformation(
                "[CURRICULUM][UPSERT][SUCCESS] CurriculumId={CurriculumId} Created={Created} SyncedGroups={SyncedGroups} DurationMs={DurationMs}",
                curriculumId,
                created,
                syncedGroups,
                watch.ElapsedMilliseconds);
            return Ok(ToDto(row));
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "[CURRICULUM][UPSERT][ERROR] CurriculumId={CurriculumId} DurationMs={DurationMs}", curriculumId, watch.ElapsedMilliseconds);
            throw;
        }
    }

    [Authorize(Roles = "admin")]
    [HttpDelete("{curriculumId}")]
    public async Task<IActionResult> Delete(string curriculumId, CancellationToken cancellationToken)
    {
        var watch = Stopwatch.StartNew();
        logger.LogInformation("[CURRICULUM][DELETE][START] CurriculumId={CurriculumId}", curriculumId);
        try
        {
            var row = await db.Curriculums.SingleOrDefaultAsync(item => item.Id == curriculumId, cancellationToken);
            if (row is null)
            {
                logger.LogWarning("[CURRICULUM][DELETE][CHECK_FAILED] CurriculumId={CurriculumId} Reason=not_found DurationMs={DurationMs}", curriculumId, watch.ElapsedMilliseconds);
                return NotFound(new { message = "Curriculum not found." });
            }

            var linkedGroups = await db.LearningGroups
                .AsNoTracking()
                .Where(item => item.IsActive && item.CurriculumId == curriculumId)
                .Select(item => new { item.Id, item.Name })
                .ToListAsync(cancellationToken);
            if (linkedGroups.Count > 0)
            {
                logger.LogWarning(
                    "[CURRICULUM][DELETE][CHECK_FAILED] CurriculumId={CurriculumId} Reason=linked_groups Count={Count} DurationMs={DurationMs}",
                    curriculumId, linkedGroups.Count, watch.ElapsedMilliseconds);
                return Conflict(new
                {
                    message = $"Cannot delete this curriculum because {linkedGroups.Count} active group(s) are linked to it. Move or delete those groups first.",
                    linkedGroupCount = linkedGroups.Count,
                    linkedGroups,
                });
            }

            db.Curriculums.Remove(row);
            await db.SaveChangesAsync(cancellationToken);
            logger.LogInformation("[CURRICULUM][DELETE][SUCCESS] CurriculumId={CurriculumId} DurationMs={DurationMs}", curriculumId, watch.ElapsedMilliseconds);
            return NoContent();
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "[CURRICULUM][DELETE][ERROR] CurriculumId={CurriculumId} DurationMs={DurationMs}", curriculumId, watch.ElapsedMilliseconds);
            throw;
        }
    }

    private async Task<int> SyncLinkedGroupDraftsAsync(CurriculumRecord curriculum, CancellationToken cancellationToken)
    {
        var linkedGroups = await db.LearningGroups
            .Where(item => item.IsActive && item.CurriculumId == curriculum.Id)
            .ToListAsync(cancellationToken);
        if (linkedGroups.Count == 0) return 0;

        var groupIds = linkedGroups.Select(item => item.Id).ToArray();
        var publishedVersions = await db.GroupCurriculumPublications
            .AsNoTracking()
            .Where(item => groupIds.Contains(item.GroupId))
            .ToDictionaryAsync(item => item.GroupId, item => item.Version, cancellationToken);

        using var weeksDocument = JsonDocument.Parse(curriculum.WeeksJson);
        var weeks = weeksDocument.RootElement.Clone();
        var now = DateTime.UtcNow;
        foreach (var group in linkedGroups)
        {
            var version = publishedVersions.GetValueOrDefault(group.Id, 0);
            group.CurriculumName = curriculum.Name;
            group.DraftCurriculumJson = JsonSerializer.Serialize(new
            {
                sourceCurriculumId = curriculum.Id,
                sourceCurriculumName = curriculum.Name,
                version,
                weeks,
                updatedAt = now,
            });
            group.HasDraftChanges = true;
            group.UpdatedAtUtc = now;
            logger.LogInformation(
                "[CURRICULUM][GROUP_DRAFT_SYNC][CHECK_OK] CurriculumId={CurriculumId} GroupId={GroupId} PublishedVersion={PublishedVersion}",
                curriculum.Id, group.Id, version);
        }

        await db.SaveChangesAsync(cancellationToken);
        return linkedGroups.Count;
    }

    private static CurriculumLibraryDto ToDto(CurriculumRecord row) => new(
        row.Id,
        row.Name,
        row.Description,
        row.Status,
        row.WeeksJson,
        row.CreatedAtUtc,
        row.UpdatedAtUtc);

    private static bool LooksLikeJsonArray(string value)
    {
        if (string.IsNullOrWhiteSpace(value)) return false;
        try
        {
            using var document = JsonDocument.Parse(value);
            return document.RootElement.ValueKind == JsonValueKind.Array;
        }
        catch (JsonException)
        {
            return false;
        }
    }
}
