# Forward to agent — separate .9 source delivery

Draft PR: https://github.com/tmad4000/buzz/pull/85
Feature commit: `78e71a621` (stacked on unchanged PR81).

Owner: Sol session5e7bc9da. Worktree `/home/dev/agent-worktrees/forward-to-agent-20261118`; branch `sol/forward-to-agent-20261118`. Stacked on Direct Agents PR81 at `02eb5541275f27464c1ffe8375c6ac1ce98a82c9`, which remains unchanged. That base descends from the requested .8 tag69eda1ff (peeled source16fa57df).

Original ask: Jacob, Buzz P2 2026-11-18 05:50Z, one-click forwarding to another orchestrator alongside Send to thread. Root's approved nonrecursive contract: Paseo DM→P2(later), P2→Paseo DM(now), plus existing Direct agents picker; quote/backlink sent by Jacob's own client; original Forwarded-to-target marker; no new relay kind; default OFF; separate .9 draft and independent Sol review via root.

Built: compact message-action default/picker; Appearance opt-in; current Direct agents membership and optional runtime host chips; default lane ambiguity/private-pair guards; linked quote top-level publication using the confirmed shared send mutation; explicit native relay/signer capture; no optimistic/global side effects across scope switches; acknowledged device-local target receipts with marker-only retry, concurrent-send protection and edited-body fingerprints. No source draft/move/read/archive semantics changed. See `docs/fork/forward-to-agent.md` for protocol/limits and acceptance.

Coordination: af293993 supplied the send mutation/picker ownership API and checked scope/receipt semantics. Its cache-side-effect concern is addressed with focused callback tests and the existing identity/community-keyed QueryClient boundary. Message row owner445b5cb9 and integration ownerfd0be4cf were notified. No outbox, native or sidebar-owner source files were changed.

Validation: `tsc --noEmit` PASS;22/22 focused unit/model/production-callback tests PASS; changed-file Biome and whitespace checks PASS. Test commands use Python `Popen(start_new_session=True)` (setsid), deadlines150s/60s and whole-process-group TERM/KILL cleanup. No browser/native/Tauri/cargo/M5/Buzz actions, new dependencies, lockfiles, version changes or preview services. Full CI and native/human acceptance are not claimed.

Delivery: separate draft PR URL and final source head are reported to root with an explicit independent Sol review request. Keep draft until review and captain-authorized native/human acceptance. Forward markers are private device-local history, not synced/public edits; missing publisher cards/private Direct agent membership from PR81 remain their original owners' rollout work.
