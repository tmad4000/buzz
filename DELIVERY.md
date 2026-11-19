> Current P1 follow-up: root requested exact3857 reproduction and current-effective-body provenance recheck. Prior source reviews below are historical; same-reviewer recheck of the new head is pending.

# Agent reply UX — .9 source candidate

Owner: d809bb50-03b8-41d2-ba83-e2a18cb86a89. Workspace: `/home/dev/agent-worktrees/buzz-agent-reply-ux-20261118`.
Base: `buzz-ideaflow-v0.5.28-ideaflow.8`, annotated tag object `69eda1ff`, peeled commit `16fa57dfc97f115d00382fcb75128295b5fb3def`.

Jacob's original asks, recovered by the root dispatch and `buzz-request-audit-20261117/REPORT.md`:
- 2026-11-16 23:48 / 2026-11-17 08:19 DM: show which agent is working, with a link and less noise.
- 2026-11-17 15:43 DM: agent answers should visibly attach to the exact answered message even in expanded inline threads.

Draft PR: https://github.com/tmad4000/buzz/pull/67 (base `sol/buzz8-release`, .9 bucket).

## Source delivery

Settings → Experiments → **Agent reply context** opts into compact reported-status cards and native-parent quotes. Default OFF. Expanding the compact summary opts into details and the agent link. The shared MessageRow renders recognized bridge cards compactly across channel/thread surfaces, with executor and opt-in Open agent, report provenance/model, full original card text and copyable IDs. Unknown formats and substantive answer content retain the normal renderer. No runtime subscription, worker wakeup, inferred completion or seen-state write is added.

Parent display reuses reviewed PR54's native NIP-10 parent≠root quote plus guarded owning-pane jump; it never uses capped paint depth or retargets an existing draft. Root replies remain visually attached to their root without a redundant quote. Missing parents show a noninteractive “reply to earlier message” stub; no parent fetch or navigation is attempted.

## Reused source / integration order

Apply each prerequisite once; this branch contains additive signed-off cherry-picks:
- PR54 `533f8d23c`, `1d284379b`, `89bb4f3b` → local `236e128a6`, `74afcc34d`, `b6cf5bc55`.
- PR58 `7472d44a5`, `b04b419e` → local `ea3230b15`, `314103027`.
- Then this branch's compact-card/experiment commit. If integrating PR54/58 separately, omit the duplicated prerequisite cherry-picks. The opt-in wrapper is intentional and needs retaining around ThreadParentQuoteChip.

PR58's established main-window GCP/M4/M5 host + exact UUID opener capability is reused unchanged. No new hosts, relay kinds, dependencies, lockfiles, listeners or service changes.

## Contract coordination and remaining work

Read-only source contract: `/home/dev/code/paseo-buzz-bridge-20261114/listener/status_agent_metadata.py` (`render`, `link`, `normalize_status`), `status_cards.py`, `status_card_transport.py`. Existing ordinary kind9 reply + kind edit transport, established raw bridge signer, exact four-line envelope plus optional stale-metadata line. Full-body envelope recognition is bounded to 2048 characters. Delegated display authors do not establish signer trust.

Root approved compatibility and proposed machine binding. Sent the additive tags/snapshot proposal in STATUS-CARD-TAGS.md to bridge owner075fe13; listener remains untouched. Client prefers valid machine tags; old untagged cards use the body fallback. Production edit formatting replaces machine snapshots only for bridge-signed edits and records the edit signer so other-author edits cannot masquerade as bridge reports. Activation/contract response remains pending075. 445b5cb9 confirmed PR54 reuse and guarded callback requirement; implemented it. fd0 integration owner received prerequisite/pick-order notices.

**Compatibility limitation, still open:** the transport contains ordinary status reply messages, not a structured count-neutral message-level work projection. This slice compacts the existing card in its existing position; it does not move it into the originating-request footer, keep it visible with collapsed replies, remove legacy reply counts/notifications, or verify active task-bound execution. Labels explicitly say Reported working/done and details say live activity unverified. Full quiet footer semantics from DESIGN.md §280 remain an adapter/transport integration item with 075fe13/root, and must not be reported as completed by this PR.

## Validation

Only bounded light checks; each test/typecheck uses `setsid` with a parent timeout and process-group SIGKILL cleanup. Reused the existing installed desktop dependency tree by symlink; no dependency installation/update.
- 45 focused model/unit tests PASS: bridge envelope/signature identity, tag precedence/duplicate-malformed rejection, production edit snapshot/immutable-ancestry behavior, report edits/watchdog/stale metadata, exact native parent tags, parent quote scope, Page/thread guarded navigation, Markdown transform/opener callback, native permission scope.
- 6 focused DOM tests PASS: compact card original text/link/edit identity, shared thread-row native quote/navigation/body identity, default-off quote gate and no-fetch unloaded-parent stub; production sidebar-panel default-off legacy context and on-state deduplication.
- Whole-desktop TypeScript `tsc --noEmit`: PASS, exit 0; `validation/typecheck.log` is empty (no diagnostics).
- Biome on added/changed components and models PASS; whitespace check PASS.

Evidence: `validation/model-tests.log`, `validation/dom-tests.log`, `validation/typecheck.log`. The bounded runner is reproduced in `validation/run-bounded.py`.

No browser/native/Tauri/cargo builds, M5 actions, release, install or Buzz posts. Native OS-handler behavior and human acceptance remain unverified. Draft/source review only; no buzz-review-completed attestation.

## Review / manual acceptance for the release owner

Independent Sol review by87017e7a at fde7c66fe found one P2: default-off deep-sidebar context was removed by prerequisite PR54. Restored the original context while disabled, with a mounted production-panel off/on regression; optional reported-label wording also applied. First review: https://github.com/tmad4000/buzz/pull/67#pullrequestreview-5951545364. Focused recheck completed at exact source `7d5893bd07395d2ec22676eef94ad2e4940ffd43`: no blockers, scores9/9/9; https://github.com/tmad4000/buzz/pull/67#pullrequestreview-5951577042. Reviewer independently reran5DOM tests. Final author tsc completed exit0; see validation/typecheck-receipt.json. Subsequent delivery-receipt-only commits do not change reviewed application code. Keep draft pending release captain authorization for heavier validation and native/human acceptance.

