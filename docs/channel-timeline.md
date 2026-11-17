# Channel Order setting and Timeline view

The desktop channel header offers one **Order** setting:

1. **Threads by post time** — the existing default, available now.
2. **Threads by latest activity** — reserved and visibly disabled as coming soon.
3. **Timeline** — flat chronological conversation, available now.

This first increment ships modes 1 and 3 under Jacob's explicit fallback. It keeps
the original per-channel preference key/values, including any saved Timeline choice;
there is no second overlapping toggle. Activity ordering is not silently simulated.
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

## Latest-activity mode design (follow-up; not enabled)

The stable preference identity `activity` is reserved alongside `threads` and
`timeline`. Its ordering unit is the whole root plus its inline reply subtree.
The key is `max(root.created_at, latest_reply.created_at)`, then root ID for ties;
reply order inside the block remains original timestamp/ID. Signed organization
annotations never rewrite those clocks. Paginated summary/reply evidence can
advance the key without changing signed events, read state or identity.

Keep semantic order separate from displayed order while someone is reading. Save
the current message ID and pixel offset as the viewport anchor. Queue activity
moves while away from the bottom, retaining that displayed order and placing a
subtle **thread moved ↓** / **new activity** marker at the origin. Activating the
marker or returning to following newest applies the queued root-block moves and
restores the keyed anchor after measurement. At the bottom, following may apply
moves as one measured update; a short-lived origin marker explains the relocation.
Do not treat a moved block, a summary, or a history fetch as a seen reply body.

Before enabling mode 2, acceptance must cover live bumps above/below the viewport,
expanded root blocks, same-second ties, older-page merges, a selected reply inside
a moved block, focus/background changes, and PR31 body-only acknowledgement. This
requires scroll-manager integration rather than a simple sort replacement, so it
is deliberately outside the first stable Timeline increment.

## Desktop screenshots

Synthetic mock-bridge fixtures at 1440 × 1000:

| Threads by post time | Timeline |
| --- | --- |
| ![Threads by post time](assets/screenshots/channel-order-threads.png) | ![Timeline](assets/screenshots/channel-order-timeline.png) |
