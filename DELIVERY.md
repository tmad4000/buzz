# Direct agents — .9 source delivery

Owner: Sol session5e7bc9da, worktree `/home/dev/agent-worktrees/direct-agents-20261118`, branch `sol/direct-agents-20261118`.

Base: `buzz-ideaflow-v0.5.28-ideaflow.8`, annotated tag object `69eda1ffddf61c70c52420904deef8e79861c6f2`, peeled source `16fa57dfc97f115d00382fcb75128295b5fb3def`. No other worktrees edited. The reviewed opener prerequisites are cherry-picked separately (original7472d44a/b04b419e → local4a8799b80/7fce5d719).

Jacob's original ask: rename the Paseo section to a vendor-neutral name, put direct agent DMs there, and show where/how to resume the agents. “Ask Fable for a design perspective, but have Sol execute.” Approved decisions1/3/4: Direct agents default label, agent-key-signed kind30078 runtime cards, Hermes remains M4 launchd. Decision2 is excluded: P2 unchanged.

Implemented: opt-in runtime reader and host/session/Resume profile/row/menu affordances; exact key/signature/coordinate validation; strict paired-server Paseo links through the reviewed native opener; bounded copy-only commands/delegates; self-reported stale timestamps; author/community query scope with focused minute polling and reconnect invalidation; stamp-zero default label successor that loses to authored/legacy edits. No channel membership/order/Starred/read-state/composer changes.

Validation: TypeScript `tsc --noEmit`; focused actual model/UI/hook/defaults/opener/invalidation unit tests. Commands run through Python `Popen(start_new_session=True)` (setsid), deadlines120s/60s, with `killpg` TERM/KILL on timeout and process-group cleanup on all exits. Biome changed-file check and diff whitespace check. Final results: typecheck PASS; focused tests24/24 PASS; changed-file Biome PASS; whitespace PASS. Full CI/browser/native/Tauri/cargo/M5/human tests intentionally not run under dispatch restrictions. No new dependencies/lock/version changes. No preview services.

`PINNED-DRAFTS.md` contains the Paseo/Hermes messages for root to post/pin/read back. Draft text was handed to root; no Buzz writes from this task. Hermes paths and daemon behavior remain reported by the existing M4 owner, requiring M4 verification before pinning/publishing.

Open integration work: listener owner075fe138 received the exact agent-key publisher contract for startup/health ticks. The M4 launcher owner must verify and publish the Hermes card; no new cloud-to-Mac access was attempted. Hermes/Buzz DM section membership remains with the existing private sidebar seed/device owner36ce8949; this PR cannot identify private DMs from source without inventing IDs. Both sidebar and composed-integration owners were notified before additive shared-file changes. Publisher examples and acceptance steps are in `docs/fork/direct-agents.md`.

Independent Sol review requested from rootd3caa262, with exact-head request to follow the draft PR URL. This remains draft; no release, native/human acceptance or completed-review attestation is claimed. Integration should cherry-pick the two prerequisite opener commits only if absent, followed by this feature commit, into .9. A task-owned frozen .8 base branch makes the draft diff reviewable without unrelated release history.