After an authorized build, enable Agent reply context. Expand a native reply-to-reply: verify its quote names the exact parent's first line and opens/highlights that parent through the guarded owning pane; preserve any newer draft. Collapse/reopen and verify exact-observed/read authority is unchanged. Show a bridge status card: verify compact reported executor + Open agent, raw original text in details, and an edit updates the same report. Confirm a non-bridge lookalike and a substantive answer stay ordinary content. Disable the experiment to restore ordinary status-body rendering and hide parent quotes.

Root follow-up: count-neutral means this renderer adds no events/counter/read/notification mutations; exclusion of legacy card replies from relay counts remains unverified and is not claimed. See STATUS-CARD-TAGS.md for exact proposed fields and activation boundary.

## P1 effective-body provenance follow-up

Reviewer3857fd1d's NO-GO at oldd6d53c6d7 is retained: https://github.com/tmad4000/buzz/pull/67#issuecomment-6970480074. The canonical formatter already records the latest applied edit signer, and the compact parser requires original bridge author plus current effective edit signer=bridge. This follow-up adds the exact untagged ordinary-original→owner-signed Done-envelope reproduction with a conditional bridge owner mapping, verifies ordinary owner edits remain authorized content but never compact reports, and covers newer owner/bridge edit ordering plus unrelated edits.

Also closes the concrete local-cache gap: the on-success edit patch mutates raw cached content before signed edit projection. It now marks localEditedContent; formatter treats this as unknown effective signer until an actual signed applied edit is available. Unknown edited TimelineMessage provenance also fails closed. This preserves owner edit permission and normal text; no signing identity, hook configuration or relay protocol changes.

Final author checks for this follow-up:45model/unit+6DOM PASS; whole-desktop tsc exit0/no diagnostics; all bounded setsid+timeout+process-group cleanup. Exact source hashes recorded in validation/typecheck-receipt.json. Same3857 reviewer requested on the new source head. Quiet footer/count-neutral projection remainsOPEN; PR84 child remains frozen6ed4e6951 until parent disposition/restack.


---

# Preserved PR87 delivery receipt

# Current producer contract follow-up

Root explicitly requested comparison against075's current handoff, and a small separate PR for mismatches. Own worktree buzz-card-contract-20261118, branch agent-card-contract-20261118, stacked on reviewed PR67 head3a1e41ec74e6de8b261fbb7b4e6667333b8c0e8a. Neither PR67 nor frozen PR84 is modified.

## Findings and change

PR67 recognizes the exact normal four-line producer envelope and matching server/UUID URI, raw original bridge signer and current effective edit signer. Stale metadata remains explicit and nonbridge/missing effective signer falls back to ordinary text. Labels remain reported provenance, never proof of execution. Proposed tags are still an approved prospective compatibility path, not a claim that075 emits them.

Two mismatches are corrected:
- Equal-created_at edits on a bridge-authored original selected by input order. Retain the selected edit ID and choose lexicographically lowest ID at equal time, matching075. Higher timestamps still win. Nonbridge originals keep existing selection behavior; owner-authorized edits retain existing permissions and still cannot become trusted bridge reports.
- A blank fifth line and oversized/control-character title/model/provider labels were accepted. Require the actual optional metadata grammar and producer label bounds160/80/40.

PR67's top-level project/control forms deliberately remain ordinary text. PR84 supplies that separately documented compatibility parsing and Stop/Continue affordances. This follow-up does not reopen those paths or infer control authority from text. The bridge remains authoritative for role, private membership, generation and exact current turn. No wire generation or special card kind/tag exists in the live producer. Footer/count-neutral remains separate.

## Evidence

Read and hashed /home/dev/code/buzz-agent-reply-ux-contract-20261118:
- CONTRACT.md 4dcfa406d0f295b75274c475b5b6bd607047eaa5c4c3274cfd2b2b4993bf6816
- fixture.json 214c4d3b9ab23c7e7c4f05a5ff2cf34ccd1a73d4dced8bf95a8acdc955cd81e2
- source-evidence.json ed27cb1463a2292ad9275e99c6148c8956658978ef53b5a304b3720782b95fbc
- HANDOFF.json c140a94de926e5496cd87f7b8056d2c44ed240e8986a13d1d56a2219e30ee8c9

Producer manifest pinned b74a4cc86f5da1d8c7dde14af81be6e4384796841079fbaf65fc379d7c81cd2e. Fixture copied unchanged as bridgeStatusCard.contract-fixture.json; synthetic UNSIGNED, no signature/readback proof. Tests exercise production formatter/parser, not relay signature validation.

## Checks and delivery

Nine focused model tests PASS: producer fixture original/stale body, equal-time tie both input orders, newer revision, deleted edit reversion, malformed label/blank line rejection and existing owner-edit provenance regressions. Log validation/contract-model.log. Whole-desktop tsc --noEmit PASS (exit0, no diagnostics); receipt validation/contract-typecheck.log. Runs use validation/run-bounded.py (setsid, timeout, process-group SIGKILL cleanup). No new dependencies or listener/native changes. No real Buzz post/control, browser, heavy build or deployment.

Owner445 notified of additive formatter change. Separate draft PR and independent Sol review requested via root. Keep source-only/draft; no release acceptance claim.

## Independent P2 label-parity correction

Independent PR87 review at16dd2c440: NO-GO P2, preserved at https://github.com/tmad4000/buzz/pull/87#issuecomment-6971566742 and /home/dev/agent-worktrees/buzz-pr87-review-20261118/REVIEW-SOL.md. Encoded UTF-16 bounds rejected real81-asterisk output and admitted U+0085. Tie ordering, unsigned fixture and signer regressions passed. This correction supersedes that label validator only; no current independent GO claimed.

Decode only the producer's exact Markdown escape set, validate decoded code-point bounds160/80/40, and reject its Unicode category-C characters. Display decoded labels instead of backslash escapes. Preserve sanitization order: trim before truncation, allowing a trailing space at an exact truncation boundary; empty sanitized output can be genuine render() output. Header parsing accepts Unicode line/paragraph separators which the producer retains, while actual newline remains a body delimiter. Malformed escapes and unsanitized near misses stay plain text.

