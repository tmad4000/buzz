# Forward to agent — separate .9 source delivery

Draft PR: https://github.com/tmad4000/buzz/pull/85
Initial feature commit: `78e71a621`. Current TS-only checkpoint implements root’s C1 roster-authority plan. C3 PENDING NATIVE CHECK; no new Rust source change in this checkpoint.

Owner: Sol session5e7bc9da. Worktree `/home/dev/agent-worktrees/forward-to-agent-20261118`; branch `sol/forward-to-agent-20261118`. Stacked on Direct Agents PR81 via included display-only product fix `daf6e9dbbb4d8874a38bf41bb0e018f7c765dacf`. Current PR81 head7998e81a8 adds only expanded tests/evidence/docs over independently SOURCE-GO18f8599a; no product-source difference. That base descends from the requested .8 tag69eda1ff (peeled source16fa57df).

Original ask: Jacob, Buzz P2 2026-11-18 05:50Z, one-click forwarding to another orchestrator alongside Send to thread. Root's approved nonrecursive contract: Paseo DM→P2(later), P2→Paseo DM(now), plus existing Direct agents picker; quote/backlink sent by Jacob's own client; original Forwarded-to-target marker; no new relay kind; default OFF; separate .9 draft and independent Sol review via root.

Built: compact message-action default/picker; Appearance opt-in; current Direct agents membership and optional runtime host chips; default lane ambiguity/private-pair guards; linked quote top-level publication using the confirmed shared send mutation; explicit native relay/signer capture; no optimistic/global side effects across scope switches; acknowledged device-local target receipts with marker-only retry, concurrent-send protection and edited-body fingerprints. No source draft/move/read/archive semantics changed. See `docs/fork/forward-to-agent.md` for protocol/limits and acceptance.

Coordination: af293993 supplied the send mutation/picker ownership API and checked scope/receipt semantics. Its cache-side-effect concern is addressed with focused callback tests and the existing identity/community-keyed QueryClient boundary. Message row owner445b5cb9 and integration ownerfd0be4cf were notified. No outbox or native source changed. The B1 follow-up adds a read-only live-view registration to the existing sidebar reconciler and a presentational Inbox receipt line; owners receive the exact diff before push.

Validation before B1–B5: `tsc --noEmit` PASS;30/30 focused unit/model/production-callback tests PASS; changed-file Biome and whitespace checks PASS. Test commands use Python `Popen(start_new_session=True)` (setsid), deadlines150s/60s and whole-process-group TERM/KILL cleanup. No browser/native/Tauri/cargo/M5/Buzz actions, new dependencies, lockfiles, version changes or preview services. Full CI and native/human acceptance are not claimed.

Delivery: separate draft PR URL and final source head are reported to root with an explicit independent Sol review request. Keep draft until review and captain-authorized native/human acceptance. Forward markers are private device-local history, not synced/public edits; missing publisher cards/private Direct agent membership from PR81 remain their original owners' rollout work.

## Forward trust and audience follow-up

Root's semantic safeguards are implemented in PR85: an optional one-line sender instruction sits above the envelope; the original author/key and raw event signer are attributed; a standard `nostr:nevent` identifies the original. The body is literal quoted source data inside a dynamically sized fence, explicitly not the forwarding sender's instruction. Embedded member/agent/email requests and claimed system messages remain inside that data block. Sources without an identifiable author key cannot forward.

Every send reads fresh channel details and writer-side source/target rosters. Different private member sets, group destinations, or open/community-visible targets require an explicit dialog naming the target, its audience/access policy, and its members' names/keys. Opening, cancellation and dismissal do not send. Confirmation binds a specific audience snapshot; a changed membership/visibility/target identity requires fresh confirmation. Unknown/incomplete audiences fail closed. An unchanged private two-member Paseo DM/P2 pair retains one-click forwarding. Native expected relay/signer fencing and no automatic send retry remain unchanged.

