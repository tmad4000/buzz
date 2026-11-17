# Send to thread

The main channel and DM composer offers **Send to thread…** beside Send.
Opening the picker searches loaded roots in the current conversation. Root
keyword overlap ranks first, mentioned participant names second, and latest
reply/root recency breaks ties. It shows at most three destinations, each with
a root excerpt, author, reply count and reason, plus **New message**. Existing
roots with no replies can receive their first reply. Pending roots, replies and
system events are excluded.

Tab to the button and press Enter or Space. Arrow keys move between choices;
Home/End jump to first/last. Enter/Space on a choice sends. Escape or clicking
outside dismisses without sending or clearing the draft. New message sends as
a root. Regular Send keeps its existing behavior.

The chosen root is captured before asynchronous mention/media preparation and
uses the existing reply publisher. It does not select a different side panel or
change inline expansion. Publish failure keeps the draft for an explicit retry.
Picker state is local to the composer and resets with its channel/draft scope.
It must respect the split-pane composer's existing ownership/disabled contract.

This first slice searches the loaded message window, not complete relay history.
It makes no model/API ranking request and never auto-selects a destination. It
adds no new thread hierarchy, move operation, transclusion, or notification path.
Intended release: desktop .6 after .5, preserving PR7 inline threads and the
separate pane-isolation work. Final integrated-head/native acceptance is separate.

## Human check before marking the draft PR ready

1. In a channel with two distinct topics, draft a follow-up and open the picker.
   Confirm the relevant root appears first and that opening/Escape sends nothing.
2. Choose that root by keyboard. Confirm one reply in that thread, the draft
   clears after success, and an unrelated side panel remains selected.
3. Choose New message for another draft. Confirm it appears as a new root.
4. Repeat in a DM; navigate between conversations with the picker open and
   confirm candidate/draft scopes stay separate.
5. On the final split-pane build, repeat with two panes, including the same
   conversation in both. Confirm only the owning composer can send and the
   other pane's draft, picker and selected thread remain unchanged.

Linux Chrome mock-bridge tests cover client interactions and publisher payloads;
they do not verify macOS webview/native runtime or a live relay's acceptance.
