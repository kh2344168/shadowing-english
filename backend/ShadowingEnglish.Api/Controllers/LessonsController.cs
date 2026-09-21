using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ShadowingEnglish.Api.DTOs.Lessons;
using ShadowingEnglish.Api.Services;

namespace ShadowingEnglish.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/lessons")]
public sealed class LessonsController(LessonService lessonService) : ControllerBase
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    [HttpGet]
    [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
    public async Task<ActionResult<IReadOnlyList<LessonDto>>> GetAll(
        CancellationToken cancellationToken)
    {
        if (User.IsInRole("student"))
        {
            var groupId = User.FindFirstValue("group_id");
            if (string.IsNullOrWhiteSpace(groupId)) return Forbid();
            return Ok(await lessonService.GetPublishedForGroupAsync(groupId, cancellationToken));
        }
        return Ok(await lessonService.GetAllAsync(cancellationToken));
    }

    [HttpGet("{id}")]
    [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
    public async Task<ActionResult<LessonDto>> GetById(
        string id,
        CancellationToken cancellationToken)
    {
        var normalizedId = id.Trim();
        if (!await CanReadLessonAsync(normalizedId, cancellationToken)) return Forbid();
        var lesson = await lessonService.GetByIdAsync(normalizedId, cancellationToken);
        return lesson is null ? NotFound() : Ok(lesson);
    }

    [HttpGet("{id}/media")]
    public async Task<IActionResult> GetMedia(
        string id,
        CancellationToken cancellationToken)
    {
        var normalizedId = id.Trim();
        if (!await CanReadLessonAsync(normalizedId, cancellationToken)) return Forbid();
        var media = await lessonService.GetMediaAsync(normalizedId, cancellationToken);

        if (media is null)
        {
            return NotFound(new { message = "Lesson media was not found." });
        }

        // The lesson DTO emits a versioned media URL based on UpdatedAtUtc. Versioned
        // requests are safe to keep in the student's private browser cache; legacy
        // unversioned callers remain no-store so an edited lesson can never serve stale
        // media accidentally.
        if (!string.IsNullOrWhiteSpace(Request.Query["v"]))
        {
            Response.Headers.CacheControl = "private,max-age=86400,immutable";
        }
        else
        {
            Response.Headers.CacheControl = "no-store";
        }

        return File(media.Data, media.MediaType, enableRangeProcessing: true);
    }

    [Authorize(Roles = "admin")]
    [HttpPost]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(262_144_000)]
    public async Task<ActionResult<LessonDto>> Create(
        [FromForm] SaveLessonForm form,
        CancellationToken cancellationToken)
    {
        var parseResult = ParseAndValidate(form.LessonJson, null);
        if (parseResult.Error is not null)
        {
            return BadRequest(new { message = parseResult.Error });
        }

        var saved = await lessonService.SaveAsync(
            parseResult.Request!,
            form.Media,
            null,
            cancellationToken);

        return CreatedAtAction(nameof(GetById), new { id = saved.Id }, saved);
    }

    [Authorize(Roles = "admin")]
    [HttpPut("{id}")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(262_144_000)]
    public async Task<ActionResult<LessonDto>> Save(
        string id,
        [FromForm] SaveLessonForm form,
        CancellationToken cancellationToken)
    {
        var parseResult = ParseAndValidate(form.LessonJson, id);
        if (parseResult.Error is not null)
        {
            return BadRequest(new { message = parseResult.Error });
        }

        var saved = await lessonService.SaveAsync(
            parseResult.Request!,
            form.Media,
            id,
            cancellationToken);

        return Ok(saved);
    }

    [Authorize(Roles = "admin")]
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(
        string id,
        CancellationToken cancellationToken)
    {
        var normalizedId = id.Trim();
        var usage = await lessonService.GetPublishedUsageAsync(
            normalizedId,
            cancellationToken);

        if (usage.Count > 0)
        {
            return Conflict(new
            {
                message = "The lesson is still used by a published group curriculum.",
                references = usage,
            });
        }

        var deleted = await lessonService.DeleteAsync(normalizedId, cancellationToken);
        return deleted ? NoContent() : NotFound();
    }

    private async Task<bool> CanReadLessonAsync(string lessonId, CancellationToken cancellationToken)
    {
        if (User.IsInRole("admin") || User.IsInRole("supervisor") || User.IsInRole("teacher")) return true;
        if (!User.IsInRole("student")) return false;
        var groupId = User.FindFirstValue("group_id");
        return !string.IsNullOrWhiteSpace(groupId) &&
            await lessonService.IsPublishedForGroupAsync(groupId, lessonId, cancellationToken);
    }

    private static (SaveLessonRequest? Request, string? Error) ParseAndValidate(
        string lessonJson,
        string? routeId)
    {
        if (string.IsNullOrWhiteSpace(lessonJson))
        {
            return (null, "Lesson data is required.");
        }

        SaveLessonRequest? request;

        try
        {
            request = JsonSerializer.Deserialize<SaveLessonRequest>(lessonJson, JsonOptions);
        }
        catch (JsonException)
        {
            return (null, "Lesson data is not valid JSON.");
        }

        if (request is null)
        {
            return (null, "Lesson data is required.");
        }

        var id = string.IsNullOrWhiteSpace(routeId) ? request.Id : routeId;
        if (!string.IsNullOrWhiteSpace(id) && id.Trim().Length > 160)
        {
            return (null, "Lesson id is too long.");
        }

        if (string.IsNullOrWhiteSpace(request.Title))
        {
            return (null, "Lesson title is required.");
        }

        if (request.Title.Trim().Length > 240)
        {
            return (null, "Lesson title is too long.");
        }

        if ((request.Description?.Trim().Length ?? 0) > 2000)
        {
            return (null, "Lesson description is too long.");
        }

        if ((request.MediaFileName?.Trim().Length ?? 0) > 260 ||
            (request.MediaType?.Trim().Length ?? 0) > 120)
        {
            return (null, "Lesson media information is too long.");
        }

        if (request.RequiredRepetitions < 1)
        {
            return (null, "Required repetitions must be at least 1.");
        }

        if (request.Segments is null || request.Segments.Count == 0)
        {
            return (null, "Add at least one lesson segment.");
        }

        if (request.Segments.Any(segment =>
                string.IsNullOrWhiteSpace(segment.Text) ||
                segment.Text.Trim().Length > 2000 ||
                (segment.Translation?.Trim().Length ?? 0) > 2000 ||
                segment.Start < 0 ||
                segment.End <= segment.Start))
        {
            return (null, "Every segment needs text and a valid start/end time.");
        }

        return (request, null);
    }
}
