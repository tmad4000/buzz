# Agent Stop / Continue client — Phase 2

Owner: d809bb50-03b8-41d2-ba83-e2a18cb86a89. Own worktree `/home/dev/agent-worktrees/buzz-agent-controls-20261118`, branch `agent-stop-resume-client-20261118`. Separate draft PR stacked on PR67 branch `agent-reply-ux-20261118`, reviewed base `3a1e41ec74e6de8b261fbb7b4e6667333b8c0e8a`.

Jacob's ask: “a way to stop a running agent on Buzz.” Phase 2 is stacked on PR67, now including reviewed parent 3a1e41ec74e6de8b261fbb7b4e6667333b8c0e8a (same3857 SOURCE GO: issuecomment-6971137524). This child does not modify the parent worktree.

Draft PR: https://github.com/tmad4000/buzz/pull/84, stacked on PR67 branch agent-reply-ux-20261118. Application change commit5a0ce1b09afcf328fe3b74aafa09f1f43880e425; subsequent delivery-only commit adds this receipt.

## Behavior

Same default-OFF **Agent reply context** experiment. Recognized bridge-signed reports expose a compact **Stop…** control when appropriate; it opens the shared accessible confirmation dialog identifying the exact attributed worker. Only confirmation sends a literal `stop` reply to the **card event**, using the existing signed kind9 message path. A bridge-confirmed resumable stopped report exposes **Continue**, sending literal `continue` to that same card. No reaction toggle, new protocol/event kind, or client Paseo call.

Controls are hidden for Root's exact UUID, nonbridge create/effective-edit signers, other active identities, unavailable/locked/lost identities, pending cards, unknown/ambiguous channel scope, and stopped cards explicitly reporting unavailable continuation. Root cards retain ordinary read-only report rendering. Only Jacob's established pubkey is eligible; the native sender receives both expected relay and expected signer fences.

Lifecycle labels change only when the signed bridge card changes. Existing bridge control source `jacob` and UTC headers are rendered verbatim: Stopped by Jacob, Already idle when Jacob asked to stop, Interruption acknowledged; new activity exists, Continuation queued by Jacob. No optimistic stopped/running/continued claim. Submission success says Request sent / Waiting for bridge. An uncertain send is held without automatic retries. The bridge remains authoritative for latest ledger revision, private scope, binding generation, current turn, stop cycle and continuation proof.

Confirmation is bound to the current card/body/attribution/signer/identity/community. Rebinding dismisses the old confirmation. Community switches and unmount before native publication suppress the stale operation. Repeated clicks share a synchronous in-flight fence. No composer reply-target, draft, read receipt, agent lifecycle or queue mutations occur outside the existing user-request message publication.

The fallback also recognizes the existing exact attributed project-card wrapper, preserving all original project text in expanded details. Unrecognized/malformed bodies stay normal content. Machine-tag parsing stays preferred; no unconfirmed new control-tag schema is invented. Live control reports currently use the bridge's existing body envelope. Future machine control states require075's writer contract; unsupported tagged envelopes fail closed.

## Exact bridge contract / coordination

Read `/home/dev/code/buzz-agent-control-20261118/PLAN.md`, including review corrections, and `FINISH.json`. FINISH reports `SHIPPED_BACKEND_ENABLED`, source manifest `199b91d8a07277b7a86ba3ba9604547840482996860835bde8665d73db2e90a9`, runtime64 files manifest `775b20ed7420cf2e41c45f99191dfaed6ba16fb9fb4b7db75e4d600c04084a35`. Source-only inspection of sole writer075's `listener/status_agent_metadata.py`, `project_status.py`, `agent_control.py`: accepted exact Jacob-signed 🛑 reaction or direct `stop` reply; direct `continue` reply only. This implementation chooses the reply form for both, with parent=card and signed native root preserved. No listener files changed. Wording/forms proposal sent075; its response/any newer machine-tag contract is not assumed.

FINISH explicitly records no real-user interrupt/resume probe by the backend owner. Backend enabled is not a live end-to-end client qualification. This task also sends **no real trigger**, cancels/resumes no agent, makes no direct Buzz post, and performs no M5/browser/native/Tauri/cargo build.

