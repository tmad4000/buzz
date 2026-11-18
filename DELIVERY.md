# Buzz offline P1 deliveries

- Desktop/web draft: https://github.com/tmad4000/buzz/pull/86 — detailed evidence and remaining work in `docs/fork/offline-p1-desktop-delivery.md` in that PR.
- Mobile draft: https://github.com/tmad4000/buzz/pull/90 — detailed evidence and remaining work in `docs/fork/offline-p1-mobile-delivery.md` in that PR.

Both branches start at the .8 tag and target the .9 bucket, `sol/buzz8-release`. Features default OFF. Every cache payload uses NIP-44-to-self; mobile uses Application Support files. P2 supersession/PR44 integration is excluded.

Run focused checks through `scripts/run_offline_check.py SECONDS COMMAND ...`; it creates a separate process session and terminates the whole process group on timeout/completion. Native/browser/M5 builds retain the release captain's START gate. Linux evidence does not verify Apple or Android behavior.

Independent Sol reviews are requested through root. These draft checkpoints are not source GO, release acceptance, merge or deployment. The .8 production browser chat transport prerequisite and remaining source/acceptance work are recorded in the platform handoffs and Paseo Stream.