Known cross-device limitation: **other devices do not show “Forwarded ↗”**, because the ACK receipt is stored only on the sending device, per relay/signer. The target forward and backlink still exist as ordinary signed messages. No new synced lane or read-state mutation is added.


Stack refresh: merged the latest PR81head83d1462c1 into this owned branch, retaining its owner-approved Star/runtime slot reservation. The only merge conflict was DELIVERY.md; this file retains the forwarding report and the three semantic safeguards above. Final refreshed-stack typecheck PASS;30/30 focused tests PASS for the forward changes. PR81 itself was not changed.


Historical intermediate base eeaa2c2d6 used a placeholder successor fix. That unshipped candidate is superseded by the view-only base refresh below.

## PR81 display-only P1 base refresh

Includes PR81daf6e9dbbb4d8874a38bf41bb0e018f7c765dacf: Direct agents is now a pure view-only label for the exact untouched seed node. No stored name or stamp upgrade; generic sidebar merge source/tests restored to .8. Delayed legacy authored renames, including rename-back, beat the baseline. Owner36ce confirmed exact diff; independent19ed01b1 re-review requested. Prior unshipped successor candidates are superseded. Forward behavior and device-local receipt limitation remain unchanged. Refreshed-stack typecheck and30 focused forward tests PASS with bounded process-group cleanup.


## Independent source re-review B1–B5

The latest reviewer report at7b855a2 clears A1 audience confirmation and A2 optional sender note, but independently identifies five blockers. These remain NO-GO pending exact-head review of this correction:

- B1: a scoped read-only registry borrows the existing useLaneSync-owned LaneStore and its subscription. It creates no second store, writer, read loop or reconciler. It reads the actual tree even when persistence fails; no localStorage authority. Per-registration tokens and idempotent cleanup preserve remounts/duplicates, and ambiguous/missing owners fail closed. Readiness requires the owner's existing reconciler status decoded or confirmed-new empty; unknown, decoding and unreadable states refuse targets. The picker subscribes to live changes; the send callback rechecks current scope, positive agent identity and assignment synchronously after asynchronous audience checks immediately before mutation.
- B2: only positively known agent keys qualify; empty/unavailable roster and human namesakes offer neither picker targets nor default shortcuts. Private two-member defaults additionally require the same identified agent in both lanes.
- B3: ACK history retains full source/destination/content-revision dedupe keys. The visible line chooses one receipt per destination separately. A→B→A and reverse-order concurrent ACK regressions no longer resend an acknowledged revision. The existing1000-record per-device cap remains.
- B4: once the mutation starts, every unconfirmed error includes Check the target before retrying, including malformed native2xx payloads and signer-mismatched ACKs. Preflight errors, explicit relay rejection and typed confirmed-marker-only recovery keep distinct messages. No auto-retry.
- B5: Home Inbox mounts the shared ACK receipt line using the same source identity as its action rail, outside the observed message-body wrapper. The annotation is presentational and cannot substitute for observed content.

Regressions cover all five findings, hydration/readiness transitions, failed-persistence removals/deletions and additions without opening the picker, scope/roster loss during asynchronous checks, owner cleanup/remount/ambiguity, edit-back and reverse ACK order, post-mutation guidance and the Inbox renderer/observation boundary. Existing sidebar hook/recovery tests run because their registration seam changes. Final updated typecheck PASS and81/81 focused tests PASS, including the existing sidebar hook/recovery suite; deadlines150s/60s with whole-group timeout kill/cleanup. Biome changed-file check and whitespace PASS (two pre-existing style-only informational suggestions in model.test.mjs). Sidebar36ce and Inbox2d confirmed the exact corrected readiness/observation diff before push; no owner confirmation clears the independent NO-GO. The new exact source head is handed to root for independent Sol re-review.


PR81 dependency disposition: independent19ed01b1 posted SOURCE GO/P1 resolved for exact18f8599adc7a250675447e1b861a0f163e5f868b, after confirming its product/test source is byte-identical to our included daf6e9dbb base;18f8599a adds only two M5 bridge-evidence documentation lines. Review: https://github.com/tmad4000/buzz/pull/81#issuecomment-6972124334 . This clears only the PR81 source P1, not PR85 review or release/native gates.


