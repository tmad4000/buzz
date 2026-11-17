# Channel HTML Page (Ideaflow fork)

Channels and DMs have one shared **Page**, displayed inside Buzz's auxiliary
panel. Members replace the HTML in-app or through the CLI:

```sh
buzz page set --channel <channel-uuid> --file page.html
buzz page get --channel <channel-uuid>
```

`set` accepts a UTF-8 file up to 524288 bytes. `get` returns
`{"event": <signed manifest>, "html": <reconstructed HTML>, "page": "page"}`,
or `null` when no eligible head exists. The event signature covers the manifest;
its `content` is not rewritten to pretend the reconstructed HTML was signed as
one event. Failures propagate, including rejected chunk/manifest acknowledgements.

## Hosted-relay storage

This works with the existing `jprojects.communities.buzz.xyz` relay. It does not
add kinds, modify a relay, change its limits, or require deployment privileges.
It reuses channel-scoped pin kind **40004**, already accepted and replicated by
the hosted relay. Page JSON never equals `pin` or `unpin`, so existing pin clients
ignore it. All Page events carry the actual channel's `h` tag.

A manifest has `d=buzz-page:page`, the reserved Page slot, plus `e` equal to
SHA-256(`buzz-page:page`):
`b54af358b595b466bdb36d30cc7f2d32385aaeb5731674dc557a030c234ea7d1`.
The `e` tag uses the pin kind's existing indexed target lookup. This matters:
the hosted relay can apply custom `d`/`t` filtering after a query limit; chunk
events can otherwise shadow a manifest. The manifest content is:

```json
{"type":"buzz.page","version":1,"page":"page","publication":"<uuid>","chunks":["<event-id>"],"bytes":123}
```

Chunks use the same kind and channel, `d=buzz-page:chunk:<publication>:<index>`,
and JSON `{type:"buzz.page.chunk",version:1,page:"page",publication,index,html}`.
They have no Page-head `e` tag. Each contains at most about 24 KiB of HTML, so
even control characters and JSON escaping fit existing event/frame caps. There
are at most 24 chunks and 512 KiB reconstructed UTF-8. Empty Pages use no chunks.
Readers require exact referenced IDs, manifest author, channel, publication and
index, and verify the final byte count before rendering.

Every chunk must be acknowledged before its manifest is published. A failed
upload leaves the previous shared head intact. Retrying can leave unreferenced
immutable chunks in the event log; this version does not delete audit history.
The visible Page is a shared LWW projection across eligible authors, ordered by
`created_at DESC, id ASC`. Writers advance past the read/visible head and refuse
a head more than five minutes ahead. Concurrent edits have deterministic ordering,
without merging or a conflict editor. The slot/anchor/JSON `page` field leave a
seam for future named pages.

## Membership and privacy

Private channel and DM visibility use the hosted relay's existing membership
policy for kind40004. No global kind30078 state or public Nostr broadcast is used.
Writers verify their membership, including again immediately before committing
the manifest. Because the existing open-channel event policy permits ordinary
open-channel posting, clients also enforce membership on **reads**: head queries
use native `authors` filtering from the current roster plus the indexed `e` tag.
This prevents a raw nonmember event from becoming the displayed Page. Desktop
rosters refresh at least every 15 seconds and on each live head; failures clear
the author gate rather than treating an old roster as authoritative.

V1 tradeoff: a removed member's Page revision is excluded on roster refresh;
a current member must republish it to retain it as the visible shared Page.
Signed revisions/chunks remain in channel history. This is client projection
policy, not a claim that the hosted relay enforces custom Page JSON semantics.

Empirical tests used the Paseo identity on an expiring private test channel,
not Jacob's DM: HTTP acceptance, live WebSocket delivery, exact readback,
private/restricted/closed metadata, indexed-target isolation from newer unrelated
events, and a 512 KiB/22-chunk Unicode/control-character round-trip. Anonymous
read returned401; that particular probe does not establish authenticated
nonmember isolation. No private pilot content is committed in this repository.

## Offline rendering and pane seam

Display uses `srcdoc` and exactly `sandbox="allow-scripts"`, without same-origin,
popups, forms, downloads or top navigation. Inert template parsing removes author
scripts, meta refresh and base tags; strict CSP permits only Buzz's hash-pinned
link bridge, inline CSS and data assets. Author JavaScript and external resources
are disabled: arbitrary scripts can navigate their own iframe despite resource
CSP. HTML/CSS and native controls such as `<details>` work. HTTP(S) links offer a
host-controlled **Open externally** action showing their real URL; frame messages
cannot open the browser automatically. Non-HTTP and credential-bearing URLs are
refused. The same bridge hash is in the native parent CSP inherited by srcdoc.

`ChannelPage` accepts its owning view's `channelId`, edit permission and optional
close callback. Open state is per view; `headerEndActions` preserves pane options.
Stream/DM use the existing idle auxiliary slot, with Page priority over a retained
thread. Forum uses its auxiliary shell and retains hidden posts on narrow screens.
There are no global URL writes or community data singletons. A future pane host
can mount the same component.

Focused tests cover protocol bounds/integrity, membership projection, upload
failure and ordering, views and forum restoration. The browser probe runs the
production builder under the native parent CSP with sandboxed Chrome. Linux
checks do not verify macOS WebKit, native release behavior or human acceptance.

## Targeted pane close/replace guard

`ChannelScreenProps.registerPageLeaveGuard` accepts a view-local registrar:
`(guard: () => boolean) => () => void`. Bind it to the immutable owning view ID,
never whichever pane is currently focused. For a standalone Page pane, pass the
same registrar as `ChannelPage.registerLeaveGuard`. Cleanup removes only that
registration; separate views of the same channel have independent guards.

The guard returns false for changed HTML or an in-flight save, focuses its own
editor and shows a local save/cancel notice. Save acknowledgement or explicit
Cancel releases it. An unchanged editor can leave. The caller must retry the
close/replace after resolution; a previous result is not a reusable permission.
Page header toggles and auxiliary close use the same guard.

Focused route navigation composes Page and thread guards. With the split stack's
PR27 `useNavigationGuard`, that composite is registered with the target-specific
view registry even for background views. Use that composite path or the explicit
Page-only registrar as appropriate to the host; avoid redundant registrations.
This adds no global URL/state and does not reparent the thread or composer.
