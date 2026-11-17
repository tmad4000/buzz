# Channel Timeline view

The desktop channel header offers **Threads | Timeline**. Threads remains the default.
The choice is local to this browser/device, relay and channel; no signed events,
thread relations or other participants' preferences change.

Timeline merges the loaded channel window with each summarized reply subtree.
It sorts by the original `created_at`, then event ID, and removes depth indentation
and collapsed thread summaries from this presentation. Parent/root references stay
intact. Each reply has a compact parent-author/body chip; clicking it or Reply
switches to Threads, opens the original root, expands the path and targets that
specific message. Missing parents get an honest unavailable label until loaded.
The main Timeline composer posts top-level messages.

Channel history keeps its existing pagination. Discovered reply roots share the
existing paginated thread query cache and loader, including its two-native-read
concurrency limit and page safety bound. Switching away cancels queued work through
query abort signals. Loading/refetching and failed subtree states remain visible;
Retry reloads failed subtrees while successful history stays usable.

Reactions, edits, deletion overlays, live subscriptions and send use the existing
message paths. Timeline reply rows use the existing `useVisibleThreadReplies`
observer and the channel pane's `onSidebarRepliesRevealed` callback. This preserves
the PR31 seam: its body-visibility/admission checks and `markVisibleReplies` replace
the same paths, without acknowledging reply fetches or view switches. Organization
annotations can change reply context presentation; the flat comparator only reads
original message timestamps and IDs.

## Acceptance

`desktop/tests/e2e/channel-timeline.spec.ts` exercises the actual app with the
synthetic Tauri mock bridge: chronology, nested chips/ancestor expansion, live
replies, reaction toggling, top-level sending, exact thread reply sending, panel
cleanup, local preference persistence, 205 same-second replies across a page
boundary, bounded concurrency, loading and partial failure/retry.

Human acceptance before ready-for-review: open a busy channel, select Timeline,
scroll through older roots/replies, receive a new reply, react and post a top-level
message. Open channel management and click a nested reply chip; confirm management
closes, Threads opens at that reply, and sending replies there. Return to Timeline,
switch channels and reload. On an integration build including PR31, confirm only
visible reply bodies clear unseen markers in a focused foreground view.

Linux browser acceptance does not verify native macOS or iOS behavior.
