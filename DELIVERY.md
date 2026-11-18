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
- 44 focused model/unit tests PASS: bridge envelope/signature identity, tag precedence/duplicate-malformed rejection, production edit snapshot/immutable-ancestry behavior, report edits/watchdog/stale metadata, exact native parent tags, parent quote scope, Page/thread guarded navigation, Markdown transform/opener callback, native permission scope.
- 3 focused DOM tests PASS: compact card original text/link/edit identity, shared thread-row native quote/navigation/body identity, default-off quote gate and no-fetch unloaded-parent stub.
- Whole-desktop TypeScript `tsc --noEmit`: PASS, exit 0; `validation/typecheck.log` is empty (no diagnostics).
- Biome on added/changed components and models PASS (style infos only in test fixtures); whitespace check PASS.

Evidence: `validation/model-tests.log`, `validation/dom-tests.log`, `validation/typecheck.log`. The bounded runner is reproduced in `validation/run-bounded.py`.

No browser/native/Tauri/cargo builds, M5 actions, release, install or Buzz posts. Native OS-handler behavior and human acceptance remain unverified. Draft/source review only; no buzz-review-completed attestation.

## Review / manual acceptance for the release owner

Independent Sol review is requested for the updated exact draft PR67 head; root previously received the request for the earlier source. Keep draft pending review and release captain authorization for heavier validation.

After an authorized build, enable Agent reply context. Expand a native reply-to-reply: verify its quote names the exact parent's first line and opens/highlights that parent through the guarded owning pane; preserve any newer draft. Collapse/reopen and verify exact-observed/read authority is unchanged. Show a bridge status card: verify compact reported executor + Open agent, raw original text in details, and an edit updates the same report. Confirm a non-bridge lookalike and a substantive answer stay ordinary content. Disable the experiment to restore ordinary status-body rendering and hide parent quotes.

Root follow-up: count-neutral means this renderer adds no events/counter/read/notification mutations; exclusion of legacy card replies from relay counts remains unverified and is not claimed. See STATUS-CARD-TAGS.md for exact proposed fields and activation boundary.
