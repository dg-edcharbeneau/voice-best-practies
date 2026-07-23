using Microsoft.AspNetCore.Components;
using VoiceBestPractices.Client.Voice;

namespace VoiceBestPractices.Client.Pages;

/// <summary>
/// A thin view over <see cref="ConversationService"/>. The page holds no session
/// state and no orchestration logic — it renders the service's state, re-renders
/// when the service signals a change, and stops the session when it unmounts
/// (Best practice #8). All the work lives in the service.
/// </summary>
public sealed partial class Home : IAsyncDisposable
{
    [Inject] private ConversationService Conversation { get; set; } = default!;

    protected override void OnInitialized()
        => Conversation.Changed += OnConversationChanged;

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (firstRender)
        {
            await Conversation.InitializeAsync();
        }
    }

    // The service raises Changed from a JS→.NET callback thread; marshal the
    // re-render onto the component's dispatcher.
    private void OnConversationChanged() => InvokeAsync(StateHasChanged);

    async ValueTask IAsyncDisposable.DisposeAsync()
    {
        // Unsubscribe first so the teardown's state changes don't try to render a
        // disposed component, then release the mic/sockets for this session.
        Conversation.Changed -= OnConversationChanged;
        await Conversation.StopAsync();
    }
}
