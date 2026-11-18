# Parent quote reveal / scope follow-up (.9)

Jacob's original ask: agent replies should visibly attach to the exact message they answer. Root's latest explicit assignment: apply075's compatibility advisory, use the dedicated exact-parent reveal seam, repeated-click regressions, separate draft PR stacked on frozen PR67 rather than modifying PR84.

Own worktree /home/dev/agent-worktrees/buzz-parent-reveal-20261118; branch agent-parent-reveal-20261118; final authoritative base3a1e41ec74e6de8b261fbb7b4e6667333b8c0e8a. PR67, PR84 and PR87 unchanged.

## Source finding and change

The advisory describes an onOpenThread(parent) pitfall. Exact183 already routes MessageThreadRow quotes through ThreadParentQuoteChip, then onJumpToThreadMessage(nativeRoot, exactParent), falling back to goChannel(channel,{messageId,threadRootId,force:true}). There is no onOpenThread(parent) call to replace at this base. Inline summary and sidebar branch toggles remain independent of the quote action. We preserve this existing seam and add repeated-click regression evidence rather than claim an absent callback was fixed.

Concrete scope gaps fixed in threadParentQuote:
- Reject duplicate/conflicting root/reply ancestry, missing native reply, and edit-event targets. Presentation root/parent/depth never supplies identity.
- Require exactly one matching channel marker on the child.
- A loaded parent's ID and its own single channel marker must match before displaying an excerpt or enabling navigation. Missing, removed/deleted (absent from index), mismatched or ambiguous parents use the neutral noninteractive earlier-message stub. No fetch, hidden read, composer action or cross-scope lookup.

The map is supplied by the current pane's scoped thread index. The helper cannot independently prove community/identity from a message body. No global cache lookup is introduced. Previews are explicitly **nested-only**: direct-root parent quotes remain deliberately omitted, since the root is already shown. This is not a claim that every reply has a preview.

## Preserved boundaries

Same default-OFF agentReplyUx. No bridge parser, signer/effective-edit signer, metadata/control qualifier, original card message ID/count/read target, watchdog prose or body fallback changes. No new protocol or runtime claims. PR84 controls and PR87 contract parser corrections remain separate. Originating-request footer, card-role/count-neutral and lifecycle projection are explicitly DEFERRED: there is no structured on-wire binding. No hidden parent read or composer mutation occurs during rendering; a user's navigation uses existing guarded navigation and ordinary visible-message admission. Existing different-thread opening defaults are unchanged.

Advisory SHA256 verified a80d53776e37077af1d108499e62e20866821a3d407b14de5ed96eb90dd5b592 at /home/dev/code/buzz-agent-reply-ux-contract-20261118/COMPATIBILITY-ADVISORY.md. Current CONTRACT.md/fixture/source hashes recorded by separate PR87. Synthetic fixtures are not signature proof.

## Validation and review

PASS:10 focused model tests,14 DOM tests, whole-desktop tsc --noEmit (exit0, no diagnostics). Logs validation/parent-reveal-model.log, parent-reveal-dom.log, parent-reveal-typecheck.log. Each run uses setsid + timeout + process-group SIGKILL cleanup via validation/run-bounded.py.

Production component tests repeat both owner callback and force-route clicks and preserve body identity and neutral stubs/default OFF. Actual owning-pane callback tests verify repeated exact-root/parent selection and guard behavior. Actual useUnreadSidebarThread hook tests reveal open, closed and collapsed ancestry twice, preserving per-view/saved disclosure semantics. No heavy browser/native/Tauri/cargo builds, live reads/posts/control triggers or Mac actions.

Owners445 and2d notified. Separate independent Sol source review requested through root. Keep draft/frozen for review; no deployment or native/human acceptance claim.

## Final authoritative rebase

Rebased onto original approved3a1e41ec74e6de8b261fbb7b4e6667333b8c0e8a. Dropped duplicate provenance commit0e8429994 and combined provenance receipt e021fa367; merge31a is removed by linear rebase. Retained quote hardening plus quote validation receipts. LocalEditedContent, exact3857 regression, formatter/cache/parser/type provenance remain supplied ONLY by original3a ancestry.

Product content not already in3a and retained:
- threadParentQuote.ts: strict native ancestry/channel scope checks, neutral absent/out-of-scope loaded-parent fallback, nested-only documentation.
- ThreadParentJump.test.mjs: repeated owning-pane exact-parent reveal guards.
- threadParentQuote.test.mjs: conflicting ancestry and parent scope cases.
- ThreadParentQuoteChip.jsdom-test.mjs: repeated dedicated owner/force-route clicks and scoped fixtures.
- useUnreadSidebarThread.jsdom-test.mjs: actual hook repeated reveal for open/closed/collapsed destinations.

DELIVERY.md and quote validation logs/receipts are also retained. No other product content differs from3a. Pre-rebase backup4f29 product/test source matches the rebased result exactly. Earlier parent-restack receipts are historical; fresh rebase checks follow in the final receipt. PR67 stays3a, PR84 and PR87 untouched.

## Final rebased candidate validation

Fresh PASS:18 focused model tests,15 DOM tests,whole-desktop tsc --noEmit exit0/no diagnostics. Logs validation/final-rebase-model.log,final-rebase-dom.log,final-rebase-typecheck.log; structured final-rebase-receipt.json. Runs use setsid/60s test/90s typecheck deadlines/process-group kill cleanup. Product/test tree matches backup4f29 exactly; original3a ancestry supplies all provenance changes. The retained5-file quote-only product delta is listed above.

PR67 remote readback3a and body explicitly record restore/freeze and independent GO comments6971137524 and6971162662. Requested PR67 expected183 lease push was no-op Everything up-to-date because remote already held3a. PR84 and PR87 are left untouched at their observed current heads,76e8ddaee andde2bf4765.

PR88 requested force-with-lease expectede021fa3677a1042f0a6e434d6e0227252f98ce68 differs from observed remote4f29b77b06760b539f9b21c6607fcbe421f88968 (our earlier normal-merge validation receipt). Candidate is prepared; push must preserve the requested lease guard. No silent replacement with a different expected SHA. Exact push outcome/needed decision will be recorded in Stream and root handoff. No live/native/release claim.

## Lease decision resolved and final publication

Root's latest Proceed now instruction authorizes the rebased PR88 publication with force-with-lease, superseding the earlier stale literal expectedSHA. Fresh remote readback is4f29b77b06760b539f9b21c6607fcbe421f88968; use THAT exact lease to preserve concurrent-write protection. The earlier expectede021 rejection remains historical and unchanged. PR67 is final3a; no parent-GO wait remains.

Post-push fresh checks and exact-head publication receipt are recorded at /home/dev/code/buzz-pr88-final-rebase-publish-20261118/RECEIPT.json (plus model.log,dom.log,typecheck.log). Product/test source remains identical to the tested quote-only rebase; this publication update is documentation only. Keep final pushed head frozen for reviewer6754eb26 via root. PR84 andPR87 stay at their existing correction heads for reviewersbe986aea andf087a4d0, respectively. No other source/head changes.