## Four additional source blockers C1–C4

Scope expanded into native channel detail projection, at root's explicit request. The full broader-audience feature remains in this separate default-OFF draft; no new kind, dependencies or release changes. Existing B1–B5 and A1/A2 fixes/regressions remain.

- C1/P0: strict get_channel_details now joins metadata with the complete kind39002 roster. The native converter consumes that roster and serializes its true count/member keys plus aligned DM participant keys/names. API mapping and the validated send target preserve those arrays, so production DM recipient resolution works. Metadata-only/nonjoined callers keep the old one-argument behavior; strict completeness is opt-in through readYourWrites:true, which forwarding always requests. Existing update_channel readback stays metadata-only and adds no new post-commit roster dependency.
- C2/P1: any supplied confirmation token must match the fresh audience fingerprint unconditionally, including a broader target becoming the same private pair. A mismatch refreshes the dialog and sends nothing until the new audience is explicitly confirmed.
- C3/P1: forwarding requests writer consistency for metadata as well as full rosters. The strict native detail read uses the existing strong metadata filter and captures one relay API base/signing key pair across its metadata/roster queries. It does not infer visibility from a count. A private→open edit with unchanged roster cannot use a replica-private detail path. All four metadata/roster API calls carry the same captured expected relay/signer; both native commands assert that scope and retain the captured endpoint/keys through awaits (including profile joins). Exact detail/roster member-key sets must match, even when counts match. A scope/source UI generation change cancels old work, including A→B→A transitions.
- C4/P2: the primary shortcut is explicitly reference-only. Picker notes belong to the selected captured intent and clear on dismiss, cancel and success. A hidden abandoned instruction cannot be picked up by a later shortcut.

Final checks: typecheck PASS;91/91 focused Node model/hook/API/IPC-contract tests PASS with150s/60s process-group deadlines and whole-group cleanup; changed-file Biome, rustfmt and whitespace PASS. Regressions include raw snake_case IPC → actual API conversion → audience validation → production DM recipients; source contracts for strict native metadata/roster scope and default-call compatibility; changed-to-same-private and unchanged-roster private→open re-confirmation; cancel/dismiss/shortcut note isolation, equal-count key mismatch refusal, four-read expected-scope propagation and A→B→A cancellation. Rust converter/serialization assertions were added but **not executed**: cargo/native/Tauri builds and Rust unit execution remain outside this dispatch's authorized checks. Rustfmt verifies syntax/formatting, not compilation or runtime behavior.

Exact native/API/frontend diff was sent before push to send/API owneraf293993, composed integrationfd0be4cf and detail/cache authority ownera027d58a. Independent14632ddb exact-head source re-review is required for all nine findings; earlier GO/green tests do not transfer to this new source delta. Native compile/actual IPC/relay/human acceptance remains a captain gate. No heavy build, Mac/M5 action, live forward or deployment occurred.


Scope-growth note sent to root as requested: the P0/P1 fixes touch native detail/member read contracts. They remain additive optional parameters on existing commands and stay within the same feature; splitting broader audiences would not remove the private shortcut's need for these native count/participant, writer metadata and scope fences. No broader product work was added.

Note/recovery interaction: confirmed marker-save failure no longer tells users to choose the same target, because a cleared note would change the envelope revision. It explicitly says the forward was sent and not to send again. The captured original revision still deduplicates/permits marker-only persistence retry; no send is retried automatically.

## Final PR81 restack

Merged PR81 exact7998e81a88134a03f578175c29eed20daecef5e0 (expanded production regression/validation/M5 documentation only; display-only product code unchanged). Independent19ed01b1 SOURCE GO/P1 resolved at that exact base: https://github.com/tmad4000/buzz/pull/81#issuecomment-6972530035 . It independently confirmed historical RED → stamp1 RED → display-only GREEN. Only DELIVERY.md conflicted; this forwarding report was preserved. Updated forward stack reruns the three new label-convergence regressions alongside its91 focused checks. The PR81 source gate is resolved; PR85 still needs14632ddb exact-head source disposition and separate captain native/release acceptance.

