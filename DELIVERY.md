# Buzz .9 thread activity bundle

Owner: eabf0ed3-28da-4de6-bcbe-0d290a98c5a0. Worktree `/home/dev/agent-worktrees/buzz-thread-activity-20261118`, branch `feat/thread-activity-20261118`.
Base: annotated tag `buzz-ideaflow-v0.5.28-ideaflow.8` object `69eda1ffddf61c70c52420904deef8e79861c6f2`, peeled source `16fa57dfc97f115d00382fcb75128295b5fb3def`. PR base `sol/buzz8-release` matches that source. Target release bucket **.9**; no deployment or release claim.

Draft PR: https://github.com/tmad4000/buzz/pull/70

## Jacob's asks

- 2026-11-17 05:41Z DM: optionally bump a whole thread to the bottom when replies arrive; 22:46Z follow-up asks status on latest-activity threads.
- 07:19Z DM: Inbox new-since-last-read and unread counts.
- 00:26Z DM: small collapsible searchable bar of my open threads.

Provenance: root d3caa262 dispatch, `/home/dev/code/buzz-request-audit-20261117/REPORT.md`; attention model, thread-expansion/Open threads design, sidebar ownership contracts, and RELEASE-8-PLAN.json were read before implementation.

## Delivered source

- Activates existing reserved per-channel `activity` Order value. Threads and Timeline persist as before; default remains Threads. Roots sort oldest activity first, using max(post time, newest descendant summary timestamp), deterministic ties. Holds committed root positions away from semantic bottom while keeping current summary objects, supports prepends/deletions and stable optimistic `renderKey` acknowledgement. Retained target/search IDs do not disable the hold. Activity removes chronological day/New dividers that would imply a false frontier. Huddle transcripts/forums retain their existing presentation. No scroll-hook edits.
- Adds loaded-only Inbox count projection over existing Home progress selector and canonical `unseenRepliesByRoot` with exact `getThreadReplyObservedAt`/readiness. Per-row units remain distinct; no summing, global Home numeral change, new count store, fetches, or receipt writes. Opt in through Inbox menu **Show activity counts** (view-local, initially off). Syncing observation markers show unknown, never caught up.
- Collapsed-by-default **Open threads** manual pin bar above composer. Explicit expand preference and pins are device-local, scoped by relay/identity/chat. Search, clear, canonical loaded-root picker, guarded source-opening callback, remove and non-destructive Undo; bounded 100 pins, unavailable-history labels and session-only storage failure notice. Does not infer status, mark seen, or mutate drafts/follows/expansion/work state.

## Review fixes

Pending/optimistic root IDs are excluded from both the picker and current-thread candidate until signed acknowledgement. Existing legacy optimistic pins are not loaded as persistent references.

Same-chat views now share a subscribed preference owner. Each action writes only one canonical root's v2 register; unrelated roots never replace each other's full arrays. Cross-tab storage events reconcile the shared snapshot. Removal tombstones override the original read-only v1 seed, so reload does not resurrect removed legacy pins. Undo adds its one reference to the current shared set and preserves unrelated additions. Reads/retained fallback records are bounded; storage failures retain session-only changes with a visible notice. No count/draft/receipt/scroll code changed in this review delta.

## Explicit incomplete design scope

Automatic open-thread membership, work generations/dismissals, safe completion removal, Follow-up inclusion, agent links, All chats indexing, and scoped Attention/Work surface need the trusted canonical work adapter. 2d576c28 confirmed none is shipped; 445 confirmed status transport is not completion evidence. UI says **Automatic tracking unavailable**. This is the design-sanctioned manual staged capability, not completion of its automatic slice. Cold pinned roots remain references with unavailable navigation until loaded; no global coverage is claimed. Mobile/native and human acceptance are unverified.

## Validation and review

All runs use `/home/dev/code/buzz-thread-activity-20261118/run-bounded.py`: child starts in its own session/process group; timeout TERM then KILL, group cleanup on exit. Repository-wide hooks/CI skipped to honor the dispatch validation boundary. No browser process, native/Tauri/cargo build, new dependency, M5 action, or Buzz post.

- TypeScript `tsc --noEmit`: PASS on final source (bounded 180 seconds).
- Focused production model/unit suite: 33 passed (activity ordering, pin preferences/Undo, Inbox projection plus existing Inbox/unseen/Timeline regressions).
- Real React/jsdom unit controls: 5 passed (Order defaults/switching/persistence/channel isolation; pin canonical root picker/open callback/removal/Undo/remount/scope isolation; pending→ACK; two simultaneous same-chat views and external storage reconciliation; legacy seed/tombstones and visible session-only failure).
- Biome: focused changed/new files pass. `git diff --check` passes.
- Logs: `/home/dev/code/buzz-thread-activity-20261118/{unit,controls-fix,typecheck-fix-final}.log`.
- Draft PR70 is open; initial exact-head source NO-GO at53faad763 identified pending-root pin persistence and same-chat snapshot overwrites: https://github.com/tmad4000/buzz/pull/70#issuecomment-6966079471. Delta requests/verdicts now go to review coordinator a036208f-259f-46f1-9689-dba3d08e3805, reusing reviewer376919a0-3904-4505-9116-7dcf21ac6a42; no new review launch. Runtime/composed archive/attention integration and human acceptance stay with release owners.

Owners notified: 36ce8949 order; 445b5cb9 thread/composer/seen; 2d576c28 count selectors; 9e03d4e scroll (source compatibility guidance incorporated); fd0be4cf composition. Archive exclusions must be applied by the composed pipeline before count projection; shown-archived bodies must never enter observation callbacks.