The observed producer Python Unicode database is15.0.0, whereas localNode uses17.0. Pin producer category-C ranges in generated bridgeProducerUnicodeC.json, avoiding host/browser Unicode-version drift. The small stdlib-only generator is checked in and refuses a different Unicode version; no new dependency. Binary range lookup also rejects characters newly assigned by newer JS tables that the producer still sanitizes. Source/fixtures are synthetic public labels, not signatures or live event proof.

Nine synthetic body cases generated by importing ONLY pure render()/label() from the read-only producer module are checked in as bridgeStatusCard.label-fixtures.json. No metadata resolution, network, relay writes or listener edits. Producer source hash and Unicode version are in that fixture. Cases cover81/160asterisks, astral limits, all escaped punctuation, Unicode sanitization, retained line/paragraph separators, empty sanitized labels, truncation whitespace and joiner replacement. Raw near misses use actual code points including U+0085, private-use, surrogate, format and unassigned/newer-Unicode characters.

Applied already-tracked075 prospective proposal clarification while this follow-up is open: originEventId means ONLY the signed originating Jacob Nostr message ID, never a NeedsYou request UUID/revision/operation/receipt. Waiting/done/ack tagged classification requires explicit Root source; absent/listener/watchdog cannot classify those states. STATUS-CARD-TAGS.md labels this unimplemented classification-only proposal, not a producer approval/activation or authority for role/lifecycle/control/counters. Current live producer stays unchanged and untagged; legacy contract is complete. Structured footer/count-neutral/NeedsYou adapter remains DEFERRED.

Final checks PASS:11 focused formatter/parser model tests,1 production compact-card DOM test,whole-desktop tsc --noEmit exit0/no diagnostics. Logs validation/label-parity-model.log,label-parity-dom.log,label-parity-typecheck.log and structured label-parity-receipt.json. All tests/typecheck and pure fixture/table generation bounded with setsid/timeouts/process-group cleanup. No heavy/native/browser jobs or real Buzz actions.

Ready for same independent PR87 reviewer through root; keep draft/frozen after push. PR67, PR84 and PR88 untouched.


---

# Preserved PR84 delivery receipt

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


---

# Preserved PR88 delivery receipt

# Parent quote reveal / scope follow-up (.9)

Jacob's original ask: agent replies should visibly attach to the exact message they answer. Root's latest explicit assignment: apply075's compatibility advisory, use the dedicated exact-parent reveal seam, repeated-click regressions, separate draft PR stacked on frozen PR67 rather than modifying PR84.

Own worktree /home/dev/agent-worktrees/buzz-parent-reveal-20261118; branch agent-parent-reveal-20261118; final authoritative base3a1e41ec74e6de8b261fbb7b4e6667333b8c0e8a. PR67, PR84 and PR87 unchanged.

## Source finding and change

The advisory describes an onOpenThread(parent) pitfall. Exact183 already routes MessageThreadRow quotes through ThreadParentQuoteChip, then onJumpToThreadMessage(nativeRoot, exactParent), falling back to goChannel(channel,{messageId,threadRootId,force:true}). There is no onOpenThread(parent) call to replace at this base. Inline summary and sidebar branch toggles remain independent of the quote action. We preserve this existing seam and add repeated-click regression evidence rather than claim an absent callback was fixed.

Concrete scope gaps fixed in threadParentQuote:
- Reject duplicate/conflicting root/reply ancestry, missing native reply, and edit-event targets. Presentation root/parent/depth never supplies identity.
- Require exactly one matching channel marker on the child.
- A loaded parent's ID and its own single channel marker must match before displaying an excerpt or enabling navigation. Missing, removed/deleted (absent from index), mismatched or ambiguous parents use the neutral noninteractive earlier-message stub. No fetch, hidden read, composer action or cross-scope lookup.

The map is supplied by the current pane's scoped thread index. The helper cannot independently prove community/identity from a message body. No global cache lookup is introduced. Previews are explicitly **nested-only**: direct-root parent quotes remain deliberately omitted, since the root is already shown. This is not a claim that every reply has a preview.

## Preserved boundaries

Same default-OFF agentReplyUx. No bridge parser, signer/effective-edit signer, metadata/control qualifier, original card message ID/count/read target, watchdog prose or body fallback changes. No new protocol or runtime claims. PR84 controls and PR87 contract parser corrections remain separate. Originating-request footer, card-role/count-neutral and lifecycle projection are explicitly DEFERRED: there is no structured on-wire binding. No hidden parent read or composer mutation occurs during rendering; a user's navigation uses existing guarded navigation and ordinary visible-message admission. Existing different-thread opening defaults are unchanged.

Advisory SHA256 verified a80d53776e37077af1d108499e62e20866821a3d407b14de5ed96eb90dd5b592 at /home/dev/code/buzz-agent-reply-ux-contract-20261118/COMPATIBILITY-ADVISORY.md. Current CONTRACT.md/fixture/source hashes recorded by separate PR87. Synthetic fixtures are not signature proof.

## Validation and review

PASS:10 focused model tests,14 DOM tests, whole-desktop tsc --noEmit (exit0, no diagnostics). Logs validation/parent-reveal-model.log, parent-reveal-dom.log, parent-reveal-typecheck.log. Each run uses setsid + timeout + process-group SIGKILL cleanup via validation/run-bounded.py.

Production component tests repeat both owner callback and force-route clicks and preserve body identity and neutral stubs/default OFF. Actual owning-pane callback tests verify repeated exact-root/parent selection and guard behavior. Actual useUnreadSidebarThread hook tests reveal open, closed and collapsed ancestry twice, preserving per-view/saved disclosure semantics. No heavy browser/native/Tauri/cargo builds, live reads/posts/control triggers or Mac actions.

Owners445 and2d notified. Separate independent Sol source review requested through root. Keep draft/frozen for review; no deployment or native/human acceptance claim.

## Final authoritative rebase

Rebased onto original approved3a1e41ec74e6de8b261fbb7b4e6667333b8c0e8a. Dropped duplicate provenance commit0e8429994 and combined provenance receipt e021fa367; merge31a is removed by linear rebase. Retained quote hardening plus quote validation receipts. LocalEditedContent, exact3857 regression, formatter/cache/parser/type provenance remain supplied ONLY by original3a ancestry.

