# Suggested busy-thread pins — PR70 follow-on

Owner: eabf0ed3-28da-4de6-bcbe-0d290a98c5a0. Own worktree `/home/dev/agent-worktrees/buzz-busy-thread-suggestions-20261118`, branch `feat/busy-thread-suggestions-20261118`.

Jacob's 2026-11-18 08:43Z ask, relayed by root: suggest pinning threads with many replies, never auto-pin; one explicit click pins privately; remember dismissals per thread; reuse existing counts. Root explicitly authorized a separate .9/next PR and review routing through coordinator a036208f-259f-46f1-9689-dba3d08e3805.

Stacked on PR70 https://github.com/tmad4000/buzz/pull/70 at exact base `c25dd45c7aa4f1294f0207765f893f96936e7e7e`, branch `feat/thread-activity-20261118`. That preserves .8 ancestry (annotated69eda1ff →16fa57dfc) and freezes PR70's pending delta review. Parent PR70 source review/acceptance remains its own gate; this follow-on is not an independent replacement for PR70.

## Behavior

Expand **Open threads**, then opt into **Suggest busy threads** (off initially). The reply threshold defaults to20 and can be set to5/10/20/50/100. Eligible loaded canonical roots show a quiet **Pin this busy thread?** action with actual subject/reply count. One click invokes the existing private pin owner. No pin is created on render, threshold change, count change, search, or dismissal.

Uses the existing merged entry reply count and/or relay descendant summary, taking the maximum rather than summing. Existing relay summaries are passed through ChannelPane so flat Timeline roots can also qualify. No new count store, fetch, subscription, relay kind, or dependency. We do not infer a24h velocity from lastReplyAt: those summaries lack the required time-bucket count. The requested high-total-reply-count path is implemented; recent-velocity scoring is not claimed.

Pinned, dismissed, pending/optimistic and reply-only entries are excluded. At most three suggestions appear, explicitly scoped to loaded threads. Threshold/enabled preferences and permanent per-thread dismissals stay on this device under the existing relay/identity/chat scope. The existing preference owner handles sibling views and storage events. Dismissal has a separate per-root preference key from pin membership, so concurrent dismissal cannot unpin another tab's explicit choice; pin/remove cannot erase remembered dismissal. No reply counts are persisted. Storage failure retains a session-only dismissal and the parent's visible storage warning.

The bar remains manual: suggestions confer no work lifecycle/Needs you authority, do not mark read/observed, navigate, resolve work, or alter drafts/follows/scroll. Original automatic-work adapter and cold-history coverage limitations remain. No Inbox integration is needed for this slice; placement is the existing open-thread bar.

## Validation and handoff

Focused checks only, every test/typecheck launched through the existing process-group timeout runner `/home/dev/code/buzz-thread-activity-20261118/run-bounded.py` (setsid; TERM/KILL timeout and group cleanup). No browser/native/Tauri/cargo/M5/production jobs. Repository-wide hooks/CI remain outside the dispatch validation scope.

- 14 focused unit/model/component tests: busy threshold/evidence/dedupe/eligibility/limits; prior pin/Order regressions; opt-in/manual-only pin, threshold and dismissal persistence, sibling views, relay-only Timeline summary and independent dismissal/membership keys.
- TypeScript no-emit check PASS on final source, with180s group bound.
- Focused Biome and diff whitespace checks.

Logs and receipts: `/home/dev/code/buzz-busy-thread-suggestions-20261118/`. New draft PR will target parent branch `feat/thread-activity-20261118`; exact-head source review requested only through coordinator, no reviewer launched by builder. Runtime/native/human/composed release gates remain open.
