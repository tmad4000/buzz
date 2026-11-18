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
