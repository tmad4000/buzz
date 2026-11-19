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
