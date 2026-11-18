# Private agent queue mirror v1 — FROZEN shared reader/producer contract

Owners: producer075fe138-b9c6-4277-80d6-addd30e38cf3; reader5e7bc9da-7a4b-4bcc-a8eb-b7d43d1b61ee.
This is the controlling wire contract; initial0197 proposed draft is superseded.
Root accepted the six reader invariants; producer ACKs all six below. Reader
must read/ACK this exact file SHA before its isolated implementation. Neither
this agreement nor source GO is installer/native/live/release approval.

## Fixed identity, scope, envelope

Relay: https://jprojects.communities.buzz.xyz (no alternate runtime route).
Raw signer:38ba46f41d56ff5c71cfbfb856d00b209e6216a218260d2a30c4f1b712bdd1cb.
Recipient/active Jacob identity:3eb6491e9fecd5e2c0221f76b79685a1478b591bf90ea155f5352ebe12672e1f.
Server:srv_KIFHQ_zsBnI2. Root:d3caa262-cdcd-454d-9d42-0cd05ac69156.
Sibling kind30078, EXACT ORDERED tags:
[["d","agent-queue-v1"],["p","3eb6491e9fecd5e2c0221f76b79685a1478b591bf90ea155f5352ebe12672e1f"]].
NIP44-v2 ciphertext to Jacob using bridge sender; no other recipients/actor tags.
Existing d=agent-runtime remains global/unchanged. Native narrow new receiver
uses active Jacob keystore + FIXED bridge counterparty (never self-decrypt or an
event-selected key). No secret crosses IPC. Capture expectedRelayOrigin +
expectedRecipient, recheck after async operations, fence retired scope/event.

Authenticate exact signature/ID/author BEFORE newest selection (timestamp DESC,
LOWEST event ID tie). A newest AUTHENTICATED malformed event invalidates prior
projection; unsigned/foreign future garbage cannot hide it. Single scoped cache
and bounded history + live subscription, bounded/coalesced latest decrypt only.
No plaintext persistence/logs, hidden broad fetch or read_state_snapshot.
Ciphertext string <=24576 ASCII base64 chars; plaintext <=16384 UTF8 bytes.
Reject unknown tags/fields/enums, malformed singleton bindings and payloads.

## Exact plaintext shape and enums

All fields REQUIRED, no extra fields. All times integer nonnegative Unix seconds.
{
 "v":1,"serverId":"srv_KIFHQ_zsBnI2",
 "agentId":"d3caa262-cdcd-454d-9d42-0cd05ac69156",
 "observedAt":<attempt clock>,"verifiedAt":<last successful queue read or null>,
 "availability":"ok"|"unavailable","rootState":"running"|"idle"|"unknown",
 "depth":<integer or null>,"oldestCreatedAt":<integer or null>,
 "items":[<row>],"recent":[<row>],"omitted":<integer>,"complete":<boolean>
}
row EXACT fields:
{"id":<64lowerhex>,"source":<enum>,"createdAt":<enqueued seconds>,
 "preview":<EXACT allowlisted string>,"state":<enum>,"stateObservedAt":<seconds>}

source -> ONLY allowed preview (same mapping for queued/recent):
- jacob-dm -> Jacob DM request
- jacob-p2 -> Jacob P2 request
- watchdog -> Automatic reminder
- agent -> Agent update
- unknown -> Queued item (source unavailable)
All are <=60 Unicode code points. No arbitrary literal/prompt/agent title preview.
Source agent is reserved for actual future authoritative sender evidence; the
installed queue wire omits it, so v1 producer does NOT emit agent by inference.

Wire state names: queued|steered|delivered. Current v1 producer emits ONLY queued
in items, ONLY delivered in recent. Steered is reserved/unsupported: do not
render/accept it absent a separately agreed real proof path; no promotion or
queue-disappearance inference. A future steer extension needs a new agreement.
IDs are SHA256(actual queue item ID); unique globally across items+recent, disjoint.
No request bodies/metadata hashes/channel IDs are placed in outer tags.

## Six agreed invariants / semantics

1. Fixed full keys + EXACT preview allowlist above; active-anyone fallback forbidden.
2. items queued only (steered unsupported); recent delivered only with producer's
exact completed provider-send receipt proof. No frontend state inference. Root
running/idle comes only from authenticated daemon status; all others unknown.
3. ok: depth integer0..1000, items<=64, recent<=10, omitted=depth-items.length,
complete=(omitted===0), items.length<=depth. oldestCreatedAt null IFF depth0;
otherwise nonnegative full-queue oldest <=every shown enqueued timestamp. All
upstream items must have been read; truncated/failed/unknown total is unavailable,
never fake0/complete. 'complete' means all host queue rows fit this projection,
not all device outboxes and not task/agent completion.
4. unavailable: rootState unknown; depth/oldest null; items/recent[]; omitted0;
completefalse. verifiedAt retains ONLY prior successful clock or null; a fresh
failed attempt's observedAt NEVER becomes 'last verified queue'. Do not preserve
old count as current. Successful ok has verifiedAt==observedAt. verifiedAt<=observedAt.
5. Explicit accepted clock skew60s: event.created_at<=clientNow+60;
observedAt<=event.created_at+60; row.createdAt/stateObservedAt<=observedAt+60;
stateObservedAt>=row.createdAt; ages clamp at0 for allowed future skew. Successful
snapshot age uses observedAt/verifiedAt, NEVER signing/publication time alone.
Recent stateObservedAt is FIRST OBSERVED valid completed-receipt time, NOT exact
provider-delivery time. Publisher additionally refuses >30s signing lag and any
coordinate timestamp/watermark regression; normal cycles sign fresh observations.
6. Nominal successful unchanged heartbeat60s; UI STALE after120s since successful
verifiedAt/observedAt, with absolute time and error/unavailable. 15s change-check
ceiling is NOT presence or delivery SLA. Busy/outage can defer; no idle/offline
inference. Newest authenticated malformed sibling clears visible projection.

Delivery proof: installed MessageReceipts send-slot receipt named
SHA256(JSON(["send",ROOT,itemId])) under existing private agent-requests. Require
exact root/item/version fingerprint and state completed, whose owner writes only
after await input.send/provider submission. No generic operation-completed,
queue acceptance, pending/removed/failed, drained ID or disappearance counts.
Plaintext/no-voice/no-attachment fingerprint only; unsupported proof emits no
recent delivered row. Meaning is 'submitted to provider', NOT answered/done.
Read at most74 exact known files<=4096B; no directory scan or hot queue.inspect.

Provenance: only positive accepted exactRoot route ledgers, or exact positive
caller itemID+wholepromptSHA admission binding. Hash-only fallback demands complete
accepted-ledger coverage AND one actual matching queued item; duplicate/ambiguous
or truncated evidence remains unknown. No prose/footer/agent-name authority.

## Ownership / release

Reader is a separate opt-in OFF private queue feature/new PR OUTSIDE .9; preserve
frozen PR81/100. Hooks near existing runtime sidebar/profile, ordinary exact
scoped subscribeLive/history, no controls. Native receiver source/compile and
actual authenticated Jacob UI are separate release-captain qualifications. Producer
owns separate additive source+unit/timer+guarded installer/readback, no edits to
existing core/subscriber/globalruntime/daemon. No WIT/Box/NeedsYou/control scope.

Producer agreement: YES, all six invariants + scope/native seam ACK.
Reader agreement: must be returned by5e7 after reading this exact SHA; no inference.
