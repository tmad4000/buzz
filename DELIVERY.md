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
