using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace ShadowingEnglish.Api.Auth;

public sealed class TabSessionAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    TabSessionTokenService tokenService)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "TabSession";
    public const string HeaderName = "X-Shadowing-Session";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var raw = Request.Headers[HeaderName].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(raw))
        {
            return Task.FromResult(AuthenticateResult.NoResult());
        }

        if (!tokenService.TryRead(raw, out var session))
        {
            Logger.LogWarning("[AUTH][TAB_SESSION][CHECK_FAILED] Invalid or expired tab session token Path={Path}", Request.Path);
            return Task.FromResult(AuthenticateResult.Fail("Invalid or expired tab session."));
        }

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, session.Id),
            new(ClaimTypes.Name, session.Name ?? string.Empty),
            new(ClaimTypes.Email, session.Email ?? string.Empty),
            new(ClaimTypes.Role, session.Role),
        };
        if (!string.IsNullOrWhiteSpace(session.GroupId))
        {
            claims.Add(new Claim("group_id", session.GroupId));
        }

        var identity = new ClaimsIdentity(claims, SchemeName);
        var principal = new ClaimsPrincipal(identity);
        var ticket = new AuthenticationTicket(principal, SchemeName);
        return Task.FromResult(AuthenticateResult.Success(ticket));
    }
}
