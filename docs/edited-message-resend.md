# Edited messages and manual Paseo resend (.8)

Authorized kind40003 edits retain their event ID and author timestamp in the
message projection. `(edited)` exposes the edit's time, including grouped rows;
invalid author times use a generic label. Same-second edits resolve deterministically
by timestamp then event ID. Forged/deleted edits do not supply display metadata.

Resend is an explicit message-menu action on the current original author's
published edited message, only while the author and canonical Paseo identity are
members. This includes channels and DMs; names and generic bot roles do not grant
eligibility. Nothing is sent merely because an edit arrives.

## Agreed listener contract

Root and listener owners075fe138/06bcf007 agreed:

- Existing signed Nostr kind7, content `🔁`.
- Exactly four tags: `["h",channel]`, `["e",originalMessageId]`,
  `["edit",namedEditEventId]`, `["t","paseo-resend-v1"]`.
- Canonical Paseo pubkey is
  `38ba46f41d56ff5c71cfbfb856d00b209e6216a218260d2a30c4f1b712bdd1cb`.
- Listener verifies original-author signature, exact authorized40003 revision,
  channel membership and routing. It forwards that named revision, even if a newer
  one exists, annotating “a newer edit exists”; it never substitutes later text.
- Listener dedupes `(original,edit)` and acknowledges the trigger with its own
  kind7 `👀`, referencing the trigger ID with `e` and the same channel with `h`,
  only after root submission is accepted or this revision is known forwarded.
  Uncertain/failed forwarding never produces that acknowledgement.

The client captures original/channel/edit/actor at activation, rechecks fresh
membership and native identity, and fences publication by live community and
identity. Explicit retries reuse the identical signed event. This bypasses the
ordinary reaction-toggle path and never clears/retargets a composer draft.

## Honest status

Relay acceptance alone remains **Pending**. **Sent to Paseo** requires an actual
canonical Paseo acknowledgement read back from the authenticated relay or its live
subscription. Wrong sender/channel/trigger/emoji cannot acknowledge the request.
Receipts are scoped by community, actor, channel, original and edit; later edits
have separate requests. Transport failure offers an explicit retry and does not
claim delivery. Client receipt state is local to the running app; server dedupe
is authoritative across restarts/devices.

Mock browser tests exercise the client protocol boundary, not actual listener
forwarding or deployed relay signature validation. Listener deploy is owned by075;
real listener/root receipt, human/native and full-CI acceptance remain separate.
