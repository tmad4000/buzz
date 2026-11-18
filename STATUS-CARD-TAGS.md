# Proposed status-card tags for .9

Root approved a signer-scoped compatibility renderer and additive structured binding. Sent to075fe13, the sole bridge writer. This is a **proposal/client reader**, not a bridge deployment receipt. No listener file is changed by this PR.

On the existing bridge-signed kind9 status-card create:

```json
[
  ["buzz-status", "progress"],
  ["agent", "d809bb50-03b8-41d2-ba83-e2a18cb86a89", "srv_KIFHQ_zsBnI2", "Optional display title"],
  ["paseo-link", "paseo://h/srv_KIFHQ_zsBnI2/agent/d809bb50-03b8-41d2-ba83-e2a18cb86a89"],
  ["buzz-status-source", "root"],
  ["e", "<canonical root event id>", "", "root"],
  ["e", "<exact originating Jacob event id>", "", "reply"]
]
```

`buzz-status` accepts exactly progress/waiting/done/ack. Agent UUID is full lowercase canonical form; host means Paseo's canonical `srv_…` ID, not an SSH host or arbitrary web URL. Optional fourth agent field is a display title, never the source of identity. The optional `buzz-status-source` is root/listener/watchdog; absence is labeled bridge. Link must exactly match the agent/host route. Existing native opener allows only its previously approved GCP/M4/M5 host+UUID scopes. No new kinds or hosts are introduced.

Machine fields are one complete snapshot, with at most one of each tag. Duplicate, unknown-state, malformed or conflicting envelopes render as ordinary content, even if the body resembles a legacy report. Only the established raw signer `38ba46f41d56ff5c71cfbfb856d00b209e6216a218260d2a30c4f1b712bdd1cb` qualifies. Displayed/delegated author cannot establish trust. The exact signed NIP10 reply tag provides request identity independently of capped paint depth or organization placement.

Each kind40003 status edit carries its usual original-card edit target and the complete latest machine snapshot; **do not copy root/request e-tags into the edit**. The client preserves original h/e ancestry and replaces just the effective status group for a bridge-signed edit. An authorized legacy bridge edit without a snapshot clears effective machine metadata and falls back to its new body, preventing stale progress tags masking Done text. A nonbridge-signed edit is never interpreted as a bridge report even if authorized to edit ordinary content.

Absent `buzz-status`, the bounded exact legacy body envelope remains a compatibility fallback. Tagged content does not need that body envelope; its original body remains accessible in details. All machine states are labeled reported, with no runtime/lifecycle inference, user obligation or semantic completion mutation. Waiting is Reported waiting, not inferred Needs you.

Presentation is behind default-OFF Agent reply context. The card initially shows only a compact reported-status/title summary; expanding details opts into model/provenance/original text, the Open agent link and copy IDs. Opening details/link does not send/resume a worker or write read state.

## Count-neutral boundary

The renderer adds no chat events and writes no reply/read/unread/notification counters. Existing bridge edits update one existing card, not a new reply per status transition. **This does not prove legacy relay reply counts exclude the existing ordinary status-card reply.** Structured tags supply classification for later count-neutral projection, but tags alone do not change server counters. This PR keeps existing counter authority and documents that remaining transport/integration limitation; it does not subtract partially loaded cards or claim complete quiet-footer semantics. Any change to canonical counts/selector treatment belongs with075/root and the owning count selectors, with composed validation.

Activation remains pending075's serialized source/activation/readback receipt. Client tests use synthetic tagged events only; no live tag support is claimed.
