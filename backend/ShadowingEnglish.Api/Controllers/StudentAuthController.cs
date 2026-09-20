using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ShadowingEnglish.Api.Auth;
using ShadowingEnglish.Api.DTOs.Tracking;
using ShadowingEnglish.Api.Services;

namespace ShadowingEnglish.Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class StudentAuthController(
    StudentTrackingService service,
    IConfiguration configuration,
    DatabaseReadinessState databaseState,
    TabSessionTokenService tabSessions,
    ILogger<StudentAuthController> logger) : ControllerBase
{
    [AllowAnonymous]
    [HttpPost("student-login")]
    public async Task<ActionResult<StudentLoginDto>> StudentLogin(
        StudentLoginRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
        {
            logger.LogWarning("[AUTH][STUDENT_LOGIN][CHECK_FAILED] Empty credentials");
            return BadRequest(new { message = "Email and password are required." });
        }

        if (!databaseState.IsReady)
        {
            logger.LogWarning("[AUTH][STUDENT_LOGIN][DB_NOT_READY] Code={Code}", databaseState.ErrorCode);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new
            {
                code = "DATABASE_NOT_READY",
                databaseErrorCode = databaseState.ErrorCode,
                message = databaseState.ErrorMessage,
            });
        }

        var result = await service.AuthenticateStudentAsync(request, cancellationToken);
        if (result is null)
        {
            return Unauthorized(new { message = "Invalid credentials or inactive account." });
        }

        await SignInAsync(
            result.StudentId,
            result.Name,
            result.Email,
            "student",
            result.GroupId,
            cancellationToken);
        var tabToken = tabSessions.Create(
            result.StudentId,
            result.Name,
            result.Email,
            "student",
            result.GroupId);
        logger.LogInformation(
            "[AUTH][TAB_SESSION][SUCCESS] UserId={UserId} Role=student GroupId={GroupId}",
            result.StudentId,
            result.GroupId);
        return Ok(result with { SessionToken = tabToken });
    }

    [AllowAnonymous]
    [HttpPost("demo-login")]
    public async Task<ActionResult<RoleLoginDto>> DemoLogin(
        DemoRoleLoginRequest request,
        CancellationToken cancellationToken)
    {
        if (!configuration.GetValue<bool>("DemoAuth:Enabled"))
        {
            logger.LogWarning("[AUTH][DEMO_LOGIN][CHECK_FAILED] Demo authentication is disabled");
            return NotFound(new { message = "Demo authentication is disabled." });
        }

        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
        {
            logger.LogWarning("[AUTH][DEMO_LOGIN][CHECK_FAILED] Empty credentials");
            return BadRequest(new { message = "Email and password are required." });
        }

        var email = request.Email.Trim().ToLowerInvariant();
        var expectedPassword = configuration["DemoAuth:Password"] ?? string.Empty;
        var users = new Dictionary<string, RoleLoginDto>(StringComparer.OrdinalIgnoreCase)
        {
            ["admin@demo.com"] = new("admin-demo", "Admin Demo", "admin@demo.com", "admin"),
            ["supervisor@demo.com"] = new("supervisor-demo", "Supervisor Demo", "supervisor@demo.com", "supervisor"),
            ["teacher@demo.com"] = new("teacher-demo", "Teacher Demo", "teacher@demo.com", "teacher"),
        };

        if (string.IsNullOrWhiteSpace(expectedPassword) ||
            !string.Equals(request.Password, expectedPassword, StringComparison.Ordinal) ||
            !users.TryGetValue(email, out var user))
        {
            logger.LogWarning("[AUTH][DEMO_LOGIN][CHECK_FAILED] Email={Email}", email);
            return Unauthorized(new { message = "Invalid demo credentials." });
        }

        await SignInAsync(user.Id, user.Name, user.Email, user.Role, string.Empty, cancellationToken);
        var tabToken = tabSessions.Create(user.Id, user.Name, user.Email, user.Role, string.Empty);
        logger.LogInformation("[AUTH][DEMO_LOGIN][SUCCESS] UserId={UserId} Role={Role}", user.Id, user.Role);
        logger.LogInformation("[AUTH][TAB_SESSION][SUCCESS] UserId={UserId} Role={Role}", user.Id, user.Role);
        return Ok(user with { SessionToken = tabToken });
    }

    [Authorize]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "unknown";
        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        logger.LogInformation("[AUTH][LOGOUT][SUCCESS] UserId={UserId}", userId);
        return NoContent();
    }

    [Authorize]
    [HttpGet("session")]
    public async Task<ActionResult<AuthSessionDto>> Session(CancellationToken cancellationToken)
    {
        var timer = System.Diagnostics.Stopwatch.StartNew();
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty;
        var role = User.FindFirstValue(ClaimTypes.Role) ?? string.Empty;
        logger.LogInformation("[AUTH][SESSION][START] UserId={UserId} Role={Role}", userId, role);

        if (string.Equals(role, "student", StringComparison.OrdinalIgnoreCase))
        {
            if (!databaseState.IsReady)
            {
                logger.LogWarning("[AUTH][SESSION][DB_NOT_READY] StudentId={StudentId} Code={Code}", userId, databaseState.ErrorCode);
                return StatusCode(StatusCodes.Status503ServiceUnavailable, new
                {
                    code = "DATABASE_NOT_READY",
                    databaseErrorCode = databaseState.ErrorCode,
                    message = databaseState.ErrorMessage,
                });
            }

            var student = await service.GetStudentSessionAsync(userId, cancellationToken);
            if (student is null)
            {
                logger.LogWarning("[AUTH][SESSION][CHECK_FAILED] StudentId={StudentId} inactive or missing", userId);
                return Unauthorized(new { message = "The student session is no longer active." });
            }
            var sessionGroupClaim = User.FindFirstValue("group_id") ?? string.Empty;
            if (!string.Equals(sessionGroupClaim, student.GroupId, StringComparison.Ordinal))
            {
                logger.LogInformation(
                    "[AUTH][SESSION][GROUP_REFRESH] StudentId={StudentId} OldGroupId={OldGroupId} NewGroupId={NewGroupId}",
                    student.StudentId,
                    sessionGroupClaim,
                    student.GroupId);
            }
            // Refresh the compatibility cookie too, so direct media requests that cannot
            // attach the per-tab header use the student's current group after a move.
            await SignInAsync(
                student.StudentId,
                student.Name,
                student.Email,
                "student",
                student.GroupId,
                cancellationToken);
            var refreshedToken = tabSessions.Create(
                student.StudentId,
                student.Name,
                student.Email,
                "student",
                student.GroupId);
            logger.LogInformation(
                "[AUTH][SESSION][SUCCESS] UserId={UserId} Role=student DurationMs={DurationMs}",
                student.StudentId,
                timer.ElapsedMilliseconds);
            return Ok(new AuthSessionDto(
                student.StudentId,
                student.Name,
                student.Email,
                "student",
                student.StudentId,
                student.GroupId,
                student.GroupName,
                student.CefrLevel,
                refreshedToken));
        }

        var currentName = User.FindFirstValue(ClaimTypes.Name) ?? string.Empty;
        var currentEmail = User.FindFirstValue(ClaimTypes.Email) ?? string.Empty;
        var refreshedRoleToken = tabSessions.Create(userId, currentName, currentEmail, role, string.Empty);
        logger.LogInformation(
            "[AUTH][SESSION][SUCCESS] UserId={UserId} Role={Role} DurationMs={DurationMs}",
            userId,
            role,
            timer.ElapsedMilliseconds);
        return Ok(new AuthSessionDto(
            userId,
            currentName,
            currentEmail,
            role,
            null,
            null,
            null,
            null,
            refreshedRoleToken));
    }

    private async Task SignInAsync(
        string id,
        string name,
        string email,
        string role,
        string groupId,
        CancellationToken cancellationToken)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, id),
            new(ClaimTypes.Name, name),
            new(ClaimTypes.Email, email),
            new(ClaimTypes.Role, role),
        };
        if (!string.IsNullOrWhiteSpace(groupId)) claims.Add(new Claim("group_id", groupId));
        var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
        var principal = new ClaimsPrincipal(identity);
        await HttpContext.SignInAsync(
            CookieAuthenticationDefaults.AuthenticationScheme,
            principal,
            new AuthenticationProperties
            {
                IsPersistent = false,
                AllowRefresh = true,
                ExpiresUtc = DateTimeOffset.UtcNow.AddHours(12),
            });
        cancellationToken.ThrowIfCancellationRequested();
    }
}