## Validation and delivery

All tests and tsc use inherited `validation/run-bounded.py`: setsid, parent timeout and process-group SIGKILL cleanup. No dependency/lock/version or native capability changes. Reuses existing installed dependency tree via ignored node_modules symlink.

Initial historical checks at 6ed4e6951: **48 focused unit/model tests PASS, 11 DOM tests PASS, whole-desktop `tsc --noEmit` PASS (exit0, no diagnostics).** Biome and whitespace checks pass (test style infos only). Typecheck receipt: `validation/control-typecheck-receipt.json`.

Focused checks: production native-message wrapper argument assertions (literal stop/continue, exact parent/root, expected Jacob+relay), signer/Root/pending/channel eligibility, bridge control labels/UTC/unavailable continuation, project wrapper, actual confirmation cancel/accept, disabled feature/wrong identity, no optimistic lifecycle, ambiguous-send hold, card/community change and unmount races, plus inherited parser/edit/parent guards. See `validation/control-model-tests.log`, `control-dom-tests.log`, `control-typecheck.log` for final receipts.

Independent Sol review is requested **via root** after the separate draft PR exists. Keep draft; no review-completed attestation, native/human acceptance, release or deployment claim. The parent chip's separate footer/count-neutral projection remains open; it is not addressed or marked complete here.

Parent updated to reviewed PR67 3a1e41ec7, including effective-body provenance hardening.

## First review corrections

Independent Sol be986aea first reviewed6ed4e6951: NO-GO with two P2 blockers, preserved at https://github.com/tmad4000/buzz/pull/84#issuecomment-6971199864.

The actual Stop button is now Radix's AlertDialogTrigger. Cancel and Escape restore focus to it; a disabled invoker falls back to the controls group. An unresolved intent is persisted before publication, outside row lifetime, scoped by community, normalized relay, Jacob identity, channel, exact card, server and agent. Shared subscribers block a second mounted view; storage events synchronize other windows. Display labels/model changes never clear a hold. Only a changed bridge-signed relevant control report releases it: stopped/idle/interrupted for Stop; continuation queued for Continue. Late native results cannot overwrite a newer intent. Proven pre-publication cancellation can release its own intent. Unknown publication, corrupt/denied storage and quota failure fail closed. No timeout eviction or automatic retry. Up to128 unresolved intents are retained; capacity exhaustion prevents another send.

The wire has no control generation/revision token available to this client. Identical same-minute control reports cannot prove a new cycle and conservatively retain the hold. Storage synchronization is not a cross-window transactional exactly-once guarantee; the bridge's durable action/cycle barriers remain authoritative. No recovery/delete-hold UI is introduced.

Current correction checks: **15 focused model tests, 10 production DOM tests, whole-desktop tsc --noEmit PASS**. Logs: validation/control-fix-model.log, control-fix-dom.log, control-fix-typecheck.log. All runs bounded with process-group cleanup. These supersede only the corrected paths; original wider checks remain historical. Re-review through root is pending. No live stop/continue qualification.

## Fresh stack validation after parent GO

Root requested a fresh stack/check/push against frozen PR67 head3a1e41ec74e6de8b261fbb7b4e6667333b8c0e8a. Verified live parent SHA and exact merge-base3a. PR84 already contains that parent via normal mergef8c21ea63; no history rewrite or source restack is necessary. This receipt-only commit preserves application sourcec788a2cbf unchanged.

Fresh verification PASS:15 focused model tests,10 production DOM tests, whole-desktop tsc --noEmit exit0 with no diagnostics. Logs validation/restack-model.log, restack-dom.log, restack-typecheck.log; receipt restack-receipt.json. Runs use existing setsid/timeout/process-group-kill harness (60s tests,90s tsc). Diff whitespace check PASS. Quote follow-up PR88 and PR67 stay untouched.

Ready for root-routed samebe986 independent recheck of delta3a..new head. First review NO at6ed remains historical; no current source GO is claimed until recheck. No real trigger, native/human, deployment or release acceptance.

