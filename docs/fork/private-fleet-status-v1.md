# Private agent fleet status v1 — clarified wire contract, document revision 2

Producer: 075fe138-b9c6-4277-80d6-addd30e38cf3. Reader: 5e7bc9da-7a4b-4bcc-a8eb-b7d43d1b61ee. Root-authorized sibling for Jacob's global working indicator, new default-OFF PR stacked on PR109, outside .9. Exact producer/reader agreement goes in a separate companion file; neither an agreement nor source GO authorizes daemon rollout, producer activation, native compilation or client release. The immutable queue v1 contract cb0b8f09a5e53fb087c0165663311b3a638b8740f38035c4fb10126dc6ce953c remains unchanged.

## Transport, identities, limits

Relay: https://jprojects.communities.buzz.xyz. A bridge-signed parameterized replaceable kind 30078, EXACT ordered tags:

[["d","fleet-status-v1"],["p","3eb6491e9fecd5e2c0221f76b79685a1478b591bf90ea155f5352ebe12672e1f"]]

Author and NIP-44 v2 sender: 38ba46f41d56ff5c71cfbfb856d00b209e6216a218260d2a30c4f1b712bdd1cb. Recipient and active keystore identity: ONLY the full Jacob key above. No active-anyone fallback, self-decrypt, plaintext outer data, alias or extra tags. Fixed GCP server srv_KIFHQ_zsBnI2 and Root d3caa262-cdcd-454d-9d42-0cd05ac69156. M4 and M5 are explicitly unknown; no new host reads. Public agent-runtime and private queue coordinates are untouched.

Plaintext maximum 4096 UTF-8 bytes; ciphertext maximum 8192 base64 ASCII characters. Strict schema, unknown fields, enums, integer bounds and arithmetic validated natively BEFORE IPC and in TypeScript after parsing. New narrow fixed-coordinate fleet decrypt command only, never a generic counterparty decrypt oracle. Current Jacob/relay/community captured before async work and revalidated afterward. One actual decrypt plus one newest candidate, bounded ordinary history/live subscription, no broad snapshot, plaintext logs or persistent plaintext. Disable, unmount and scope changes retire RAM and late results; A→B→A cannot revive a retired result.

No agent rows/titles, permission names/contents, prompts, paths, logs, process metadata, model names, provider keys or arbitrary previews. The only individual agent ID is fixed Root. The optional-looking fields below are REQUIRED and nullable exactly as specified. No unknown fields at any object level.

## Exact payload

```
{
  "v": 1,
  "serverId": "srv_KIFHQ_zsBnI2",
  "observedAt": 1795046400,
  "verifiedAt": 1795046400,
  "availability": "ok",
  "coverage": {"seen": 5, "total": 5, "complete": true},
  "gcp": {"running": 2, "idle": 1, "blocked": 0, "needsPermission": 1, "unknown": 1},
  "root": {
    "agentId": "d3caa262-cdcd-454d-9d42-0cd05ac69156",
    "state": "running",
    "queue": {"availability": "ok", "depth": 3, "observedAt": 1795046390, "verifiedAt": 1795046390, "sourceEventId": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}
  },
  "otherHosts": {"m4": "unknown", "m5": "unknown"}
}
```

Document revision2 supersedes retired directory proposal78f3109 and clarifies producer freezef8edff45 before any wire implementation. The private payload remains version1/five buckets and the sibling coordinate; no queuecb0b or PR109 contract change. Bilateral agreement and contract-only review are recorded separately.

The example is unsigned synthetic schema data, not production state. Root state enum: running | idle | blocked | needs-permission | unknown. Fleet availability: ok | partial | unavailable. Queue availability: ok | unavailable. Every timestamp is a nonnegative integer Unix SECOND, maximum 253402300799. Booleans are not integers. Counts, seen and total are integers 0..10000 when non-null. This is the approved bounded aggregate endpoint cap, not the retired directory page-size200; never clamp or truncate counts to200. Queue depth is 0..1000 when available.

`observedAt` is this fleet attempt. Successful complete OR partial authenticated daemon read sets `verifiedAt == observedAt`. On failure `verifiedAt` is the prior SUCCESSFUL observation or null; never renewed by an error. It must be <= observedAt. The private wire has FIVE disjoint count buckets. Daemon `initializing` is folded into wire `unknown`, as is any qualified live row of unsupported lifecycle. Root initializing maps to unknown. Dormant stored sessions are excluded, not counted as unknown.

### Coverage and unavailable shape

For ok: complete=true, total=seen, sum(gcp)=seen. For partial: complete=false, total=null, sum(gcp)=seen; counts are lower bounds over the scanned prefix, never exact fleet totals. A capped daemon response counts at most 9999 entries because one visit is reserved for exact Root lookup; its Root may be known beyond that prefix. Partial seen <=9999. Do not require Root's bucket to appear in partial counts: the approved exact Root lookup may be outside the bounded prefix, so partial Rootrunning with prefixrunning0 is valid. UI must qualify those prefix counts as lower bounds/partial; it is not a contradictory complete census. On complete coverage, a known Root state requires >=1 in that bucket. Unknown Root may mean missing, initializing or unsupported; it does not assert a counted unknown row.

