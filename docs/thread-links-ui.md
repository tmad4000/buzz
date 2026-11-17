# Desktop thread organization

The stream/DM channel screen reads `buzz-thread-link-v1` kind9 annotations using the protocol in [thread-links.md](thread-links.md). Forum posts and huddle transcripts use their existing views.

The UI loads the channel's annotation history before applying any organization. It resolves exact referenced originals and their native ancestors, then unions every affected canonical subthread. This matters when a previously top-level message C is displayed below A: replies whose native root remains C must still appear below A. The signed originals and tags are unchanged. Raw export and the send mutation continue using native ancestry; a presentation root is never passed to the relay as a native root.

The channel timeline, inline branches and independent thread panel receive a separate presentation projection. Opening a moved subroot shows its own descendants. Affected roots use counts derived from the verified union, rather than substituting the native relay summary for a projected total. Loading errors, incomplete history and resource limits retain original positions and show an explicit notice. Invalid, unauthorized or conflicting annotations remain ordinary visible messages, with receipt details available in the channel notice. Valid selected controls are represented by audit badges instead of new task messages.

## Audit and undo

Open **Organized reply** beside a moved message to inspect its original position, original event ID and annotation ID. The original message's author sees **Restore original position**. Undo signs a new kind9 unlink annotation; it does not edit or delete original content. It rechecks complete history, current author/head and channel membership, and requires Web Locks to serialize this identity/channel/message across windows. Platforms without Web Locks can inspect the audit and use the author CLI for undo.

The exact signed undo receipt is saved locally before publication. A failed acknowledgement leaves **Undo pending verification** with its event ID. **Verify / retry saved undo** first checks readback and, if needed, resends those same signed bytes. It never generates a replacement event on retry. Corrupt or unsavable receipts stop before publication. Nothing is sent automatically on mount, reconnect or storage replay.

## Read state and expansion

Original message IDs remain stable. Organization receipts do not advance the channel read frontier. Existing read markers are not rewritten or copied. Sidebar auto-expansion continues using the existing unread expansion feature. Explicit branch choices are additionally recorded by original message ID within community/identity/channel, so moving a branch, navigation and restart retain those choices. Rejected invalid/unauthorized annotations regain ordinary read/unread eligibility once verified; known rejected IDs remain eligible during refresh failures. Only unresolved candidates and accepted/audit controls are held out of the channel read frontier. Existing per-root snapshots remain available for unlink. Native root preferences seed older branches once; explicit choices override that seed. No new expansion mode or preference flag is added.

## Isolation and bounds

The resource belongs to one mounted community/relay/identity/channel scope. It subscribes before backfill, invalidates on new annotations/reconnect/access hints, and rejects late results after scope change or unmount. Cryptographic verification runs in cancellable module workers with a 30-second deadline; no bulk signature loop runs on the UI thread. Streaming bursts coalesce before refreshing the union.

Current safety bounds: 1000 annotations, 5000 originals, 10000 auxiliary events, 64 affected canonical roots, 100 ancestry levels and a 32MiB serialized snapshot budget. History pages use the relay's `created_at DESC, id ASC` composite cursor; native replies use ascending composite cursors. Auxiliary edits/reactions/deletions require fresh signatures and signed target closure into the loaded originals. A channel over a bound shows the canonical fallback and an availability notice; it never labels a bounded prefix complete. This version exhaustively backfills its bounded annotation history each refresh; it does not persist a cross-identity projection cache.

## Review verification

Run the signed production loader/projector/undo tests and mounted hook/component tests:

```sh
cd desktop
../bin/node --import ./test-loader.mjs --experimental-strip-types --test src/features/messages/lib/threadLinkIntegration.test.mjs src/features/messages/lib/threadLinks.test.mjs src/features/messages/lib/threadLinkProjection.test.mjs
../bin/node --import ./test-jsdom-setup.mjs --import ./test-loader.mjs --experimental-strip-types --test-force-exit --test src/features/messages/useChannelThreadLinks.jsdom-test.mjs src/features/messages/ui/useUnreadSidebarThread.jsdom-test.mjs
pnpm build:e2e
BUZZ_THREAD_LINK_PORT=8873 pnpm exec playwright test --config=playwright.thread-links.config.ts
```

The Playwright configuration uses sandboxed Chrome and a test-owned local mock bridge, not a live relay. Its signed synthetic fixtures exercise the actual channel screen and independent sidebar. Browser evidence does not attest macOS/iOS behavior, a live DM mapping application or installation. Parent review and the separate mapping approval/application gate are required before deployment. Human testing remains pending until explicitly confirmed.

V1 organization targets and the verified union are restricted to signed stream message kinds9/40002, matching the reviewed foundation. If an affected native subthread contains other timeline content kinds (for example job lifecycle or diff events), this implementation fails closed to original positions rather than claiming their ancestry was verified. Ordinary unrelated channel content retains its existing rendering. Extending verified ancestry to more kinds requires a separately reviewed protocol/projector change.
