# Replies in tracked threads

Inbox also reads unmentioned replies in threads you authored, participated in,
or explicitly followed. It reuses the channel owner's existing
`buzz-thread-authored.v1:<pubkey>` and `buzz-thread-participation.v1:<pubkey>`
stores and `threadFollowsProvider`; no second follow, task or shared status model
is persisted. Self-only channel catch-up explicitly publishes an immutable
interest snapshot even when unread channel rows do not change.

The existing addressed and DM feed stays available independently. Items merge
by actual event ID before native thread grouping, keeping the existing explicit
mention/action category when sources overlap. Unread uses the same root read
frontier and local unread overrides. Personal Done/read state never resolves a
shared obligation, and this source creates no obligations from emoji or agent
lifecycle. Stream navigation opens the canonical root and exact reply; forum
comments open the canonical parent post (exact comment focus is not supported).

## Bounded coverage

- Start with 20 exact roots, load 20 more on request, stop at 100 per view.
- Existing stores have no recency order: followed roots come first, then
  participated, then authored; each set sorts by event ID, with duplicates removed.
- Resolve exact root IDs in batches of 20 before reading replies. A root must
  have one `h` channel tag naming a current-member channel. Missing or inaccessible
  roots remain unavailable; remembered IDs do not confer access.
- Reply reads and live subscriptions pair `#h` and `#e` in batches of at most 10
  bound roots/channels, with at most two history requests in flight and 50 rows
  per batch. Each returned row must independently match its root's single current
  member channel; a filter cross-product alone is insufficient.
- Retain at most 500 reply events in memory. Self replies, ambiguous channel/root
  tags, unrelated roots and unsupported message kinds do not enter this source.
  Native stream/diff roots (`9`, `40002`) and forum posts (`45001`) use their
  corresponding native reply kinds (`9`, `40002`, `45003`).
- Relay, signing identity, interest/follow or membership changes retire reads,
  cache and live ownership. Channel timestamp changes do not refetch the base
  Inbox. Reconnect within the same scope retains accepted rows while unavailable.
- Live overlap starts before history reads, and exact event IDs absorb replay.
  Disposal and late subscription setup release only this source's subscriptions.

Partial coverage is visible when roots remain unloaded/missing, a query reaches
its cap, cached events are evicted, or live reads fail. Load more and Retry are
bounded manual actions. Failures never mean successful empty; this view does not
claim an exact global unread count or exhaustive historical coverage. Open the
channel/thread for earlier replies or roots outside this window.

## Trust boundary and validation

This uses the existing authenticated `RelaySession.fetchHistory` / WebSocket
subscription path. `mobile/lib/shared/relay/relay_session.dart` parses inbound
events using `NostrEvent.fromJson`; it does not independently verify their event
hash or BIP340 signature. Structural root/channel checks here do **not** add or
claim cryptographic verification. No dependency or relay change is included.

Provider tests exercise the real source with fake transport, existing follow
store, held reads/subscription setup and scope changes. A channel-owner test
exercises self-only catch-up without channel repaint. Widget tests exercise
loading, failure versus empty, retained base rows, manual controls, canonical
navigation and a 390px-wide view at 2× text. Native-device and human acceptance
remain required before release; Linux tests do not verify iOS behavior.
