# Offline P1 — desktop/web checkpoint

Owner: Paseo a027d58a-dc45-48ec-9629-2aa2fd6a08a3. Worktree `/home/dev/agent-worktrees/buzz-offline-p1-20261118`. Branch `sol/buzz-offline-p1-desktop`; base tag `buzz-ideaflow-v0.5.28-ideaflow.8`, peeled commit `16fa57dfc97f115d00382fcb75128295b5fb3def` (annotated tag object `69eda1ff`). Target `sol/buzz8-release`, .9 bucket. No other worktrees edited.

Jacob's original ask (Buzz DM, 2026-11-18 00:57Z, quoted in Fable's design): make mobile and web work to a degree offline, show cached messages, and queue replies with their original timestamp/context while checking supersession. This PR implements the P1 cache/admission foundation only. P2 supersession is excluded.

## Implemented at this checkpoint

- OFF by default. Profile Settings → Storage opts in; restart applies. One `OfflineCipher` seam uses NIP-44-to-self for all payload types, with an expected-account signer contract. No AES/plaintext fallback. Unicode-safe chunks stay below NIP-44's per-message bound.
- SQLite ciphertext storage in the existing head-cache database, plus IndexedDB adapter. Heads64, opened threads200 with newest200 bodies/truncation, sidebar1, profiles2000; item limits and 48MiB encrypted payload budget/scope. Legacy plaintext channel/sidebar/label snapshots are discarded when the encrypted path is used.
- Account/normalized-relay routing is included inside the encrypted envelope. Locked/wrong identities fail closed. Clear fences pending encryption; native logout retains the existing atomic reset; browser logout clears IndexedDB.
- Startup sidebar/12 heads, lazy other heads/opened threads/author labels. Mounted head overlays are folded/debounced. No attachment bytes enter the offline cache.
- Pane-scoped banner and Retry, reconnect refresh state/toast; failed images show an offline placeholder; waiting outbox copy. Existing host-health banner is absent at the .8 base.
- Callback-time read admission checks foreground/focus/visibility, source provenance, actual relay connectivity and the relay's existing transport generation. Reconnection alone cannot authorize cached observation. Explicit channel/all-channel mark-read callbacks are fenced while disconnected. Connection-required API mutations fail with “Needs a connection”.

## Evidence

- TypeScript `tsc --noEmit`: PASS (see offline-typecheck.log).
- Focused cache/head/sidebar/profile models: 49 PASS (offline-cache-tests.log), including actual NIP-44, Unicode chunking, account lock, relay isolation, clear-during-encryption, caps, parser round-trip and existing hydration interleavings.
- Mounted production admission hooks/context: 2 PASS (offline-admission-tests.log), including a callback queued over disconnect/reconnect and cached view denial.
- Every test/typecheck is run in a separate process session (Python start_new_session calls setsid) with timeout and process-group TERM/KILL cleanup. No browser/native/Tauri/cargo builds, services or M5 actions.
- Dependencies unchanged. Hermit used for repository tooling; task worktree uses a read-only symlink to the existing desktop dependency installation.

## Remaining P1 / review boundaries

This is a draft checkpoint, not P1 completion or release acceptance. Independent Sol review requested through root after PR creation. Mobile is separate draft PR90 from .8, also flag OFF, using Application Support files and NIP-44.

The .8 desktop build has only a production Tauri command transport; `web/` is a repository browser, not a browser chat transport. The IndexedDB adapter and injectable identity-bound `OfflineCipher` seam are implemented. Generic NIP-07 active-account operations cannot atomically pin the sender, so the default browser cipher fails closed; an authorized host must inject a NIP-44 provider that binds `expectedPubkey`. End-to-end browser chat acceptance needs the web transport owner or an explicit browser chat port. Root was informed; do not claim a shipping web chat.

Remaining desktop integration work includes a complete visual disabled-state/tooltip audit (API writes are fenced), unloaded-thread/deep-link offline empty-state polish, sidebar cached-count presentation, and PR51 host-banner collapse when that independently owned source is composed. Native SQLite compile/platform acceptance and real IndexedDB browser lifecycle acceptance are intentionally not run under the dispatch's light-only gate. macOS/iOS/Android/file protection are unverified on Linux.

No PR review marker, source GO, native verification, merge or deployment is asserted. Preserve exact-observed, unseen/archive, sidebar and outbox owner seams during .9 integration. Owners445b5cb9,2d576c28,36ce8949,9e03d4e,fd0be4cf have received additive-seam coordination messages.

## Source hardening after the initial draft

Native NIP-44 chunks now pin the expected account inside the command, rather than relying only on before/after renderer checks. Admission grants wait for DOM commit. Native cache I/O is ordered so a clear cannot be overtaken by an already-dispatched write. IndexedDB v3 adds a scope index and a transactionally checked clear epoch for concurrent tabs; epochs fence both late encryption and decryption. Snapshot timestamps are authenticated inside ciphertext. Legacy plaintext IPC writes are disabled; migration purges legacy payloads/freelist/WAL with a retryable checkpoint before marking version3.

Offline thread/channel placeholders, thread truncation disclosure and core message/sidebar disabled affordances are wired. Cached profile labels explicitly drop owner/agent/onboarding authority. Focused storage tests exercise the production IndexedDB adapter against a deterministic transaction model; this is not real browser lifecycle acceptance. Remaining source polish is narrower: complete search/huddle/agent/move affordance inventory, sidebar count presentation and PR51 composition. Browser chat transport and independent exact-head review remain external prerequisites.

Network-loss epochs invalidate source authority even when the socket has not observed the gap; both callback-time checks and committed-view grants are fenced. Logout freezes new cache writers and drains dispatched native I/O before the existing atomic process-reset path. Head aux closure excludes unopened-reply edits and retains selected-root edit/reaction deletions.

Encrypted NIP-44 chunk manifests bind the complete plaintext digest and chunk count, rejecting reordered/spliced chunks. Sidebar now labels cached list provenance; search input is disabled offline. Remaining source polish is limited to the full agent/move/search-trigger affordance audit and composed PR51 collapse; neither a review nor shipping browser chat is asserted.