Final restacked validation PASS: TypeScript and94/94 focused tests (91 forward/shared/API/sidebar checks plus3 PR81 production label regressions), under the existing bounded process-group runner. Rustfmt/Biome/diff PASS. Af293993 and fd0be4cf rechecked exact staged scope/key-set/legacy compatibility corrections and found no additional concrete blocker in their bounded ownership review; no native jobs run. Independent14632ddb exact-head review remains required. All product behavior is still default-OFF; native compile/actual IPC acceptance remains explicitly unverified.


## TS-first checkpoint — C3 PENDING NATIVE CHECK

Root directed C1 to work entirely in TypeScript against the ACTUAL native detail IPC: member_count0, missing participant_pubkeys/member arrays. The complete authoritative writer kind39002 roster alone supplies count, signer presence, unique member keys and normalized targetChannel member/DM participant arrays. Metadata count/roster hints are not membership authority. Forwarding requires terminal next_cursor:null and refuses partial or malformed roster completion. C2 unconditional consent and C4 reference-only primary/cancel-dismiss-success note clearing remain unchanged and tested.

The zero-count IPC test was RED before this change and now covers the real API → audience validation → production DM recipient path. This checkpoint changes ONLY TS/tests/docs relative to published94e4d2c, leaving its previously SOURCE-reviewed native code untouched. It is NOT native validation: C3 remains pending a captain-approved check. The separate LOCAL branch sol/forward-agent-c3-pending-20261118 at155b3f11fe4dded6f739b7512adff64597f33b4e narrows native C3 by removing C1 model/converter changes; it is not pushed. Its three projection/model/test files match frozen7998 exactly, and only commands/channels.rs differs natively from the base.

Captain9888b74e explicitly returned HOLD: no cargo, no installs, no alternate-Mac/native grant; GTK3/WebKitGTK4.1/ALSA dev prerequisites are absent. No cargo was invoked. Per root's delayed-slot option this TS-only checkpoint is pushed clearly marked C3 PENDING NATIVE CHECK; root/captain must scope an existing-toolchain/cache audit and meaningful offline C3 subset or leave native validation pending. Keep draft/default-OFF/no integration.

TS-first checkpoint validation: typecheck and95/95 focused tests PASS with bounded process-group cleanup; changed-file Biome/diff PASS. This commit adds no Rust changes over94e4d2c. Existing absolute1.95 toolchain binaries were found by read-only audit, but exact locked serde/serde_json subset sources/archives are absent from default and activated Hermit Cargo homes; no cargo command or installer was invoked. Captain HOLD continues, C3 PENDING NATIVE CHECK, no integration/release acceptance.


## Attribution correction and recorded SOURCE disposition

The answer “Freeze current 7998e81a8” came from ROOT, agent d3caa262-cdcd-454d-9d42-0cd05ac69156, through this builder's question prompt. It was a root coordination decision, NOT a statement or freeze decision from Jacob. PR81 remains final/frozen at7998e81a88134a03f578175c29eed20daecef5e0 with SOURCE GO6972530035; no PR81 source or push is authorized by this note.

PR85 already has independent same-reviewer14632ddb SOURCE GO at exact94e4d2cdf3545f8a8be73d806137e72131a368aa/tree673632ea68aa5071385ac3a9288de7514b0e89b6, comment https://github.com/tmad4000/buzz/pull/85#issuecomment-6972995280 . This is the recorded SOURCE verdict, not a native/runtime approval. The current publishedb39a401b TS-only checkpoint has native files byte-identical to94 and author95 focused tests; no new independent exact-head verdict is invented for that checkpoint. Per Root's latest direction, the only pending acceptance gate is the captain's native/cargo gate, not another request to clear the already-resolved94 source findings.

This correction is a local documentation commit and PR-body note only. No PR head is advanced, no source is changed, and no native check/test is started.
