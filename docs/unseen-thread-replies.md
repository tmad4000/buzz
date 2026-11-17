# Unseen thread replies: Answers inbox first slice

An accent dot, bold summary and `N new` distinguish reply observation from a
plain reply count. The header's `Unseen replies (N)` counts reply observations
pending in loaded channel-window threads and opens the next matching thread at
its first new reply. It opens an already-open thread without toggling it closed.
Programmatic navigation temporarily reveals saved collapsed ancestry in that view
without overwriting or broadcasting saved collapse preferences. Explicit toggles
persist their chosen branch; unrelated sibling preference changes preserve the
local reveal, including while history is loading. Local observer lifecycles include
`viewInstanceId`; canonical synced observation keys do not.

Unloaded channel history remains outside this window; loading older history adds
its threads to the projection. While summary-only threads are being resolved,
the count is a lower bound (`N+`); a failed history read exposes a retry action.

A committed reply **body** must intersect the viewport in a focused, visible
conversation and foreground document before observation advances. Inline Smart
expansion, mounting, fetching a body, opening a channel, and opening a sidebar
alone are not observation. Pending optimistic messages and the reader's own
replies do not count. The existing independent paginated thread-history loader
resolves cold summary-only rows, with at most four history reads in flight per
mounted channel scope. It does not acknowledge any reply by fetching it.

Observation uses the existing self-encrypted, signed, per-user NIP-RS transport:

- `thread:seen:v1:<canonical-root>`: newest actually observed reply author time.
- `msg:seen:v1:<canonical-root>:<reply>`: exact observed body evidence for each reply.

These opaque context keys have no channel parent, so opening or marking a channel
read never advances them. A reply is seen only when its exact marker is at least
its creation time. The newest-observed thread frontier is progress metadata and
never substitutes for an individual body observation, including older/backdated
replies and same-second siblings. `N new` and sidebar earlier-reply folding use
the same exact evidence. Missing/pruned markers remain unknown/unseen, leaving
more content open conservatively.
Updated desktop/web clients share these markers; native mobile observation UI and
writer parity are follow-up work. Existing mobile Activity/Inbox remains unchanged.

The existing read-state retention/budget policy applies: thread/message contexts
are prunable after seven days and under the byte/local-storage budget. Pruning
can conservatively re-raise an old thread's marker. Observation contexts use the
prunable families so they cannot exhaust the permanent channel-state budget or
stop normal read-state sync. This deliberately reuses today's mechanism rather
than adding another event protocol in this slice.

**Explicit per-answer review remains separate.** Neither observation nor channel
read-all is an answer-review action. The future Answers inbox should key review
by reader, canonical answer and material revision, retain review without ordinary
unread expiry, and require its own explicit action (ASTRA design). No answer
annotation, reviewed flag, task-completion flag, notification or public read
receipt is emitted here.

## Human acceptance

Use a channel with an existing collapsed Paseo thread. On a cold open its summary
should gain a dot, bold text and `N new` after history resolves; merely opening
and leaving the channel should preserve it. Expand it above/below the viewport:
only visible bodies should advance observation. The header opens the next source
thread and scrolls to its first new reply, including when that thread is already
open. Receive another reply under a collapsed thread: the marker should return.
Repeat on a second updated desktop/web client signed into the same account after
sync. Test unsaved edits before using the header: edit resolution must be honored.
Linux browser verification does not establish native Apple behavior.