Product content not already in3a and retained:
- threadParentQuote.ts: strict native ancestry/channel scope checks, neutral absent/out-of-scope loaded-parent fallback, nested-only documentation.
- ThreadParentJump.test.mjs: repeated owning-pane exact-parent reveal guards.
- threadParentQuote.test.mjs: conflicting ancestry and parent scope cases.
- ThreadParentQuoteChip.jsdom-test.mjs: repeated dedicated owner/force-route clicks and scoped fixtures.
- useUnreadSidebarThread.jsdom-test.mjs: actual hook repeated reveal for open/closed/collapsed destinations.

DELIVERY.md and quote validation logs/receipts are also retained. No other product content differs from3a. Pre-rebase backup4f29 product/test source matches the rebased result exactly. Earlier parent-restack receipts are historical; fresh rebase checks follow in the final receipt. PR67 stays3a, PR84 and PR87 untouched.

## Final rebased candidate validation

Fresh PASS:18 focused model tests,15 DOM tests,whole-desktop tsc --noEmit exit0/no diagnostics. Logs validation/final-rebase-model.log,final-rebase-dom.log,final-rebase-typecheck.log; structured final-rebase-receipt.json. Runs use setsid/60s test/90s typecheck deadlines/process-group kill cleanup. Product/test tree matches backup4f29 exactly; original3a ancestry supplies all provenance changes. The retained5-file quote-only product delta is listed above.

PR67 remote readback3a and body explicitly record restore/freeze and independent GO comments6971137524 and6971162662. Requested PR67 expected183 lease push was no-op Everything up-to-date because remote already held3a. PR84 and PR87 are left untouched at their observed current heads,76e8ddaee andde2bf4765.

PR88 requested force-with-lease expectede021fa3677a1042f0a6e434d6e0227252f98ce68 differs from observed remote4f29b77b06760b539f9b21c6607fcbe421f88968 (our earlier normal-merge validation receipt). Candidate is prepared; push must preserve the requested lease guard. No silent replacement with a different expected SHA. Exact push outcome/needed decision will be recorded in Stream and root handoff. No live/native/release claim.

## Lease decision resolved and final publication

Root's latest Proceed now instruction authorizes the rebased PR88 publication with force-with-lease, superseding the earlier stale literal expectedSHA. Fresh remote readback is4f29b77b06760b539f9b21c6607fcbe421f88968; use THAT exact lease to preserve concurrent-write protection. The earlier expectede021 rejection remains historical and unchanged. PR67 is final3a; no parent-GO wait remains.

Post-push fresh checks and exact-head publication receipt are recorded at /home/dev/code/buzz-pr88-final-rebase-publish-20261118/RECEIPT.json (plus model.log,dom.log,typecheck.log). Product/test source remains identical to the tested quote-only rebase; this publication update is documentation only. Keep final pushed head frozen for reviewer6754eb26 via root. PR84 andPR87 stay at their existing correction heads for reviewersbe986aea andf087a4d0, respectively. No other source/head changes.

---

# Preserved PR81 source receipt

# Direct agents — .9 source delivery

Draft PR: https://github.com/tmad4000/buzz/pull/81
Base branch: `sol/buzz8-release` at16fa57df (root-designated .9 review base; matches the .8 tag source).

Owner: Sol session5e7bc9da, worktree `/home/dev/agent-worktrees/direct-agents-20261118`, branch `sol/direct-agents-20261118`.

Base: `buzz-ideaflow-v0.5.28-ideaflow.8`, annotated tag object `69eda1ffddf61c70c52420904deef8e79861c6f2`, peeled source `16fa57dfc97f115d00382fcb75128295b5fb3def`. No other worktrees edited. The reviewed opener prerequisites are cherry-picked separately (original7472d44a/b04b419e → local4a8799b80/7fce5d719).

Jacob's original ask: rename the Paseo section to a vendor-neutral name, put direct agent DMs there, and show where/how to resume the agents. “Ask Fable for a design perspective, but have Sol execute.” Approved decisions1/3/4: Direct agents default label, agent-key-signed kind30078 runtime cards, Hermes remains M4 launchd. Decision2 is excluded: P2 unchanged.

Implemented: opt-in runtime reader and host/session/Resume profile/row/menu affordances; exact key/signature/coordinate validation; strict paired-server Paseo links through the reviewed native opener; bounded copy-only commands/delegates; self-reported stale timestamps; author/community query scope with focused minute polling and reconnect invalidation; view-only Direct agents label for the exact untouched original seed; stored name registers and merge semantics stay unchanged. No channel membership/order/Starred/read-state/composer changes.

Validation: TypeScript `tsc --noEmit`; focused actual model/UI/hook/defaults/opener/invalidation unit tests. Commands run through Python `Popen(start_new_session=True)` (setsid), deadlines120s/60s, with `killpg` TERM/KILL on timeout and process-group cleanup on all exits. Biome changed-file check and diff whitespace check. Current results: typecheck PASS; focused tests37/37 PASS (including the P1 regressions); changed-file Biome PASS; whitespace PASS. Full CI/browser/native/Tauri/cargo/M5/human tests intentionally not run under dispatch restrictions. No new dependencies/lock/version changes. No preview services.

`PINNED-DRAFTS.md` contains the Paseo/Hermes messages for root to post/pin/read back. Draft text was handed to root; no Buzz writes from this task. Hermes paths and daemon behavior remain reported by the existing M4 owner, requiring M4 verification before pinning/publishing.

Open integration work: listener owner075fe138 received the exact agent-key publisher contract for startup/health ticks. The M4 launcher owner must verify and publish the Hermes card; no new cloud-to-Mac access was attempted. Hermes/Buzz DM section membership remains with the existing private sidebar seed/device owner36ce8949; this PR cannot identify private DMs from source without inventing IDs. Both sidebar and composed-integration owners were notified before additive shared-file changes. Publisher examples and acceptance steps are in `docs/fork/direct-agents.md`.

Independent Sol review requested from rootd3caa262, with exact-head request to follow the draft PR URL. This remains draft; no release, native/human acceptance or completed-review attestation is claimed. Integration should cherry-pick the two prerequisite opener commits only if absent, followed by this feature commit, into .9. Root designated `sol/buzz8-release` as the canonical .9 draft base; it matches the .8 source exactly.

## Sidebar ownership follow-up (2026-11-18)

Root requested exact-diff confirmation from owner36ce8949. The complete committed SidebarSection/default/helper/test diff was sent; the draft already existed when that follow-up arrived. Owner explicitly approved the default-only upgrade for featureb4e676a4/head02eb5541: authored renames (including away/back), any other authored section register, legacy edits and tombstones prevent replacement; assignments/order/Starred/P2 remain unchanged. Row structure was confirmed additive.

