using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;
using VoiceBestPractices.Client.Voice;

namespace VoiceBestPractices.Client.Pages;

/// <summary>
/// The state-holding seam over <see cref="ConversationInterop"/>. It does only
/// the Blazor-specific work: subscribe to the orchestrator's callbacks, marshal
/// them onto the UI thread, keep one interop instance for the component's
/// lifetime, and tear the session down on dispose (Best practice #8). Button
/// enable/disable is derived purely from <see cref="_state"/>, so the controls
/// can't drift out of sync with what's actually possible.
/// </summary>
public sealed partial class Home : IAsyncDisposable
{
    [Inject] private IJSRuntime JS { get; set; } = default!;

    private ConversationInterop? _interop;
    private ConversationState _state = ConversationState.Idle;
    private readonly List<string> _committed = [];
    private string _interim = "";
    private double _level;
    private string? _error;

    protected override void OnInitialized()
    {
        // Create the wrapper and wire callbacks now; the actual module import
        // happens after first render (JS isn't available before then).
        _interop = new ConversationInterop(JS);
        _interop.StateChanged += OnStateChangedAsync;
        _interop.TranscriptUpdated += OnTranscriptAsync;
        _interop.LevelChanged += OnLevelAsync;
        _interop.ErrorRaised += OnErrorAsync;
    }

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (!firstRender || _interop is null)
        {
            return;
        }

        // One-time environment check. If the browser can't run the demo, surface
        // it and flip to the error state (Start stays clickable so the user can
        // retry after fixing permissions).
        var blocker = await _interop.InitializeAsync();
        if (blocker is not null)
        {
            _error = blocker;
            _state = ConversationState.Error;
            StateHasChanged();
        }
    }

    private async Task StartAsync()
    {
        _error = null;
        _committed.Clear();
        _interim = "";
        if (_interop is not null)
        {
            await _interop.StartAsync();
        }
    }

    private async Task StopAsync()
    {
        if (_interop is not null)
        {
            await _interop.StopAsync();
        }
    }

    private async Task InterruptAsync()
    {
        if (_interop is not null)
        {
            await _interop.InterruptResponseAsync();
        }
    }

    // --- orchestrator callbacks, marshalled onto the UI thread ------------------

    private Task OnStateChangedAsync(ConversationState state)
        => InvokeAsync(() =>
        {
            _state = state;
            StateHasChanged();
        });

    private Task OnTranscriptAsync(TranscriptUpdate update)
        => InvokeAsync(() =>
        {
            if (update.Committed)
            {
                // The in-progress turn is final: append it and clear the interim line.
                var text = update.Interim.Trim();
                if (text.Length > 0)
                {
                    _committed.Add(text);
                }
                _interim = "";
            }
            else
            {
                // Interim update (or reset) — replace the live line in place.
                _interim = update.Interim;
            }
            StateHasChanged();
        });

    private Task OnLevelAsync(double level)
        => InvokeAsync(() =>
        {
            _level = level;
            StateHasChanged();
        });

    private Task OnErrorAsync(string message)
        => InvokeAsync(() =>
        {
            _error = message;
            StateHasChanged();
        });

    public async ValueTask DisposeAsync()
    {
        if (_interop is not null)
        {
            _interop.StateChanged -= OnStateChangedAsync;
            _interop.TranscriptUpdated -= OnTranscriptAsync;
            _interop.LevelChanged -= OnLevelAsync;
            _interop.ErrorRaised -= OnErrorAsync;
            await _interop.DisposeAsync();
        }
    }
}
