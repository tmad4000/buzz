# Private global fleet indicator — .10 source follow-up

Jacob P2 00:13Z Nov19 asked for a live indicator of whether agents are still working, with queue length if possible. Root assigned075 the private producer and5e7 this UI. This new default-OFF layer stacks on reviewed PR10990e8; it does not change the frozen PR81/100/109 heads, queue v1 cb0b schema or global plaintext runtime. It is outside .9, intended for .10. Source review does not grant rollout, compilation, enablement or release.

The controlling contract is [private-fleet-status-v1.md](private-fleet-status-v1.md), byte-identical SHA f8edff4578e56ec626bf7b053812de0c99ca88d6b9284e14a63ba65c0fb8a194. Shared unsigned/no-effect fixtures remain exact SHA ff5e033cf8af0db25044eaf8790239354a21d478a95f5d67e121ad2454418483. Producer and reader ACK those bytes; earlier directory-list proposals are superseded. Client never polls a daemon or infers counts from stored/project directory records.

The indicator sits under search in the persistent sidebar header. A fresh observation shows scoped GCP working count, Root state and independently fresh queue depth. Blocked/permission evidence takes amber priority; running pulses green with reduced-motion protection; complete known idle is grey; partial/unknown/stale never becomes all-idle. M4/M5 unknown is visible. Partial counts are explicitly lower bounds; Root can be independently known beyond the counted prefix. Collapsed sidebar retains the dot with a full tooltip/accessible label, without a column of wrapped text. Click uses the existing Root profile/queue or existing Agents navigation fallback, not a new control lane.

Enable the independent device-local fleet switch on the canonical Paseo Root profile. It is available only to the exact active Jacob identity on the fixed community and does not enable the queue-detail switch. When disabled, there is no fleet subscription/decrypt/ticker. Root profile displays absolute observation and last-success clocks and the limited meaning of daemon-reported error/activity. Provider progress, presence, completion, semantic NeedsYou and remote hosts are not proven.

`useFleetStatus` owns one shared RAM-only reader for the fixed relay/bridge/recipient coordinate. It uses existing ordinary `subscribeLive`, kind30078/exact author/d=fleet-status-v1/p=Jacob/limit1, with bounded replay and live delivery, not broad snapshots or hidden queue subscriptions. There is one actual native decrypt and one latest pending candidate. A5s deadline reports stalled IPC but never spawns a replacement while the old operation remains in flight. Authenticated bad-event watermarks survive transport errors; late/retired callbacks and timed-out data cannot revive counts. Last unsubscribe/disable/scope retirement clears data. No decrypted persistence/logging, agent rows or arbitrary previews are added.

A NEW fixed-coordinate `decrypt_agent_fleet_event` uses active Jacob keystore keys and a FIXED bridge counterparty, checks current relay/recipient before and after async work, and verifies ID/signature/exact ordered tags/NIP44v2. It validates4096-byte strict schema before returning JSON; TypeScript validates again. The unchanged queue receiver is not widened or shared as a generic decrypt oracle. Untrusted authentication frames are bounded before signature work; within that budget, authentication precedes replacement and malformed newest clears the old projection. Foreign/unsigned noise has no authority.

Private wire has five buckets; daemon initializing folds into unknown. Complete counts sum to seen/total; partial prefix is at most9999 with independent Root, without forcing its bucket into prefix counts. Canonical unavailable clears counts/Root/queue but may retain fleet last-success time. Root queue source ID and its own clocks come only from the producer's confirmed signed queue v1; queue success is checked at the fleet observation, then independently expires in the client after120s without discarding fresh fleet counts. Failed attempts never renew success.

## Evidence limits and future gate

Focused Node tests bind frozen valid/invalid vectors, the actual bounded reader, scope/opt-in and native-command arguments, actual header/controller callbacks, real-clock fake-timer DOM presentation, partial Root edge cases, queue expiry and existing queue/runtime regressions. Store-ordering tests inject authentication for synthetic event-shaped records; separate tests reject actual foreign signatures. Shared fixtures do not prove a production signature or key. Source-SHA/exit receipts record bounded process-group cleanup. No browser/native/Cargo/compiler/keystore/daemon/live publisher/Mac/installer/service action occurred. Native formatting is not compilation.

Five Rust tests are SOURCE ONLY/NOT RUN, all under `commands::agent_fleet::tests::`:

- frozen_valid_and_invalid_payload_vectors_match_native_validator
- partial_root_outside_prefix_is_not_forced_into_counts
- queue_age_validated_at_fleet_observation_not_later_client_receive_time
- strict_limits_required_nullable_fields_and_clock_bounds
- other_active_identity_cannot_use_the_narrow_receiver

Future separately authorized qualification must compile the exact app cut and run actual nonempty Rust tests, then verify authenticated Jacob IPC/decryption, wrong-account denial, scope retirement, expanded/collapsed header/layout and paired queue navigation. The producer/Paseo owner separately needs an installed eligible bounded in-memory RPC, adapter/source/install review and signed encrypted readback. No directory fallback, new credentials or daemon mutation is authorized by this UI. Native/client and backend proof remain independent; review througha036.