Owner identified a composition overlap with PR46head3481a9fb: its Star toggle is `right-6`, while runtime actions were `right-7`. This follow-up changes only both runtime wrappers to `right-14`, reserving separate sibling slots. Owner confirmed positional composition, and received the exact two-line diff before follow-up push. Follow-up typecheck and24/24 focused UI/model tests pass; narrow native rows, keyboard focus and hit targets remain captain-gated acceptance, not Linux verification.

Captain9888b74e explicitly granted exactly one read-only `nice -n 10 paseo status --host ssh://m5 --json`, with20s timeout/output cap/no retries. At2026-11-18T06:31:07Z it returned a status error without a serverId. Owned process group was cleaned. No retry, alternate endpoint, bridge setup or Mac mutation followed. Captain then explicitly held further M5 work. The failed direct status read is not live evidence. Root subsequently supplied independent bridge evidence: **observed live via bridge card 05:45Z** on2026-11-18, M5 agent `ee9f6f52-8eed-4523-9714-9d0f2a70220c`, P2 runtime-card event `8fe75eb4…`, rendered server `srv_xmGYpGqxNnXR` and `paseo://h/srv_xmGYpGqxNnXR/agent/ee9f6f52-8eed-4523-9714-9d0f2a70220c`, produced from the listener’s live M5 lookup. This matches the reviewed allowlist. Provenance is root-reported bridge-card observation, not a successful direct status read by this task. No new M5 action or START is needed for that evidence.


Root base/writer clarification: PR81 now targets `sol/buzz8-release` (same16fa57df source as the annotated69eda1ff tag). Forwarding PR85 stays stacked on PR81 to isolate its feature diff. Listener self-signed publication is a writer contract/examples handoff exclusively to075fe13; this worktree never changes/deploys the listener. Hermes M4 launcher integration is contract-only with no M4 deployment. Root assigns the independent exact-head Sol reviewer.


## P1 delayed-legacy rename correction (independent NO-GO)

Independent Sol reproduced the delayed legacy authored rename defect on the old stamped-label implementation. Prior owner confirmation and passing tests did not cover that arrival order and are superseded for this point. The intermediate eeaa2c2d6 placeholder classification fix is also superseded by root's requested view-only solution.

The current implementation imports only the original stamp-zero seed. It projects Direct agents solely when the section ID and entire stored section node exactly match that seed's Paseo node. It never writes the new label or a new stamp, and restores sidebarLwwMap and its tests exactly to the .8 base. Any authored register, including an old-client rename back to Paseo or another authored section field, retains the stored label. The decrypted baseline is held only in scoped component memory, never a new synced lane.

Regression coverage includes the reviewer's production-function delayed-legacy repro, local-cache versions1/2 and remote200000, both arrival orders, persistence/reload, rename back to Paseo, encoded byte immutability, and authored fields/tombstones. Typecheck and37/37 focused tests PASS under process-group deadlines. Owner36ce8949 confirmed the exact diff is presentation-only: legacy stamp1, delayed remote and rename-back authored registers cannot be replaced; no transformed tree reaches storage. The final formatted diff was also sent before push. Earlier unshipped draft successor data is not migrated; this draft has not been deployed. Independent exact-head re-review by19ed01b1 is requested; the builder does not clear the prior NO-GO.

## Expanded production-path regression evidence

Root's proposed `[1,LEGACY_DEV,"Direct agents"]` successor fails the lowest real local-cache stamp1 case: a delayed authored name A loses the existing lexical tie to Direct agents. The historical83d1462c1 production writer fails too. The reproducible `validation/check-label-red-green.py` runs RED historical writer → RED proposed stamp1 writer → GREEN current display-only path, through the same production codec/store/persistence/reload assertions. It requires the specific delayed stamp1 failure, not an unrelated harness failure. No stored successor or generic merge change is introduced.

`directAgentLabelConvergence.test.mjs` adds actual constructor-decoded cache1 and synthetic first-positive-relay-second documents, both arrival orders, authored rename-back/modern protection, and two independent devices exchanging production encoded documents over repeated reload/bootstrap cycles without flip-flop. Every display call checks encoded immutability. See `validation/direct-agents-label-regression.md` for details and limits. Final bounded typecheck PASS;40/40 focused tests PASS; new-file Biome/diff PASS. Owner36ce confirmed the exact test/evidence diff before push. This successor changes tests/validation/documentation only from independently approved18f8599a; new exact-head review is requested via root. PR85's existing exact review head is preserved because product source is unchanged.

---

# Preserved PR85 source receipt

# Forward to agent — separate .9 source delivery

Draft PR: https://github.com/tmad4000/buzz/pull/85
Initial feature commit: `78e71a621`. Root authorized publication of the narrowed C3 revision on top of b39a401b. C3 native change: SOURCE-REVIEWED, NOT YET COMPILED; validated by the .9 native release build. Exact new-head source re-review remains required through coordinator a036.

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


## Root's TS-only C1 / captain-checked C3 revision

This revision supersedes the earlier native-C1 projection approach in94e4d2c. C1 now accepts the ACTUAL existing native metadata detail: member_count0, no participant_pubkeys/member array. Metadata is access policy, not membership authority. The complete writer kind39002 roster alone supplies count, signer presence, unique member keys and normalized targetChannel member/DM participant arrays. The API refuses any nonterminal/missing next_cursor when requireComplete is set. C1 native model/converter/Rust-test changes are removed; those three files are byte-identical to frozen PR81. The old exact detail/roster key-set comparison is deliberately removed because the legacy detail is not an authoritative roster.

The actual zero-count IPC fixture failed before this TS change, then passed through production API → audience validation → production DM recipient resolution. Paginated rosters fail closed. Existing C2 unconditional saved-token comparison, C4 reference-only shortcut/note clearing and all B1–B5 fixes remain covered. Current typecheck PASS;95/95 focused tests PASS under bounded process-group cleanup. Biome/rustfmt/diff checks accompany the local commit. Red log retained at /tmp/pr85-zero-count-legacy-red.log.

