# Personal archive integration (.8 target)

This change starts at frozen `0e891f22766ac214acbe2b1bfb813a488f08e93b`.
It changes no version, native package, relay protocol, message, read marker, or
seen marker. The provider is mounted once under AppShell; identity + relay fence
its cache, reconciliation, asynchronous actions, and subscriptions.

## Storage and behavior

Existing encrypted-to-self settings kind 30078, d-tags
`personal-archive-v1:00` through `personal-archive-v1:3f`. Message/channel IDs and
reply snapshots occur only inside encrypted content, never plaintext tags.
Per-item LWW registers merge archive/unarchive independently; null tombstones
prevent resurrection. Existing settings local cache convention applies.

A thread action first completes the existing paged thread fetch and snapshots
reply IDs. Live replies and periodic/reconnect catch-up restore threads when an
ID is absent from that snapshot. Duplicate deliveries, edits, reactions,
backdated timestamps and removed old replies do not falsely count as new replies.
Catch-up uses two shared bounded reads at a time and retains archives on failure.
Undo compares the exact written register before changing anything.

Storage is finite: an edit exceeding 36 KB plaintext in a hash bucket is rejected
before changing local state. Very large thread snapshots can therefore fail with
a visible capacity error. No silent eviction, pruning, or message deletion.

## Integration with unseen replies (PR28 owns the .7+ projection)

Root supersedes the earlier PR34 direction: PR34 is skipped. PR28 owns
`useUnseenThreadReplies` and exact `getThreadReplyObservedAt` for .7+
(root names head `86a127a1`), maintained by
`445b5cb9-77a2-408c-9bc6-f85153a52716`. Archive targets .8 and keeps the
optional adapter; agree its hook placement against that owner's admitted head.

The frozen archive base predates that hook. In the integrating owner's
version of that hook import:

```ts
import { useArchive } from "@/features/messages/archive/ArchiveProvider";
import { excludeArchivedReplies } from "@/features/messages/archive/unseen";
```

Inside the hook call `const archive = useArchive();`. Pass
`excludeArchivedReplies([...timelineMessages, ...panelMessages], archive.records)`
to `unseenRepliesByRoot` in place of the raw concatenated array; add
`archive.records` to that memo's dependency list. This suppresses archived
messages and all replies of archived threads for header/summary unseen counts.
Unarchive restores their original literal-observation status. Preserve the
existing committed-body observer, active-view admission and seen writer exactly.
Do not treat archive, fetching, mounting, Show, or expansion as observation.

The older base's ordinary unread projection is already filtered. This adapter
must also be applied if the integrating owner replaces that projection with PR28.
The archive adapter consumes PR28's exact `getThreadReplyObservedAt`/readiness contract;
legacy `getThreadReplySeenAt` frontier progress is not positive body evidence.
Archive/exclusion never calls markSeen or markRead; only admitted body observation
may write observation markers.

## Timeline and sections

Channel `TimelineMessageList` projects full `MessageRowItem` entries through
`ArchiveEntry`; hiding includes the summary and inline descendants. Canonical
entries/IDs/rootId/parentId remain unchanged, including virtualizer keys.
Contiguous hidden entries share one run; Show reveals that run for this mounted
channel visit without unarchiving or changing saved disclosure preferences.
Per-channel Show archived is a separate synced preference. Opening an entry from
the Archived list explicitly enables that synced channel preference, so all
archived messages in that channel become visible on this user’s devices.
The open button’s tooltip names this effect. Timeline's flattened
root/reply entries should use the same projection, not a second read observer.
Sections should project archived children at the same row seam; never remove
canonical entries from tree/ancestry indexes. A collapsed section can retain its
own disclosure policy. Keep ArchiveRunProvider keyed by canonical channel in each
view; local Show has no effects on sibling views.

The MessageRow context menu and focused-row E shortcut do not own editor keys.
No autofocus, draft ownership transfer, or expansion-to-seen behavior is added.

## Acceptance

Archive adjacent messages and a thread from hover, More, context menu, and E.
Verify one `N archived · Show` run, local Show, channel Show archived, Undo,
Inbox Archived list, unarchive, a new reply, and another signed-in device.
Check an archived reply is absent from header unseen counts after the adapter;
unarchive should reveal its previous unseen status. Verify split background
panes cannot mark shown bodies seen and saved collapse preferences survive.
Linux/browser evidence cannot verify macOS/iOS behavior or relay/native packaging.

Retain the integrating owner’s removal of legacy thread-open/expansion read
writes. On this frozen base those paths at least skip archived IDs; explicit
Show still relies on the admitted committed-body observer. Nested subtree
badges use an exclusion predicate on counted IDs and retain all ancestry nodes.
Controls and the archive list require current membership; an in-flight thread
archive rechecks that membership before committing.
