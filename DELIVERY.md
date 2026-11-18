# Buzz offline P1 deliveries

- Desktop/web draft: https://github.com/tmad4000/buzz/pull/86 — detailed evidence and remaining work in `docs/fork/offline-p1-desktop-delivery.md` in that PR.
- Mobile draft: https://github.com/tmad4000/buzz/pull/90 — detailed evidence and remaining work in `docs/fork/offline-p1-mobile-delivery.md` in that PR.

Both branches start at the .8 tag and target the .9 bucket, `sol/buzz8-release`. Features default OFF. Every cache payload uses NIP-44-to-self; mobile uses Application Support files. P2 supersession/PR44 integration is excluded.

Run focused checks through `scripts/run_offline_check.py SECONDS COMMAND ...`; it creates a separate process session and terminates the whole process group on timeout/completion. Native/browser/M5 builds retain the release captain's START gate. Linux evidence does not verify Apple or Android behavior.

Independent Sol reviews are requested through root. These draft checkpoints are not source GO, release acceptance, merge or deployment. The .8 production browser chat transport prerequisite and remaining source/acceptance work are recorded in the platform handoffs and Paseo Stream.


PR90 mobile takeover: Paseo `01d56bc1` owns b–f fixes and review coordination, from exact `cb34b3927`, in `/home/dev/agent-worktrees/buzz-pr90-takeover-01d56`; `a027d58a` retains desktop PR86 and its worktrees. See the mobile delivery's takeover section and `pr90-verified-tests.log` / `pr90-direct-analyze-verified.log`. Re-review routes to coordinator `a036208f-259f-46f1-9689-dba3d08e3805`, same reviewer `43467fd2-5d89-4891-a100-9811f770e915`. No root dispatch unless blocked.

PR90 follow-up strengthens fresh post-clear head/thread event, OFF sign-out filesystem-fault, warm/cold all-kind/index temp, and partial-write/rename evidence. See the follow-up section and `pr90-followup-combined-verified.log` / `pr90-followup-final-analyze.log`; original a027 ACK remains historical.