Only commands/channels.rs remains changed on the native side relative to the PR81 base: C3 uses the existing strong channel_metadata_filter for opted-in reads and retains captured expected relay/signer fences through metadata/member/profile awaits. Default one-argument metadata/readback behavior stays unchanged. No cargo/check/native job has run. Root now directs publication without a standalone GCP slot: existing GTK/WebKit/ALSA prerequisites and locked dependency caches are missing, and no installations are authorized. Coordinator a036 dispatches same reviewer14632ddb against the exact new head. The .9 Apple native release build MUST compile and cargo-test the affected nostr_convert and commands/channels modules as a hard gate. Failure drops PR85 from .9 rather than blocking release. No Apple access/build is authorized to this builder by that routing decision. Source GO, native pending is conditional on the exact-head source verdict; default remains OFF and PR stays draft. PR81 remains frozen7998e81a8. No deployment/live forward/M5 action or dependency/kind/version change.


## Root freeze attribution and exact-head gate

Root d3caa262, not Jacob, selected frozen PR81 head7998e81a through the question prompt. PR81 is unchanged. Independent SOURCE GO6972995280 belongs to94e4d2c; it does not automatically clear this merged head. The normal-push merge includes narrowed155b3f11 (treebb89485d) and preserves publishedb39 ancestry. The prior94 legacy metadata-only Rust test is absent after narrowing; the captain must select actual remaining nostr_convert/channel tests and reject zero executed tests. No standalone native check was run.

Merged-tree validation before publication: TypeScript PASS;95/95 focused Node tests PASS (150s/60s deadlines, task-owned process groups and cleanup). git diff --check PASS. No Cargo/native build/test ran.

---

# Preserved PR70 source receipt

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

---

# Preserved PR100 source receipt

# Last advertised route — small .9 follow-up

Root requested explicit route-advertisement freshness on runtime rows/profiles, stacked on frozen PR81 7998e81a88134a03f578175c29eed20daecef5e0. Jacob's original Direct Agents ask distinguishes where an agent runs/how to resume it; a self-signed route is not presence or execution proof.

Changes: shared Last advertised route label, relative age, STALE · stale, may be offline strictly after five minutes, retained Stale (over 24 h) strictly after24h. Existing visibility-aware shared minute clock, clamped future timestamps. Runtime rows have a bounded-width wrapped badge and additive auto/minimum row height when data-runtime-route exists; no runtime data leaves row height unchanged. No section names/order/Starred/assignments, producer, query/signature/opener, presence or PR81 edits. Sidebar owner36ce8949 received exact additive diff before PR. Existing device-local runtime-card switch remains default OFF.

Tests: 11/11 focused runtime/model/UI PASS, including fake timers driving the actual useNow React shared clock, exact5min vs over5min, 2m age, over24h, future clamp, and row/profile timestamp bindings. TypeScript tsc --noEmit PASS. Processes start_new_session with60s/150s deadlines and process-group cleanup; logs /tmp/runtime-route-age-focused.log and /tmp/runtime-route-age-typecheck.log. git diff --check PASS. No dependency/install/browser/native/Cargo/Mac/live-publication activity. No native or authenticated UI acceptance claim.

Review: draft stacked PR, independent Sol dispatch and .9 rollup through coordinator a036208f-259f-46f1-9689-dba3d08e3805. Native/human acceptance remains separately scoped.

---

# Preserved PR86 source receipt

# Buzz offline P1 deliveries

- Desktop (Tauri) draft: https://github.com/tmad4000/buzz/pull/86 — detailed evidence and remaining work in `docs/fork/offline-p1-desktop-delivery.md` in that PR.
- Mobile draft: https://github.com/tmad4000/buzz/pull/90 — detailed evidence and remaining work in `docs/fork/offline-p1-mobile-delivery.md` in that PR.

Both branches start at the .8 tag and target the .9 bucket, `sol/buzz8-release`. Features default OFF. Opted-in offline payloads use NIP-44-to-self; mobile uses Application Support files. Desktop OFF preserves the .8 legacy paint-cache behavior (including historical plaintext); explicit opt-in disposes legacy payloads before encrypted hydration. P2 supersession/PR44 integration is excluded.

Run focused checks through `scripts/run_offline_check.py SECONDS COMMAND ...`; it creates a separate process session and terminates the whole process group on timeout/completion. Native/browser/M5 builds retain the release captain's START gate. Linux evidence does not verify Apple or Android behavior.

Independent Sol reviews are routed through coordinator a036208f after the per-finding mapping gate. Desktop PR86 has candidate fixes awaiting the same reviewer; no source GO is claimed. Mobile PR90 has transferred to01d56bc1 from cb34b3927; this desktop builder will not edit/push that branch. These draft checkpoints are not source GO, release acceptance, merge or deployment. Root scoped P1 to desktop (Tauri) and mobile. The fork has no production web chat client. IndexedDB and the opt-in window.nostr.nip44 seam are retained and unit-tested, but end-to-end web wiring is excluded. Browser crypto fails closed until a future authorized host injects an identity-bound `OfflineCipher`, with `expectedPubkey` checked on every operation and an account-pinning lease. This is an explicit prerequisite for any future web client; P1 does not supply that host. A minimum browser chat client would need auth/session/route UI, relay query/subscription/mutation/upload transports, identity-bound signing, cache/outbox wiring, multi-tab and offline lifecycle tests: approximately 80–120 agent-hours, excluding full native-feature parity and deployment. Detailed assumptions and remaining acceptance work are in the platform handoffs and Paseo Stream.

## Old-head NO-GOs acknowledged: R1–R6 received

Both independent PR86 reviews at dd20a0f2 are acknowledged. These are candidate fixes, pending independent exact-head re-review, not reviewer closure. Detailed commands and source locations: `docs/fork/offline-p1-review-fixes.md`.

| Finding | Candidate fix and regression evidence |
|---|---|
| R1 clear/write resurrection | Storage-owner epochs, serialized writes/clear, update-only touches and logout drain; dispatched save/touch→clear and IndexedDB interleaving models PASS. Native ordering remains source-only. |
| R2 thread-generation admission | Per-thread fetch generation tied to committed body/provenance, callback checks and obsolete/canceled completion rejection; mounted old-thread/head-only/pending/failed/commit regressions PASS. |
| R3 chunk binding | Every NIP-44 chunk authenticates bundle, scope, kind, record ID, timestamp, index/count and digest; real-NIP44 splice/reorder/duplicate/omission/wrong-header regressions PASS. |
| R4 legacy plaintext residue | Full-scope opt-in/startup disposal before signer availability; locked multi-account/multi-relay disposal model PASS. Native SQLite cleanup remains source-only. |
| R5 flag-OFF baseline | .8 legacy load/store and default gate retained; migration/inspection gated ON; production legacy adapter, hydration and Settings OFF regressions PASS. |
| R6 reconnect warning | Cached as-of warning includes prolonged connecting/reconnecting until authoritative refresh; mounted navigator-online delayed reconnect regression PASS. |

