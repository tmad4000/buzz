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
