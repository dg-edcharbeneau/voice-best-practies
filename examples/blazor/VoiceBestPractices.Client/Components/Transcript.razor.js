// Collocated JS module for Transcript.razor (JS isolation — imported on demand,
// never attached to window). A single focused DOM job: keep the transcript list
// scrolled to its newest turn.
export function scrollToEnd(list) {
    if (list) {
        list.scrollTop = list.scrollHeight;
    }
}
