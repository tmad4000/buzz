# Offline P1 — mobile draft checkpoint

Owner: a027d58a-dc45-48ec-9629-2aa2fd6a08a3. Isolated worktree `/home/dev/agent-worktrees/buzz-offline-p1-mobile-20261118`, branch `sol/buzz-offline-p1-mobile`, from .8 peeled commit `16fa57dfc97f115d00382fcb75128295b5fb3def`. Target .9 bucket / `sol/buzz8-release`. Desktop/web sibling: https://github.com/tmad4000/buzz/pull/86.

Jacob's Buzz DM at 2026-11-18 00:57Z asked for some offline mobile/web reading, queued replies with authored time/context, and supersession checks. This is P1 only under Fable's full 2026-11-18 DESIGN.md including §6 Astra. P2, PR44 integration and queued-reply supersession remain excluded.

## Current implementation

- OFF by default, compile flag `BUZZ_OFFLINE_CACHE`. An opted-in artifact uses `--dart-define=BUZZ_OFFLINE_CACHE=true`; do not run a native build without the captain's START. Tests override the same provider.
- One `OfflinePayloadCipher` seam, default NIP-44-to-self for every head/thread/sidebar/profile payload. Unicode-safe chunks fit the NIP-44 bound. JSON/crypto runs via compute isolates. No plaintext payload/attachment bytes or new dependencies.
- One directory-provider/storage seam: Application Support `/offline-cache/<scopeHash>/<kind>/<idHash>.json`, flushed tmp+rename. Bounded shared LRU metadata, a rebuildable metadata-only index, and scan recovery from committed records. Heads64, opened threads200/newest200 replies, sidebar1, profiles2000, item limits, combined 48MiB on-disk budget.
- Scope binding inside ciphertext, private paths hashed, generation fences, scope reset of channel memory/queues. Clearing fences encryption in flight. Community removal/logout deletes its scope before credentials, retires old writers, and does so even if the feature was turned off in a later artifact.
- Cached heads and summaries, opened threads with truncation metadata, channel list, and presentation-only author labels. Successful relay data re-establishes authority; optional cache failures do not turn successful network reads into errors.
- Head/thread banners with timestamp/Retry, metadata-sized unavailable media placeholders, Storage clear control. Existing connectivity subscription supplies the network signal.
- New readAdmissionProvider requires live source, the current existing relay generation, connected network/session and foreground lifecycle. Channel-open, thread body and sidebar seed paths recheck it. Post-frame callbacks recheck current route; own/pending replies excluded. Explicit local mark-read and connection-required transport writes are fenced offline.

## Evidence

- Focused Dart analyzer: see mobile-offline-analyze.log and mobile-offline-logout-analyze.log.
- 8 new focused cache/admission/media/hydration tests PASS (mobile-offline-tests.log). Includes actual NIP-44/Unicode, scopes, caps, combined budget, restart index recovery, clear during encryption, retired writers, cached notifier/summaries, reconnect-before-fetch denial and image placeholder.
- 1 mounted ChannelDetailPage regression PASS (mobile-offline-view-test.log): body renders and read markers remain untouched.
- Related community/auth regression files: 35 PASS (mobile-offline-logout-tests.log), including actual cache deletion before removal. Read-state regression file: 4 PASS (mobile-offline-readstate-tests.log).
- All runs have timeout + a separate process session (setsid) + whole process-group TERM/KILL cleanup. Flutter VM tests only; --no-pub --no-test-assets. No browser/native/Tauri/cargo/M5 builds or services.
- Tooling reuses package_config/package_graph metadata from the existing outbox worktree read-only; pubspec.lock SHA256 matches exactly `c8e268c6910dd80b361f0436a687c51a5fbbcc208bc43b13388b37657ce0901d`. Generated test output stays in this task worktree. No dependency/lockfile edits.

## Remaining / acceptance boundaries

Draft source checkpoint, not P1 completion, source GO or release acceptance. Independent Sol review requested through root after PR creation. The complete visual disabled-state/action audit, uncached/deep-link and truncation copy polish, cached-count presentation and full recovery-toast behavior remain. P1 mobile durable reply queue behavior is inherited from the separately owned build line; .8 does not contain PR44 and this PR does not import it.

Human/native checks remain: restart without network with channel+DM+two threads, second-device read receipts unchanged, reconnect/body-only admission, identity removal/lock behavior, device file-protection class and native keyboard/accessibility. Linux Flutter VM evidence cannot verify iOS/Android behavior. The desktop/web sibling separately records the missing .8 production browser chat transport and PR51 composition seam. No merge, deployment, Apple verification or Buzz posting performed.