For unavailable: coverage={seen:0,total:null,complete:false}; all FIVE gcp values=null; root.state=unknown; root.queue={availability:unavailable,depth:null,observedAt:null,verifiedAt:null,sourceEventId:null}; otherHosts unchanged. Only the fleet's own verifiedAt may retain last-success time. Never retain an old count, Root state or queue depth as current. No count from a truncated API page is complete. Explicit EMPTY policy: an authenticated, fully validated aggregate response with availabilityok, errornull, coverage{seen:0,total:0,complete:true}, all SIX source counts0 and Rootunknown is valid complete-zero for the eligible loaded population. Root absence is allowed. Missing/unproven/unsupported/denied/malformed/timed-out empty data is unavailable, never complete-zero. A paged directory's pageInfo.hasMore=false is NOT this proof. Complete-zero never means all machines idle, offline or all agents elsewhere finished.

## Daemon source and eligibility

Use ONLY the approved bounded in-memory `agent.fleet.summary.request` / `agent.fleet.summary.response` contract in DAEMON-SEAM-PROPOSAL.md (historical proposal hash e6bfb29f4eaf51c3a2e0bd8dd0e9d00e3d9e4c6cc04275a57ff41ca0aa082be8). The latest implementation handoff reports that exact payload unchanged, inside the normal {type:"session",message:{...}} frame. The daemon SOURCE is reported implemented, NOT installed or qualified here. No shared-daemon rollout is authorized to this producer owner.

After an authorized installed rollout, check server_info.features.agentFleetSummary === true once per connection. Connect direct existing loopback/local IPC with hello.auth={kind:"localCredential",token:<existing local credential>}; no legacy bearer header and no new credentials. Authenticate actual server identity and correlate canonical caller request UUID, exact response type, requested Root and server. A capability on a password/relay/header-only socket is not eligibility: correlated access_denied is unavailable. Unsupported, malformed, oversized, timed-out or denied response => canonical unavailable, no fallback. Never log/copy token or broader environment.

Source scope is loaded, noninternal, nonclosed manager agents on GCP, ALL workspaces including unplaced; NOT stored/dormant records, OS processes or provider-internal subagents. One bounded in-memory pass, constant aggregate memory, max10000 visits with one reserved Root visit; no registry/payload/timeline/provider/git/project/companion hydration or wakeups. Archive labels alone are not a new filter: an unloaded or closed archived session is excluded; a still-loaded noninternal/nonclosed session follows the same source rule. Transient loaded sessions follow the same eligibility rule; provider-internal sessions are excluded.

Do not use list/sync/workspace/MCP directory reads: SOURCE-COST-REVIEW.md demonstrates unbounded pre-pagination hydration and omitted unplaced agents. A frame cap/client timeout does not bound server cost.

SYNTHETIC CLASSIFICATION FIXTURE CONVENTION: each `classification[].input` is an OVERLAY on the explicit abstract qualified baseline recorded in fixtures-clarified.json: loaded/noninternal source, valid current pending-permission collection summarized as count0, requiresAttention=false, attentionReason=null, lifecycleidle, and sourceEvidenceQualified=true. These are abstract observations for source-owner contract examples, NOT toAgentPayload/SDK fields for a reader fallback. The native/TS fleet receiver does not interpret these records. Explicit missing/malformed priority-proof examples override that baseline and expect unknown; never silently default missing source proof to this baseline in production. Source-owner review/tests must bind equivalent actual internal fields and qualification before activation.

Disjoint daemon classification precedence (same source Root classification):
1. needsPermission when current pending-permission count >0, OR requiresAttention=true AND attentionReason=permission.
2. blocked when lifecycle=error, OR lifecycle=idle AND requiresAttention=true AND attentionReason=error.
3. running when lifecycle=running.
4. initializing when lifecycle=initializing (wire maps to unknown).
5. idle when lifecycle=idle.
6. unknown otherwise.

CURRENT SOURCE QUALIFICATION: this classifier belongs to the daemon owner, not the Buzz reader. The producer and UI do not consume toAgentPayload/list pages. A qualified source row must have a recognized current lifecycle and sufficient current permission/attention evidence to rule out higher-precedence buckets. The owner must validate its actual pending-permission collection/count and actual requiresAttention/attentionReason shape; unsupported lifecycle or missing/malformed evidence that cannot exclude current permission/error is unknown, never a fallthrough running/idle guess. The actual source code/review tests must prove this before activation; source implementation is only reported here, not independently qualified. An invalid aggregate counter/root enum, arithmetic, request identity or observation frame fails the whole aggregate as unavailable with no raw-payload fallback. No guessed list-schema field defaults are authorized.

Historical finished attention is not blocked. Old error attention on a running agent remains running unless current permission wins. A stale permission reason without affirmative attention is not permission. Counts mean daemon-reported session state, not provider liveness/progress, semantic completion or canonical NeedsYou. Pending permission count is not a Jacob response/approval authority. Hidden harness stalls may remain invisible.

