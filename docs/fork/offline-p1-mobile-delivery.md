# Offline P1 mobile delivery checkpoint

Owner: Paseo a027d58a-dc45-48ec-9629-2aa2fd6a08a3. Worktree `/home/dev/agent-worktrees/buzz-offline-p1-mobile-20261118`, branch `sol/buzz-offline-p1-mobile`. Draft PR90: https://github.com/tmad4000/buzz/pull/90, target `sol/buzz8-release` (.9 bucket). Starts at .8 peeled commit `16fa57dfc97f115d00382fcb75128295b5fb3def`. Desktop/web sibling PR86. Other worktrees read only.

Jacob's Buzz DM at2026-11-18 00:57Z asked for partial offline mobile/web reading, queued replies with authored time/context and supersession checks. This is P1 under Fable's full DESIGN.md including §6 Astra. P2 and PR44 integration are excluded.

## Behavior

- OFF by default: compile flag `BUZZ_OFFLINE_CACHE`. An opted-in artifact uses `--dart-define=BUZZ_OFFLINE_CACHE=true`; no native build without captain START. Tests override the same provider.
- One `OfflinePayloadCipher` seam, default NIP-44-to-self for every payload. Unicode-safe chunks plus encrypted whole-payload digest/count manifest reject reorder/splice. JSON/crypto runs in compute isolates. Scope and saved timestamp are authenticated. No attachment bytes/plaintext payloads/new dependencies.
- One directory seam: Application Support `/offline-cache/<scopeHash>/<kind>/<idHash>.json`, flushed tmp+rename. Shared bounded metadata LRU, rebuildable secondary index and cold committed-file recovery. Heads64, opened threads200/newest200 bodies, sidebar1, profiles2000; item/48MiB combined on-disk budget.
- Cached heads/summaries, opened threads including debounced incoming live replies, channel list and presentation-only author labels. Scope changes reset channel memory/queues. Clear fences pending crypto/writers; community removal/logout clears before credentials, retires old writers even if a later artifact disables the feature.
- Head/thread/sidebar banners, Retry, newest200 truncation, four-second recovery toast after authoritative data, metadata-sized media placeholders and uncached channel/thread copy. New gate requires current source, existing relay/network generations and foreground lifecycle. Grants follow committed AsyncData; optional cache initialization cannot delay live results. Route/post-frame callbacks recheck admission; own/pending replies excluded. Network restoration revalidates without synthesizing catch-up observation.
- Native offline message menus fall back to the disabled Flutter action surface. Common wrapper retains action layout and connection feedback for sheet/popover edit/delete, reactions, channel lifecycle/move/manage/read; callback and ChannelActions mutation paths recheck connectivity. Search disables input/transport; Huddle admission/control is fenced. Existing mobile .8 has no PR44 durable queue; this PR does not import an outbox engine.

## Evidence and validation blocker

`mobile-offline-tests.log`:13 cache/provider/widget tests PASS: actual NIP-44 Unicode/chunk tamper, scoped files, restart/index recovery, caps/budget, clear/late-write races, encrypted notifier hydration, physical network generation, committed thread authority, incoming live thread persistence, banner/media presentation. `mobile-offline-action-tests.log`: focused actual message-sheet tests (offline blocked edit/delete plus related existing behavior). `mobile-offline-view-test.log`:1 mounted actual ChannelDetailPage PASS, cached bodies render and read markers remain untouched.

Earlier related auth/community35 PASS (`mobile-offline-logout-tests.log`, including actual deletion before credential removal) and readstate4 PASS (`mobile-offline-readstate-tests.log`). Earlier focused analyzer runs were clean (`mobile-offline-analyze.log`, `mobile-offline-logout-analyze.log`). Final analyzer attempts fail before diagnostics while initializing filesystem watchers: Analysis Server `OS Error: Too many open files` (see `mobile-offline-polish-analyze.log`). Normal, single-root and machine-format attempts reproduce. No shared process/host limit changed; the final delta is not analyzer-certified. The mounted Flutter VM compilation checks the changed conversation/widget paths.

Every run uses `scripts/run_offline_check.py`, separate session/setsid, timeout and whole process-group TERM/KILL cleanup. Flutter VM only, --no-pub --no-test-assets. No native/browser/Tauri/cargo/M5 build or service. Tooling reuses package_config/package_graph metadata read only from the existing outbox worktree; pubspec.lock SHA256 matches `c8e268c6910dd80b361f0436a687c51a5fbbcc208bc43b13388b37657ce0901d`. Generated outputs stay task-owned; no dependency edits.

## Remaining

Independent exact-head Sol review requested via root; final analyzer needs available shared-host watcher capacity. Human/native acceptance remains: cold restart offline with channel/DM/two threads, second-device receipts unchanged, reconnect visible-body admission, lock/removal, device file-protection class and native keyboard/accessibility. Linux VM cannot verify UIKit/iOS/Android. PR51 composition and browser transport/signer prerequisite are recorded in sibling PR86. No source GO, full P1 completion, merge/deployment or Buzz posting asserted.