UI1 additionally has execution-time deferred section-action and post-awaited-start Huddle membership guards, with focused regressions PASS. Overall candidate evidence: typecheck, 64 focused models and 5 mounted tests PASS; no native compile/test execution claimed.

PR90's 48d8fb69 NO-GO is also acknowledged separately: truncation must survive thread hydration; optional cache I/O must fall back to live recovery; disk-hydrated profiles must remain provisional and retry relay refresh. Mobile takeover owner01d56bc1 owns those fixes, regressions, current evidence and review handoff; this desktop handoff does not claim their closure.

## Narrow R5 cold-navigation follow-up to b5e67e44

Independent exact-head review at b5e67e44: https://github.com/tmad4000/buzz/pull/86#issuecomment-6974903752 . R1/R2/R3/R4/R6/UI1 RESOLVED with reviewer limits; R5 remains independently OPEN until delta review. Original R2 repro is blocked; no R2 reassignment trigger.

R5 ACK: OFF must preserve .8 cold-query ordering as well as startup paint caching. `desktop/src/features/messages/hooks.ts` now invokes/awaits lazy navigation hydration only when `offlineCacheEnabled()` is true. Startup hydration remains unconditional as in .8; the existing enabled lazy path is unchanged. This prevents an extra legacy `channel_head_cache_load(limit:1)` delaying `get_channel_window` while OFF.

Production regression added in `desktop/src/features/settings/ui/offlineOffBaseline.jsdom-test.mjs`: mount actual `useChannelMessagesQuery` after empty startup hydration; any unexpected lazy disk read is held pending; assert only startup limit12 and prompt relay-window dispatch without releasing disk. Focused2/2 and full mounted6/6 PASS (`offline-r5-cold-navigation.log`, `offline-r5-mounted.log`). The mounted suite emits existing React act warnings; assertions pass. Exact full command, cwd desktop: `python3 ../scripts/run_offline_check.py 100 node --import ./test-jsdom-setup.mjs --import ./test-loader.mjs --experimental-strip-types --test-force-exit --test src/features/conversations/readAdmission.jsdom-test.mjs src/features/conversations/offlineAdmission.jsdom-test.mjs src/features/conversations/offlineReviewRegressions.jsdom-test.mjs src/features/settings/ui/offlineOffBaseline.jsdom-test.mjs`.

Ancestor b5 independently reran64 models+5 mounted+typecheck PASS; model source unchanged by this narrow fix, so64-model result is retained ancestor evidence, not a new run. Fresh typecheck result is recorded in `offline-r5-typecheck.log`. No native/browser/cargo/M5/Buzz/services/deploy actions. Coordinator receives exact committed head and same1b reviewer rebind request; no aggregate GO inferred.

Fresh narrow-delta typecheck: PASS exit0/no diagnostics, `python3 ../scripts/run_offline_check.py 120 node node_modules/typescript/bin/tsc --noEmit` (cwd desktop). Red/green evidence: same new production regression fails on reviewed b5 hooks (exit1, extra limit1 read), passes with gate; `offline-r5-before-fix.log`. Optional Biome formatting was unavailable in the reused dependency installation; no formatter PASS claimed.

---

# Preserved PR95 source receipt

# Suggested busy-thread pins — PR70 follow-on

Owner: eabf0ed3-28da-4de6-bcbe-0d290a98c5a0. Own worktree `/home/dev/agent-worktrees/buzz-busy-thread-suggestions-20261118`, branch `feat/busy-thread-suggestions-20261118`.

Jacob's 2026-11-18 08:43Z ask, relayed by root: suggest pinning threads with many replies, never auto-pin; one explicit click pins privately; remember dismissals per thread; reuse existing counts. Root explicitly authorized a separate .9/next PR and review routing through coordinator a036208f-259f-46f1-9689-dba3d08e3805.

Stacked on PR70 https://github.com/tmad4000/buzz/pull/70 at exact base `c25dd45c7aa4f1294f0207765f893f96936e7e7e`, branch `feat/thread-activity-20261118`. That preserves .8 ancestry (annotated69eda1ff →16fa57dfc). Parent PR70 now has exact-head SOURCE GO atc25dd45c7: https://github.com/tmad4000/buzz/pull/70#issuecomment-6973974844. Its composed/native/human gates remain; this follow-on needs its own source verdict.

Draft PR: https://github.com/tmad4000/buzz/pull/95

## Behavior

Expand **Open threads**, then opt into **Suggest busy threads** (off initially). The reply threshold defaults to20 and can be set to5/10/20/50/100. Eligible loaded canonical roots show a quiet **Pin this busy thread?** action with actual subject/reply count. One click invokes the existing private pin owner. No pin is created on render, threshold change, count change, search, or dismissal.

Uses the existing merged entry reply count and/or relay descendant summary, taking the maximum rather than summing. Existing relay summaries are passed through ChannelPane so flat Timeline roots can also qualify. No new count store, fetch, subscription, relay kind, or dependency. We do not infer a24h velocity from lastReplyAt: those summaries lack the required time-bucket count. The requested high-total-reply-count path is implemented; recent-velocity scoring is not claimed.

Pinned, dismissed, pending/optimistic and reply-only entries are excluded. At most three suggestions appear, explicitly scoped to loaded threads. Threshold/enabled preferences and permanent per-thread dismissals stay on this device under the existing relay/identity/chat scope. The existing preference owner handles sibling views and storage events. Dismissal has a separate per-root preference key from pin membership, so concurrent dismissal cannot unpin another tab's explicit choice; pin/remove cannot erase remembered dismissal. No reply counts are persisted. Storage failure retains a session-only dismissal and the parent's visible storage warning.