Validate the unchanged daemon SIX-count response before projecting initializing+unknown into wire unknown. Daemon sum(counts)=coverage.seen and complete/partial arithmetic must hold; partial error=null. Source unavailable is exactly seen0/totalnull/completefalse/countsnull/root.state unknown/error unavailable. Never reinterpret source error as partial, or denied as successful empty. Source observing time must be within60s of local attempt and response, and actual request-to-response age <=10s. Source installation/cost/eligibility and exact wire projection require their own reviewed adapter/tests before publishing.

## Root queue's independent clock

Copy only the EXISTING signature/schema-verified CONFIRMED encrypted queue-v1 record, not its pending/unconfirmed journal or an extra queue.inspect call. No queue item/source/body/preview is included in fleet. For a verified available exact queue source, carry its exact signed event ID and its own observedAt/verifiedAt; queue depth only when availability=ok, verifiedAt=observedAt and age<=120s at fleet observation. Never relabel it with fleet time.

For an exact confirmed source which itself reports unavailable, or a formerly available source older than120s, queue availability=unavailable/depth=null; source ID and source observedAt/verifiedAt may remain to explain its age. They must remain the exact source's clocks (verifiedAt integer<=source observedAt or null). If no usable confirmed source exists, all three source identity/clocks are null. No source ID with a missing observedAt, or clocks without a source ID, is valid. No arbitrary old depth. On an unavailable fleet payload the canonical queue is ALL null regardless of local queue cache. Root lifecycle known/unknown and queue availability are independent on successful/partial fleet reads. The UI independently expires nested queue age while the fleet remains fresh: depth is current ONLY when queue availabilityok AND independent age<=120s, otherwise unknown. Stale queue data does not invalidate healthy fleet counts. Native and TypeScript validate every coupled-null and timestamp condition; sourceEventId is exactly64 LOWERCASE hex. No hidden queue fetch or signature-free local cache adoption.

## Freshness, ordering, scheduling and effects

Healthy observation heartbeat <=60s (target30s, min15s publication spacing, unchanged refresh60s). This is not an SLA. Fresh is age<=120s; STALE is age>120s since fleet verifiedAt, not publication time or the latest failed attempt. Show absolute observedAt and last successful verification; unavailability/error is explicit and hides old counts. Null verifiedAt is unknown. Independently stale queue cannot show an old queue depth as current.

Future skew maximum60s: signed event.created_at<=clientNow+60; observedAt<=event.created_at+60; verifiedAt<=observedAt; nested queue observedAt<=fleet observedAt+60. Additionally every non-null observation/verification timestamp and the signed event timestamp must be <=clientNow+60; a chain of relative bounds may not accumulate to120/180s of allowed future time. These absolute bounds are receiver checks; unknown receiver clock never manufactures freshness. Old values are allowed but honestly stale, not rejected merely for age. Clamp permitted negative ages to0. Producer refuses >30s signing lag and watermark regression. At exactly120s age fresh; at121 stale. No idle⇒offline or activity⇒presence claim.

Verify event ID/signature/fixed coordinate BEFORE newest selection, maximum created_at then LOWEST event ID tie. A newer AUTHENTICATED malformed/decryption-error/oversized card clears the old projection; unsigned/foreign garbage has no authority. No malformed-envelope legacy downgrade. IPC/socket failures show unavailable; foreign future noise cannot hide valid data. Preserve one active-scoped store and explicit retired-scope fences.

A producer must be a separate additive bounded unit using existing queue-mirror.lock→outbound.lock, no new lock inode or schema/cursor migration. Ciphertext-only bounded journal; exact signed ID durable BEFORE one POST; unknown POST outcome gets exact-ID readback, not blind resend. Fresh strong exact Jacob/Paseo private-DM membership before every POST. Existing bridge/queue data, timers, caps and subscription remain unchanged. Source+installer review, guarded six-mutex admission and signed encrypted readback precede any live claim. No controls in v1; no daemon stop/resume/permission operation.

## UI sample and authority

Before: no global activity indicator; private queue remains its independent opt-in view.
After, only fresh complete data: “2 agents working · root busy · 3 queued”. Amber when blocked/permission counts are positive; grey idle ONLY with complete coverage and zero running/blocked/needsPermission/unknown. Positive unknown prevents all-idle. Partial says “at least N observed · partial”, never exact fleet counts or all-idle. Root and queue unknown/stale are qualified separately. M4/M5 unknown is VISIBLE beside/in the global indicator or its always-visible supporting text, not only a tooltip. Tooltip additionally explains GCP loaded sessions only; no Mac reads are inferred. Click opens the existing Side-agents/queue view; no control. Reduced-motion/accessibility is UI-owned. Neither flag silently enables the other; disabled means no subscription/decrypt.

Agreement is recorded separately against frozen bytes. Synthetic fixtures demonstrate classification and clocks only; they are not signatures, live daemon qualification, native IPC, actual UI, producer activation or release proof.
