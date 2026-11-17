# Channel HTML Page (Ideaflow fork)

Every channel and DM has one shared Page. Members open **Page** in the chat
header, then **Create Page** / **Edit HTML** to replace it. Closing the Page
restores the existing auxiliary/thread surface. Open state belongs to each
conversation view instance; duplicate views do not share panel state.

Agents publish with:

```sh
buzz page set --channel <channel-uuid> --file page.html
buzz page get --channel <channel-uuid>
```

`set` reads a UTF-8 file of at most 524288 bytes. `get` returns the latest signed
Page event as JSON (or `null`); its `content` is the original HTML, suitable for
round-tripping to a file. Errors propagate; failed writes never report success.

## Event contract

Kind `40101`, raw HTML content, tags `h=<channel UUID>`, `d=page`, and
`m=text/html`. The reserved `d` slot allows future page IDs/slugs without
changing the payload shape. The first release accepts only `d=page`.

This is shared channel state, not author-owned NIP-33 state. Any actual channel
member may replace the visible Page. The current head is the most recent event
across all authors (`created_at DESC, id ASC`, matching relay history order).
Signed revisions remain in the event log, as with channel canvases; replacement
is a projection rather than deleting the audit history. Concurrent writes use
the deterministic ordering; this version has no merge or optimistic conflict UI.
Writers read the head and advance the timestamp so sequential writes within one
second are visible. A future head beyond five minutes is refused.

The relay enforces actual membership even for open channels, requires channel
scope and one `d=page` tag, caps Page UTF-8 content at 512 KiB, and applies the
five-minute future ceiling. Ordinary event payload limits remain 256 KiB.
The transport envelope allows 4 MiB to accommodate worst-case JSON escaping.
Existing operators with a lower explicit `BUZZ_MAX_FRAME_BYTES` must raise it
for full-size WebSocket publication. CLI publication uses the HTTP event route.

## Offline rendering

The original content is preserved on the relay. Display uses `srcdoc` in an
iframe with exactly `sandbox="allow-scripts"`, without same-origin access,
popups, forms, downloads, or top navigation. The iframe uses a strict CSP,
no-referrer, and inert template parsing before rendering. Author scripts,
inline event handlers, meta refresh and base tags cannot execute/navigate.
Only Buzz's hash-pinned link bridge runs. HTML/CSS, data images/fonts/media,
and native interactions such as `<details>` work. External resources and author
JavaScript are disabled by default: arbitrary scripts can self-navigate an
iframe despite ordinary CSP resource restrictions, so enabling them would break
the offline contract. Inline JavaScript dashboards must use native HTML controls
or a future separately designed trusted interactive mode.

Clicking an HTTP(S) link offers a host-controlled **Open externally** action
showing the actual URL. Untrusted frame messages cannot open a browser by
themselves. Non-HTTP schemes and credential-bearing URLs are refused.

## Pane integration seam

`ChannelPage` accepts `channelId`, `canEdit`, and optional `onClose`. Content is
keyed by the containing view's channel. `ChannelScreen` composes its header
button with `headerEndActions`, preserving pane options, and supplies the Page
to `idleAuxiliaryPanel`, with Page priority over the retained thread while open.
There are no global URL writes or shared open-state singletons. The future
layout controller can mount the same component as a page pane.

## Verification

Focused model and component tests live next to the implementation. The direct
`sandbox.browser-test.mjs` probe runs production srcdoc generation in sandboxed
Chrome and verifies blocked network/navigation, author scripts/handlers, native
HTML interaction and external-link requests. This Linux validation does not
verify macOS WebKit or the native release. PR readiness retains the repository's
separate human runtime confirmation requirement.
