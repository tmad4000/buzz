# PR86 candidate remediation mapping

All five rows are candidate implementations with passing builder regressions, NOT independent resolution or source GO. The exact full fixing/review head is supplied in the coordinator handoff after commit. Previous NO-GO heads are preserved. Same reviewer1b202303-dff3-45ad-aa87-0782f5f67a88 must recheck all five after coordinator a036208f validates the mapping; if R2/R4/R5/R6 fail again, escalate root explicitly. Mobile PR90 belongs to01d56bc1 and its six-item matrix is separate.

## R2

ACK: each observed thread requires successful current-generation fetch proof coupled to committed body/provenance; reject obsolete/canceled reads and recheck callbacks.

Status: implemented candidate, regression PASS, independent review OPEN.

Source: `desktop/src/features/messages/lib/offlineThreadAuthority.ts:25`, `desktop/src/features/messages/lib/offlineThreadAuthority.ts:72`, `desktop/src/features/messages/lib/offlineThreadAuthority.ts:95`, `desktop/src/features/messages/useThreadReplies.ts:60`, `desktop/src/features/messages/useThreadReplies.ts:112`, `desktop/src/features/conversations/OfflineConversation.tsx:114`.

C-MOUNT: R2 production loadThreadReplies + observed query-backed DOM/useConversationReadAdmission regression PASS; head refresh/DOM commit while thread pending or failed stays denied, raw return preserves cache marker until matching successful query-data commit, old/canceled completions reject. Suite5/5 PASS.

## R4

ACK: dispose all legacy scopes at opt-in/startup, independently of signer/decrypt availability.

Status: implemented candidate, regression PASS, independent review OPEN.

Source: `desktop/src/shared/api/offlineCache.ts:186`, `desktop/src/app/App.tsx:825`, `desktop/src/features/settings/ui/OfflineStorageSettings.tsx:60`, `desktop/src-tauri/src/offline_cache.rs:46`, `desktop/src-tauri/src/offline_cache.rs:72`.

C-MODELS: R4 locked multi-account/multi-relay legacy storage cleanup production-seam regression PASS: all known legacy keys removed, unrelated draft retained, explicit native migration invoked while locked before rejected owner read. Suite64/64 PASS. Native SQLite cleanup/journal code remains SOURCE-ONLY, not compiled/executed.

## R5

ACK: preserve .8 flag-OFF legacy paint-cache load/store/hydration and gate new Storage inspection/migration.

Status: implemented candidate, regression PASS, independent review OPEN.

Source: `desktop/src/features/messages/lib/channelHeadCache.ts:20`, `desktop/src/shared/api/tauriChannelHeadCache.ts:16`, `desktop/src/shared/api/tauriChannelHeadCache.ts:38`, `desktop/src-tauri/src/channel_head_cache.rs:251`, `desktop/src-tauri/src/channel_head_cache.rs:266`, `desktop/src/features/settings/ui/OfflineStorageSettings.tsx:31`.

C-MOUNT: R5 actual legacy adapter load/store/clear and hydrateChannelHeads + mounted real OfflineStorageSettings/CommunitiesProvider PASS; default-on and prior opt-out preserved, no encrypted metadata seeded, zero cache/identity/migration IPC from OFF Storage, untouched legacy scope retained. Only known pre-existing relay/media metadata initialization calls are excluded from fixture counts. Suite5/5 PASS.

## R6

ACK: cached as-of warning persists through prolonged connecting/reconnecting until authoritative refresh; retain debounce.

Status: implemented candidate, regression PASS, independent review OPEN.

Source: `desktop/src/features/conversations/OfflineConversation.tsx:138`.

C-MOUNT: R6 navigator-online connecting and reconnecting each held2100ms PASS; cached as-of stays visible, connected-but-unrefreshed stays refreshing/denied, current authoritative refresh alone removes warning. Suite5/5 PASS.

## UI1

ACK: connectivity at deferred assignment/new-section/removal execution and after awaited start at the actual Huddle membership add.

Status: implemented candidate, regression PASS, independent review OPEN.

Source: `desktop/src/features/sidebar/ui/sidebarMenuHelpers.tsx:18`, `desktop/src/features/sidebar/ui/ChannelContextMenu.tsx:78`, `desktop/src/features/sidebar/ui/AppSidebar.tsx:353`, `desktop/src/features/huddle/components/huddleAddConnection.ts:3`, `desktop/src/features/huddle/components/AddAgentDialog.tsx:91`, `desktop/src/features/huddle/components/HuddleBar.tsx:644`, `desktop/src/shared/api/tauri.ts:288`.

C-UI1: production deferred helper for assignment/create/removal with physical network loss before drain, delayed local start with connection loss before onAdd, direct actual guarded membership-command dispatch denial, healthy add success PASS1/1. Also included in C-MODELS64/64. AppSidebar creation confirmation additionally rechecks before register mutation; native Huddle execution not claimed.

## Exact commands

All commands run from `desktop/`. C-MOUNT and C-MODELS logs are committed; process runner gives each check a separate session, timeout and whole process-group cleanup.

### C-MOUNT

```sh
python3 ../scripts/run_offline_check.py 100 node --import ./test-jsdom-setup.mjs --import ./test-loader.mjs --experimental-strip-types --test-force-exit --test src/features/conversations/readAdmission.jsdom-test.mjs src/features/conversations/offlineAdmission.jsdom-test.mjs src/features/conversations/offlineReviewRegressions.jsdom-test.mjs src/features/settings/ui/offlineOffBaseline.jsdom-test.mjs
```

Evidence: `offline-review-regressions.log`.

### C-MODELS

```sh
python3 ../scripts/run_offline_check.py 110 node --import ./test-loader.mjs --experimental-strip-types --test --test-force-exit src/shared/api/offlineCache.test.mjs src/shared/api/offlineActionExecution.test.mjs src/features/messages/lib/offlineHeadSnapshot.test.mjs src/features/messages/lib/channelHeadCache.test.mjs src/features/channels/channelSnapshot.test.mjs src/features/profile/lib/userLabelStorage.test.mjs src/features/messages/ui/MessageThreadReplyState.test.mjs src/features/messages/useThreadReplies.test.mjs
```

Evidence: `offline-review-models.log`.

### C-UI1

```sh
python3 ../scripts/run_offline_check.py 60 node --import ./test-loader.mjs --experimental-strip-types --test-force-exit --test src/shared/api/offlineActionExecution.test.mjs
```

Evidence: `offline-review-ui1.log`.

TypeScript: `python3 ../scripts/run_offline_check.py 120 node node_modules/typescript/bin/tsc --noEmit` PASS, exit0/no diagnostics (`offline-review-typecheck.log`). Rust formatting completed; no cargo/Tauri/native/browser/M5 builds. Native SQL/IPC/device acceptance remains uncompiled/unexecuted under the release gate.

Supplementary R1/R3 preservation: C-MODELS passes pending native put/touch vs clear/logout probes and actual NIP-44 cross-record/cross-relay splice/reorder/duplication/omission rejection. Native storage-owner clear epoch, UPDATE-only touch and sign-out suspension/drain are new source-reviewed paths, not runtime-native evidence.