## Revision-ordered HOLD reconciliation

The completed be986 re-review atc788 confirms all original3failures fixed, but reproduces a residualP2: an older signed queued report in a second view clears a newer ambiguous Continue HOLD. Its updated REVIEW-SOL.md is retained in the independent review worktree. This correction addresses that finding too.

The formatter now retains the selected edit event ID alongside its signer/content and exposes bodyRevision(eventId,createdAt) from the selected verified event. Original bodies use original event metadata; unsigned local cache rewrites have no revision evidence until a signed edit is applied. MessageRow's memo compares revision metadata. These are additive fields; no edit-selection, authorization, read/count/composer semantics change.

Each durable operation record stores action, unique operationID, baseline token AND baseline body revision, under stable scoped card/agent identity. Reconciliation requires the existing relevant bridge control state plus a distinct event ID and strictly later valid created_at than baseline. Old snapshots, equal timestamps and missing/invalid revision evidence retain the HOLD. Preexisting persisted holds without revision evidence also stay held; no reset/eviction/retry. This uses existing event metadata, no new wire protocol or inferred authority from a display timestamp. It is conservative freshness evidence, not a global exactly-once or bridge-cycle proof.

Checked-in regressions include the reviewer stale-second-view case with actual revision metadata, equal-time and unversioned variants, and a genuinely newer report releasing the hold. Formatter→parser assertions verify original/selected owner/bridge revision metadata and absent local-cache provenance. Original Cancel/Escape, display-edit/remount/second-view cases remain passing.

Final bounded checks PASS:15 focused model tests,11 production DOM tests,whole-desktop tsc --noEmit exit0. Also copied the unchanged independent reviewer six-case harness to our OWN temporary file and ran it against this source:6/6 PASS (including original3failures and residual stale-report case). Reviewer source was only read; copy SHA256 daa40b669c03d344808e12671f7e075a3c7f87c62d5809392a14773c49cb1fdd matches original. Own temporary copy removed after verification. Logs validation/revision-model.log, revision-dom.log, revision-reviewer-probe.log, revision-typecheck.log; structured receipt revision-receipt.json. Setsid/timeouts/process-group kill throughout. No heavy/native/live trigger.

Owner445 notified about additive formatter/types/row changes. PR67 stays3a; quotePR88 separate31a unchanged. Ready for samebe986 re-review via root; keep draft/head frozen after push.

## Strict post-intent freshness fence

Root clarified that a reconciliation snapshot must be newer than the persisted intent, not just its signed baseline. Hold records now persist intentAfter (Unix seconds sampled before any publication). A relevant signed control revision clears a hold only when its valid created_at is STRICTLY greater than both baseline.createdAt and intentAfter. An old record without intent timing, a pre-intent snapshot, or a same-second report stays held. Clock uncertainty can delay reconciliation; it cannot permit a retry. This remains conservative client freshness evidence, not a new bridge operation/generation protocol or global exactly-once proof.

The formatter also selects the lowest edit event ID on equal created_at for bridge-authored originals, matching075's canonical projection (the same seam used by separate PR87). Nonbridge selection and ordinary owner authorization remain unchanged. A canonical equal-time winner alone does not prove post-intent freshness and cannot release a hold.

Current checks PASS:17 focused model tests,11 production DOM tests,6 unchanged reviewer-harness tests replayed by author,whole-desktop tsc --noEmit exit0/no diagnostics. New regressions cover a signed revision newer than baseline but older than intent, same-second cutoff, legacy missing intent timing, and both equal-time edit input orders. Original stale queued-second-view repro remains checked in and passing. Logs validation/intent-model.log,intent-dom.log,intent-reviewer-probe.log,intent-typecheck.log; structured intent-receipt.json. Setsid/timeouts/process-group kill throughout. Reviewer harness hash matches unchanged original; own temporary copy removed.

Ready for samebe986 re-review via root of this final head. Earlier ee80 receipt remains historical, superseded by this intent fence. PR67 frozen3a and PR87/88 unchanged. No live/native/release acceptance.
