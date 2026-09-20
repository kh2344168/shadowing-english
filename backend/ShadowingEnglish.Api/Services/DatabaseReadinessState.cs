namespace ShadowingEnglish.Api.Services;

public sealed class DatabaseReadinessState
{
    private readonly object gate = new();

    public bool IsReady { get; private set; }
    public string ErrorCode { get; private set; } = string.Empty;
    public string ErrorMessage { get; private set; } = string.Empty;
    public DateTime? LastCheckedAtUtc { get; private set; }

    public void MarkReady()
    {
        lock (gate)
        {
            IsReady = true;
            ErrorCode = string.Empty;
            ErrorMessage = string.Empty;
            LastCheckedAtUtc = DateTime.UtcNow;
        }
    }

    public void MarkFailed(string code, Exception exception)
    {
        lock (gate)
        {
            IsReady = false;
            ErrorCode = code;
            ErrorMessage = exception.Message;
            LastCheckedAtUtc = DateTime.UtcNow;
        }
    }
}
