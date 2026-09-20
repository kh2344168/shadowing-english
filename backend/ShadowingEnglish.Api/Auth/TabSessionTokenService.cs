using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;

namespace ShadowingEnglish.Api.Auth;

public sealed class TabSessionTokenService(IDataProtectionProvider dataProtectionProvider)
{
    private const string Purpose = "ShadowingEnglish.TabSession.v1";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly IDataProtector _protector = dataProtectionProvider.CreateProtector(Purpose);

    public string Create(
        string id,
        string name,
        string email,
        string role,
        string groupId,
        TimeSpan? lifetime = null)
    {
        var payload = new TabSessionPayload(
            id,
            name,
            email,
            role,
            groupId,
            DateTimeOffset.UtcNow.Add(lifetime ?? TimeSpan.FromHours(12)).ToUnixTimeMilliseconds());
        return _protector.Protect(JsonSerializer.Serialize(payload, JsonOptions));
    }

    public bool TryRead(string token, out TabSessionPayload payload)
    {
        payload = default!;
        if (string.IsNullOrWhiteSpace(token)) return false;

        try
        {
            var json = _protector.Unprotect(token.Trim());
            var parsed = JsonSerializer.Deserialize<TabSessionPayload>(json, JsonOptions);
            if (parsed is null || string.IsNullOrWhiteSpace(parsed.Id) ||
                string.IsNullOrWhiteSpace(parsed.Role) ||
                parsed.ExpiresAtUnixMs <= DateTimeOffset.UtcNow.ToUnixTimeMilliseconds())
            {
                return false;
            }

            payload = parsed;
            return true;
        }
        catch
        {
            return false;
        }
    }
}

public sealed record TabSessionPayload(
    string Id,
    string Name,
    string Email,
    string Role,
    string GroupId,
    long ExpiresAtUnixMs);
