# Mobile sidebar sections — .9 candidate

Jacob's original ask (2026-11-18 00:48Z): “when I rearranged the sections on my computer it didn’t rearrange them on my phone in buzz.” Root dispatch: d3caa262; implementation session: 4bb04859.

Source baseline: tag `buzz-ideaflow-v0.5.28-ideaflow.8`, resolved locally to `16fa57dfc97f115d00382fcb75128295b5fb3def`. Dispatch reference `69eda1ff` is an ancestor. Own worktree `/home/dev/agent-worktrees/buzz-mobile-sections-20261118`; branch `sol/mobile-sidebar-sections`. Intended for the .9 bucket; draft PR base is the released .8 branch `sol/buzz8-release`.

## Behavior and format

The tagged mobile source already contained a legacy section reader/writer and custom-group UI. This change reads meta-less version 1 and known `meta.v` 1/2 documents from the existing self-encrypted kind 30078 `channel-sections` lane. Registers are authoritative over stale compatibility projections. Custom sections sort by `(order,id)` and are densely numbered. Full built-in/custom layout order is normalized, deduplicated, and stable for equal ranks. Unknown metadata/version falls back to a flat list; its cursor prevents older replay from restoring stale groups.

Enable new ordering and channel/DM/forum grouping with `--dart-define=BUZZ_DESKTOP_SECTIONS=true` in the captain's mobile build. Default is false. Starred remains a shortcut with original placement retained in this mode. Existing membership/archive filtering and canonical Channel objects remain intact. Collapse stays local: the format owner confirmed desktop does not store collapse state in this lane.

The manager has no publication implementation, regardless of flag. Legacy mutation methods are inert for compatibility; section editing actions are unavailable and explain that sections are managed on desktop. This safety change is unconditional: a legacy mobile writer could clobber/fence desktop metadata. Cached layout is relay + identity scoped; old unscoped caches are not imported across communities. Existing startup/backoff/live subscription/foreground refetch seams remain.

No new dependencies, kinds, relays, native code, builds, M5 actions, or Buzz messages.

## Validation

Flutter 3.41.7 / Dart 3.11.5 from activated repo Hermit; existing lockfile and offline dependency cache. `flutter analyze --no-pub` clean. Focused Flutter section model/manager tests, sidebar section widget tests, and channel actions tests. Each invocation is bounded by a 180s supervisor using a new session/process group (`setsid` semantics), TERM of the process group on timeout, then KILL after 5s. No run timed out. Final checks: 21 section model/manager tests, 5 section-focused sidebar widget tests, 20 channel-action tests; an additional focused action test passed after asserting the desktop-managed row is disabled. All pass. Logs: `/tmp/mobile-sections-final.log`, `/tmp/mobile-sections-tests2.log`, `/tmp/mobile-sections-actions-final.log`.

Reader cases: metadata v1/v2, stale projections, deleted/orphan assignments, unknown versions, equal-rank tie-breaks, canonical ordering, fallback built-ins, access filtering, relay cache isolation, unknown-head fencing/recovery, inert mutators and zero signer calls. Existing startup retry, dispose, subscription recovery and relay cursor tests remain. Widget cases: authored built-in order, DM assignment under custom header, collapse hiding the assigned DM, and read-only menus/actions.

## Review and release gates

Format review: 36ce8949 confirmed envelope and register-authoritative reading, requested stable rank ties + dense section numbering; both fixed with a regression. Format approval confirmed after both fixes (36ce8949 message read back via `paseo logs`). Source-format approval only; owner ran no checks. Independent Sol review requested through root with the draft PR.

Not a TestFlight delivery. Captain 9888b74e must grant START for any native/mobile build, then enable the flag and exercise desktop rearrange → phone initial fetch/live update/reconnect/foreground resume, channel/DM placement, Starred shortcuts, account/community isolation, navigation, local collapse and unknown-version fallback. Linux Flutter tests do not verify iOS behavior. Human testing and review attestation remain open; PR stays draft.