The bar remains manual: suggestions confer no work lifecycle/Needs you authority, do not mark read/observed, navigate, resolve work, or alter drafts/follows/scroll. Original automatic-work adapter and cold-history coverage limitations remain. No Inbox integration is needed for this slice; placement is the existing open-thread bar.

## Capacity review correction

Independent PR95 SOURCE NO-GO at3e83ed051 identified that merged volatile/legacy identities were being mistaken for allocated durable slots: https://github.com/tmad4000/buzz/pull/95#issuecomment-6974220276. Removing a session-only pin could allocate a1001st record and invalidate subsequent reads.

The store now tracks actual durable storage keys separately from the merged view. Pin writes and dismissal writes check those exact keys against the shared allocation budget; legacy-seed/volatile identities are not slot proof. Unknown storage inventory fails to session-only writes. A bounded read still preserves existing saved pins/dismissals if old or concurrent writers have already exceeded the allocation budget, rather than making the entire scope unreadable. No saved keys are deleted for cleanup.

Five new production regressions cover full-budget Pin→Remove/Undo→remount,999 dismissals plus an unrelated durable pin (including updating that existing slot), legacy seed handling at capacity, transient quota-failure Remove/Undo/retry and existing over-budget preservation. Before the fix4/5 failed, reproducing the defect; after the fix all5 and the previous15 pass. The parent PR70 source GO remains unchanged.

## Validation and handoff

Focused checks only, every test/typecheck launched through the existing process-group timeout runner `/home/dev/code/buzz-thread-activity-20261118/run-bounded.py` (setsid; TERM/KILL timeout and group cleanup). No browser/native/Tauri/cargo/M5/production jobs. Repository-wide hooks/CI remain outside the dispatch validation scope.

- 20 focused unit/model/component tests: busy threshold/evidence/dedupe/eligibility/limits; prior pin/Order regressions; opt-in/manual-only pin, threshold and dismissal persistence, sibling views, relay-only Timeline summary and independent dismissal/membership keys; bounded combined preference capacity with visible session-only fallback.
- TypeScript no-emit check: final capacity-correction source PASS with180s group bound; earlier reviewed source also passed independently.
- Focused Biome and diff whitespace checks.

Logs and receipts: `/home/dev/code/buzz-busy-thread-suggestions-20261118/`. Draft PR95 targets parent branch `feat/thread-activity-20261118`; exact-head source review requested only through coordinator, no reviewer launched by builder. Runtime/native/human/composed release gates remain open.

# Open Agent → Paseo Fork fix — proposed tiny .9 admission

Jacob P2 Nov19 00:54Z: “Clicking Open Agent there doesn't do anything for me. I haven't been able to open it so I don't know what you need... fix the Open Agent issue on Buzz.” Installed M5 desktop is Buzz Ideaflow .7. Own branch/worktree`sol/open-agent-fork-fix-20261119` / `/home/dev/agent-worktrees/open-agent-fork-fix-20261119`, based on composed .9 source`e9742ad4f`. This is a separate default-ON bug fix; frozen PR81/100/109 are not advanced. .9 admission/source review and native release qualification remain separate.

Read-only M5 evidence (explicitly authorized scoped SSH): `/Applications/Buzz Ideaflow.app` Info.plist reports0.5.28-ideaflow.7/build7. CoreServices URL-handler queries and installed LaunchServices/Info.plists agree: paseo→stock`sh.paseo.desktop`0.4.0; paseo-fork→`sh.paseo.desktop.fork`beta.35. NO URL/app was opened, no OS registration/defaults changed, no browser/keystore/database access. Saved reproducible read-only query and exact JSON in`/home/dev/code/buzz-open-agent-diagnosis-20261119/{read-m5-handlers.py,M5-READONLY-HANDLERS.json}`.

Buzz .7 tag peels`1f9168b713178dff24c30109c11db52f5db11d75`. Its Markdown transformer delegates the unknown paseo scheme to defaultUrlTransform, producing an empty href, and its anchor lacks native left-click handling/scoped Paseo permission. .9/PR81's existing reviewed opener fixes those Buzz layers but still sends paseo→stock on M5, so it is not a full Fork fix. Paseo beta.35 protocol source explicitly generates paseo-fork and accepts both schemes for the same `/h/server/agent/id` route. Read-only source evidence and sanitizer reproduction are in DIAGNOSIS.md/BUZZ7-SANITIZER-REPRO.json in that validation folder. Installed binary UI behavior was NOT exercised; source/protocol metadata is the evidence boundary.

Fix: shared opener validates only exact agent-session routes, known three servers and canonical UUIDs, then explicitly opens the registered Fork scheme. It is used by structured AgentStatusChip, Markdown left/context-open, runtime card and runtime context menu. Original signed status-card body/tag hrefs and runtime payloads are untouched. Markdown safely admits either canonical session scheme; unrelated links retain their existing behavior. Native permission adds only the same three host/UUID patterns for paseo-fork, keeping existing canonical entries; no wildcard action/settings or unknown-host capability.

Fallback: failed native handoff shows agent ID/server and a Copy agent ID toast action, with no auto-retry or automatic fallback into stock/web. Structured status details already expose IDs and their copy button even without a native failure. A successful OS handoff cannot prove the agent view opened. No verified private web frontend/paired route is currently established, so no guessed public or localhost web URL is offered. A future “Open in Paseo web” requires that verified private origin/route; copy-ID is usable now.

Validation:17 focused model/opener/Markdown/runtime tests +1 actual React DOM structured-card click test PASS; tsc --noEmit PASS. Processes have60s/240s deadlines, new process groups and whole-group cleanup. Tests exercise actual shared opener translation, real component callback→native mock for the status chip, rejection/copy fallback, cancellation and exact capability patterns. No native/Tauri/Cargo build, app launch, browser, live send, deployment or registration mutation. Native opener/OS navigation still needs separately authorized Apple qualification. No dependency/lock/version change. Owners445b andfd0 received the exact additive owned-file diff before PR; review viaa036.

The exact clicked00:54 card/event ID was not included in the dispatch. Producer075 was asked for the bounded verified binding. Existing signed producer receipt provides a concrete example`paseo://h/srv_KIFHQ_zsBnI2/agent/075fe138-b9c6-4277-80d6-addd30e38cf3`; it is NOT claimed to be Jacob's clicked card. The route-wide failure/fix is independent of that missing identity.
