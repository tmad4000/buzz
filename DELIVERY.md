# Agent Stop / Continue client — Phase 2

Owner: d809bb50-03b8-41d2-ba83-e2a18cb86a89. Own worktree `/home/dev/agent-worktrees/buzz-agent-controls-20261118`, branch `agent-stop-resume-client-20261118`. Separate draft PR stacked on PR67 branch `agent-reply-ux-20261118`, frozen base `18346c781cae213dc333fa5b009021cc962c5c0c`.

Jacob's ask: “a way to stop a running agent on Buzz.” Root assigned Phase2 after PR67's review verdict; no PR67 changes allowed. Verified3857fd1d's completed NO at oldd6d53c6d7 (owner-edit provenance), already fixed in frozen183 with an independent later source review at7d5893bd0. Parent worktree remains clean at183; this task does not change it or assert the old verdict reviewed new code. Parent source delivery is retained in `git show 18346c781:DELIVERY.md`.

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

Final checks: **48 focused unit/model tests PASS, 11 DOM tests PASS, whole-desktop `tsc --noEmit` PASS (exit0, no diagnostics).** Biome and whitespace checks pass (test style infos only). Typecheck receipt: `validation/control-typecheck-receipt.json`.

Focused checks: production native-message wrapper argument assertions (literal stop/continue, exact parent/root, expected Jacob+relay), signer/Root/pending/channel eligibility, bridge control labels/UTC/unavailable continuation, project wrapper, actual confirmation cancel/accept, disabled feature/wrong identity, no optimistic lifecycle, ambiguous-send hold, card/community change and unmount races, plus inherited parser/edit/parent guards. See `validation/control-model-tests.log`, `control-dom-tests.log`, `control-typecheck.log` for final receipts.

Independent Sol review is requested **via root** after the separate draft PR exists. Keep draft; no review-completed attestation, native/human acceptance, release or deployment claim. The parent chip's separate footer/count-neutral projection remains open; it is not addressed or marked complete here.

Parent updated to reviewed PR67 3a1e41ec7, including effective-body provenance hardening.
