using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ShadowingEnglish.Api.DTOs.Lessons;
using ShadowingEnglish.Api.Services;

namespace ShadowingEnglish.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/lesson-ai")]
public sealed class LessonAiController(LessonAiService lessonAiService) : ControllerBase
{
    [Authorize(Roles = "admin")]
    [HttpGet("status")]
    public async Task<ActionResult<LessonAiStatusResponseDto>> GetStatus(
        [FromQuery] bool verify,
        CancellationToken cancellationToken)
    {
        return Ok(await lessonAiService.GetStatusAsync(verify, cancellationToken));
    }

    [HttpPost("structured")]
    public async Task<ActionResult<LessonStructuredAiResponseDto>> GenerateStructured(
        [FromBody] LessonStructuredAiRequestDto request,
        CancellationToken cancellationToken)
    {
        var capability = (request.Capability ?? string.Empty).Trim().ToLowerInvariant();
        if (capability is not ("content" or "conversation") ||
            string.IsNullOrWhiteSpace(request.Instructions) ||
            string.IsNullOrWhiteSpace(request.UserContent) ||
            string.IsNullOrWhiteSpace(request.SchemaName) ||
            request.Instructions.Length > 40_000 ||
            request.UserContent.Length > 150_000 ||
            request.SchemaName.Length > 120 ||
            request.Schema.ValueKind != System.Text.Json.JsonValueKind.Object)
        {
            return BadRequest(new ProblemDetails
            {
                Title = "Structured AI request is invalid.",
                Detail = "Capability, instructions, user content and a JSON schema are required.",
            });
        }

        if (capability == "content" && !User.IsInRole("admin"))
        {
            return Forbid();
        }

        try
        {
            return Ok(await lessonAiService.GenerateStructuredAsync(
                request with { Capability = capability },
                cancellationToken));
        }
        catch (InvalidOperationException exception)
        {
            return Problem(
                title: "AI is not configured on the Backend.",
                detail: exception.Message,
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }
        catch (LessonAiProviderException exception)
        {
            return Problem(
                title: "All configured AI providers failed.",
                detail: exception.Message,
                statusCode: StatusCodes.Status502BadGateway);
        }
    }

    [Authorize(Roles = "admin")]
    [HttpPost("process")]
    public async Task<ActionResult<LessonContentGenerationResponseDto>> ProcessLesson(
        [FromBody] LessonContentGenerationRequestDto request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.LessonTitle) ||
            request.Segments is null ||
            request.Segments.Count == 0 ||
            request.Segments.Count > 250 ||
            request.Segments.All(segment => string.IsNullOrWhiteSpace(segment.Text)) ||
            request.Segments.Any(segment => (segment.Text?.Length ?? 0) > 2_000))
        {
            return BadRequest(new ProblemDetails
            {
                Title = "Lesson content is missing.",
                Detail = "A lesson title and at least one source sentence are required.",
            });
        }

        try
        {
            return Ok(await lessonAiService.ProcessLessonAsync(request, cancellationToken));
        }
        catch (InvalidOperationException exception)
        {
            return Problem(
                title: "AI lesson processing is not available.",
                detail: exception.Message,
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }
        catch (LessonAiProviderException exception)
        {
            return Problem(
                title: "The AI provider could not process this lesson.",
                detail: exception.Message,
                statusCode: StatusCodes.Status502BadGateway);
        }
    }

    [HttpPost("conversation/turn")]
    public async Task<ActionResult<LessonConversationTurnResponseDto>> CreateConversationTurn(
        [FromBody] LessonConversationTurnRequestDto request,
        CancellationToken cancellationToken)
    {
        if (request.Config is null ||
            string.IsNullOrWhiteSpace(request.StudentMessage) ||
            request.StudentMessage.Length > 2_000 ||
            string.IsNullOrWhiteSpace(request.Config.Scenario))
        {
            return BadRequest(new ProblemDetails
            {
                Title = "Conversation content is missing.",
                Detail = "A scenario and a learner answer are required.",
            });
        }

        try
        {
            return Ok(await lessonAiService.CreateConversationTurnAsync(
                request,
                cancellationToken));
        }
        catch (InvalidOperationException exception)
        {
            return Problem(
                title: "The AI coach is not available.",
                detail: exception.Message,
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }
        catch (LessonAiProviderException exception)
        {
            return Problem(
                title: "The AI provider could not complete this turn.",
                detail: exception.Message,
                statusCode: StatusCodes.Status502BadGateway);
        }
    }

    [Authorize(Roles = "admin")]
    [HttpPost("image")]
    public async Task<ActionResult<LessonImageGenerationResponseDto>> GenerateImage(
        [FromBody] LessonImageGenerationRequestDto request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Term) ||
            request.Term.Length > 160 ||
            string.IsNullOrWhiteSpace(request.Prompt) ||
            request.Prompt.Length > 2_000)
        {
            return BadRequest(new ProblemDetails
            {
                Title = "Image context is missing.",
                Detail = "The vocabulary term and its visual prompt are required.",
            });
        }

        try
        {
            return Ok(await lessonAiService.GenerateVocabularyImageAsync(
                request,
                cancellationToken));
        }
        catch (InvalidOperationException exception)
        {
            return Problem(
                title: "AI image generation is not available.",
                detail: exception.Message,
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }
        catch (LessonAiProviderException exception)
        {
            return Problem(
                title: "The AI provider could not generate this image.",
                detail: exception.Message,
                statusCode: StatusCodes.Status502BadGateway);
        }
    }

    [HttpGet("images/{fileName}")]
    public IActionResult GetGeneratedImage(string fileName)
    {
        var path = lessonAiService.GetGeneratedImagePath(fileName);
        if (path is null) return NotFound();

        var extension = Path.GetExtension(path);
        var contentType = extension.Equals(".png", StringComparison.OrdinalIgnoreCase)
            ? "image/png"
            : "image/jpeg";
        return PhysicalFile(path, contentType);
    }
}
