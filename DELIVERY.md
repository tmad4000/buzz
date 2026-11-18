# Forward to agent — separate .9 source delivery

Draft PR: https://github.com/tmad4000/buzz/pull/85
Feature commit: `78e71a621` (stacked on unchanged PR81).

Owner: Sol session5e7bc9da. Worktree `/home/dev/agent-worktrees/forward-to-agent-20261118`; branch `sol/forward-to-agent-20261118`. Stacked on Direct Agents PR81 at `02eb5541275f27464c1ffe8375c6ac1ce98a82c9`, which remains unchanged. That base descends from the requested .8 tag69eda1ff (peeled source16fa57df).

Original ask: Jacob, Buzz P2 2026-11-18 05:50Z, one-click forwarding to another orchestrator alongside Send to thread. Root's approved nonrecursive contract: Paseo DM→P2(later), P2→Paseo DM(now), plus existing Direct agents picker; quote/backlink sent by Jacob's own client; original Forwarded-to-target marker; no new relay kind; default OFF; separate .9 draft and independent Sol review via root.

Built: compact message-action default/picker; Appearance opt-in; current Direct agents membership and optional runtime host chips; default lane ambiguity/private-pair guards; linked quote top-level publication using the confirmed shared send mutation; explicit native relay/signer capture; no optimistic/global side effects across scope switches; acknowledged device-local target receipts with marker-only retry, concurrent-send protection and edited-body fingerprints. No source draft/move/read/archive semantics changed. See `docs/fork/forward-to-agent.md` for protocol/limits and acceptance.

Coordination: af293993 supplied the send mutation/picker ownership API and checked scope/receipt semantics. Its cache-side-effect concern is addressed with focused callback tests and the existing identity/community-keyed QueryClient boundary. Message row owner445b5cb9 and integration ownerfd0be4cf were notified. No outbox, native or sidebar-owner source files were changed.

Validation: `tsc --noEmit` PASS;30/30 focused unit/model/production-callback tests PASS; changed-file Biome and whitespace checks PASS. Test commands use Python `Popen(start_new_session=True)` (setsid), deadlines150s/60s and whole-process-group TERM/KILL cleanup. No browser/native/Tauri/cargo/M5/Buzz actions, new dependencies, lockfiles, version changes or preview services. Full CI and native/human acceptance are not claimed.

Delivery: separate draft PR URL and final source head are reported to root with an explicit independent Sol review request. Keep draft until review and captain-authorized native/human acceptance. Forward markers are private device-local history, not synced/public edits; missing publisher cards/private Direct agent membership from PR81 remain their original owners' rollout work.

## Forward trust and audience follow-up

Root's semantic safeguards are implemented in PR85: an optional one-line sender instruction sits above the envelope; the original author/key and raw event signer are attributed; a standard `nostr:nevent` identifies the original. The body is literal quoted source data inside a dynamically sized fence, explicitly not the forwarding sender's instruction. Embedded member/agent/email requests and claimed system messages remain inside that data block. Sources without an identifiable author key cannot forward.

Every send reads fresh channel details and writer-side source/target rosters. Different private member sets, group destinations, or open/community-visible targets require an explicit dialog naming the target, its audience/access policy, and its members' names/keys. Opening, cancellation and dismissal do not send. Confirmation binds a specific audience snapshot; a changed membership/visibility/target identity requires fresh confirmation. Unknown/incomplete audiences fail closed. An unchanged private two-member Paseo DM/P2 pair retains one-click forwarding. Native expected relay/signer fencing and no automatic send retry remain unchanged.

Known cross-device limitation: **other devices do not show “Forwarded ↗”**, because the ACK receipt is stored only on the sending device, per relay/signer. The target forward and backlink still exist as ordinary signed messages. No new synced lane or read-state mutation is added.


Stack refresh: merged the latest PR81head83d1462c1 into this owned branch, retaining its owner-approved Star/runtime slot reservation. The only merge conflict was DELIVERY.md; this file retains the forwarding report and the three semantic safeguards above. Final refreshed-stack typecheck PASS;30/30 focused tests PASS for the forward changes. PR81 itself was not changed.


PR81 P1 base fix: merged eeaa2c2d62d31025b7b2c9651c456ec3ffef5d53. Zero-version DEFAULT_DEV is explicitly a placeholder, so delayed authored legacy names (including same-name Paseo and local-cache1 A) replace the upgraded baseline; genuine authored strings/null/false remain protected. The independent NO-GO requires exact-head re-review; this branch no longer retains the known bad base source. PR81's37-case focused suite and typecheck pass; refreshed forwarding-stack checks are pending. Only DELIVERY.md conflicted in the base merge, resolved by keeping this forwarding report.
