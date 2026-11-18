# Buzz offline P1 deliveries

- Desktop (Tauri) draft: https://github.com/tmad4000/buzz/pull/86 — detailed evidence and remaining work in `docs/fork/offline-p1-desktop-delivery.md` in that PR.
- Mobile draft: https://github.com/tmad4000/buzz/pull/90 — detailed evidence and remaining work in `docs/fork/offline-p1-mobile-delivery.md` in that PR.

Both branches start at the .8 tag and target the .9 bucket, `sol/buzz8-release`. Features default OFF. Every cache payload uses NIP-44-to-self; mobile uses Application Support files. P2 supersession/PR44 integration is excluded.

Run focused checks through `scripts/run_offline_check.py SECONDS COMMAND ...`; it creates a separate process session and terminates the whole process group on timeout/completion. Native/browser/M5 builds retain the release captain's START gate. Linux evidence does not verify Apple or Android behavior.

Independent Sol reviews are requested through root. These draft checkpoints are not source GO, release acceptance, merge or deployment. Root scoped P1 to desktop (Tauri) and mobile. The fork has no production web chat client. IndexedDB and the opt-in window.nostr.nip44 seam are retained and unit-tested, but end-to-end web wiring is excluded. The seam is ready for a future host that supplies an account-pinning lease. A minimum browser chat client would need auth/session/route UI, relay query/subscription/mutation/upload transports, identity-bound signing, cache/outbox wiring, multi-tab and offline lifecycle tests: approximately 80–120 agent-hours, excluding full native-feature parity and deployment. Detailed assumptions and remaining acceptance work are in the platform handoffs and Paseo Stream.
