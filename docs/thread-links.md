# Thread organization annotations (v1 foundation)

This is a protocol/parser/projector foundation. It is **not connected to the
desktop UI or a CLI publisher**. No messages have been moved, no relay or
database changes are included, and the commands below are a proposed contract,
not installed commands. Follow-up work must exercise the actual client and an
isolated relay before using it on a real conversation.

The original seven signed Nostr fields stay unchanged. An author may publish a
separate signed annotation describing a presentation parent for their own
message. A fork can render that overlay while official clients keep the native
thread and see an honest short annotation receipt. Kind9 subtype acceptance on
the deployed relay is unverified. Unknown event kinds are rejected by the
current relay, so this convention uses an ordinary channel message.

## Wire contract

One operation per signed kind9 event. Tags are exactly the following pairs;
all IDs are full lowercase64-hex and the channel is an exact UUID. No extra,
duplicate, `e`, `p`, mention, actor, broadcast or grant tags are allowed.

```json
{
  "kind": 9,
  "content": "Thread organization: linked one prior message. Originals unchanged.",
  "tags": [
    ["h", "CHANNEL_UUID"],
    ["t", "buzz-thread-link-v1"],
    ["buzz-thread-op", "link"],
    ["buzz-thread-child", "CHILD_EVENT_ID"],
    ["buzz-thread-parent", "PARENT_EVENT_ID"],
    ["buzz-thread-previous", "none"]
  ]
}
```

`unlink` omits the parent tag and restores the child's original native parent;
it does not always promote the child to top-level. `buzz-thread-previous` is
`none` for the first operation or the accepted prior annotation ID for this
child. Content is descriptive; the signed tags carry the operation. Do not
duplicate original message bodies in receipts, plans, logs or metadata exports.

The signer must equal the child's effective author. Effective attribution is
recognized only through the existing verified active-relay author resolver;
arbitrary `p` tags are not authority. V1 has no delegation or curator bypass.
Cross-author proposed moves remain proposals, even if the signer is an admin.
No annotations may be used as message parents or children.

## Pure projection contract

`threadLinks.ts` verifies fresh canonical copies with the existing Nostr
hash/BIP340 verifier, rather than trusting its cached verified symbol on a
mutable event object. It validates bounded event shape and exact channel scope.
`threadLinkProjection.ts::projectThreadLinks` consumes the authenticated scope,
original message closure, annotation history and `historyComplete` flag. Its
output contains only IDs, graph metadata, decisions and diagnostics; no bodies.

An unresolved reference stays pending. After a successful authenticated,
scope/generation-fenced read proves a reference unavailable, the caller may
include its ID in `unavailableEventIds`. Such a bad annotation is rejected
rather than suppressing valid operations forever. A timeout, read error,
incomplete page or missing local cache row is **not** proof of absence. An
available verified event takes precedence over an older absence result.

The host is not cryptographically bound by a channel tag. The caller must fetch
from the captured authenticated community and fence every async completion by
community, identity and generation. Never mix snapshots from two hosts merely
because they have the same channel UUID. The pure module does not fetch data,
establish current membership, publish, persist, mark read, or grant access.

Replay deduplicates annotation event IDs, then sorts by `(created_at, id)`.
Each child has one selected head. A valid operation whose previous head is
stale is a visible conflict; unknown predecessors are pending. Stock relay
acceptance is separate from projection selection: this is a client compare
with known head, not a relay atomic CAS. The loser of a concurrent same-head
race remains conflict evidence. An owner resolves it with a new operation
naming the selected head. Undo is append-only `unlink`; deletion/revocation
semantics are not implemented.

Canonical and accepted overlay edges participate in cycle detection. Moving a
subtree checks the depth of all its descendants, not just its head. Depth100
is accepted; depth101 is rejected. The snapshot accepts at most5,000 messages
and1,000 annotations, each with bounded content and tags; overflow is an
explicit incomplete result, never an authoritative empty history.

History and referenced-message closure must be complete. A failed fetch,
missing child/ancestor/predecessor, invalid original, or inconsistent canonical
root yields `incomplete`; all returned positions remain canonical and there
are no selected heads. Otherwise valid independent operations can be selected
alongside rejected signatures/authority errors or stale-head conflicts. This
conservative first foundation deliberately avoids displaying a partial
inferred graph. A production loader needs bounded retries and an explicit
recovery/diagnostic path for unavailable references; do not ship a loader that
waits forever on an unresolvable annotation or silently treats failure as zero
history. Malformed or unauthorized subtype messages must remain visible as
ordinary content/audit diagnostics rather than disappear from the UI.

## Planned CLI dry-run interface

```text
buzz-paseo thread link CHILD --parent PARENT --dry-run
buzz-paseo thread unlink CHILD --dry-run
buzz-paseo thread plan --channel CHANNEL --out PLAN.json
buzz-paseo thread apply PLAN.json --expected-digest SHA256
buzz-paseo thread verify PLAN.json
```

These commands are not implemented in this PR. A dry run must read/verify the
exact source events and complete annotation closure, then invoke the same
projection rules. Do not create a second, drifting ancestry policy in the
bridge. A JSON plan contains schema version, captured community/channel,
canonical child/parent IDs and hashes, native and proposed parent/root,
effective author, previous annotation head, authority outcome, reason and
confidence, source fetch boundary and plan SHA256. Ambiguous associations or
cross-author links are `proposed`, never actionable. No source body archive.

Root reviews the exact digest-bound DM mapping before apply. Applying must
recheck scope/membership and the expected head, persist the exact signed event
bytes/ID in a private journal before publish, and read back that same ID before
claiming success. A timeout retries the same signed event, not a new event.
Partial batches retain durable retry records. Verify signature, exact saved
annotation, selected projection head, and unchanged originals separately.

The proposed read-only commands are:

```text
buzz-paseo thread link CHILD --parent PARENT --dry-run
buzz-paseo thread unlink CHILD --dry-run
buzz-paseo thread plan --channel CHANNEL --out PLAN.json
```

They should produce the same body-free plan shape. These commands are not
implemented by this PR. Example field names (placeholder IDs abbreviated):

```json
{
  "version": 1,
  "communityUrl": "https://relay.example",
  "channelId": "CHANNEL_UUID",
  "publisherPubkey": "SIGNER_PUBKEY",
  "snapshotComplete": true,
  "operations": [{
    "operation": "link",
    "childEventId": "CHILD_EVENT_ID",
    "parentEventId": "PARENT_EVENT_ID",
    "effectiveChildAuthor": "SIGNER_PUBKEY",
    "canonicalParentId": null,
    "canonicalRootId": null,
    "presentationParentId": null,
    "presentationRootId": "CHILD_EVENT_ID",
    "expectedAnnotationHead": null,
    "requiredCanonicalRoots": ["CHILD_EVENT_ID", "PARENT_EVENT_ID"],
    "eligibility": "self-author",
    "reason": "Reviewed reply relationship"
  }]
}
```

Unlink uses a null proposed parent; its native restoration parent remains in
`canonicalParentId`. Cross-author rows have `eligibility: proposal-only`, never
`self-author`. Snapshot failure is an error/incomplete plan, never a valid empty
plan. Source event IDs are their signed content hashes; read back their complete
signed originals in memory for verification without writing body archives.
Review/approval binds the SHA256 of the **exact UTF8 plan file bytes**. A future
`thread apply PLAN.json --expected-digest SHA256` must fail if even whitespace
changed, and repeat all authority, membership, completeness and head checks.

## Required production integration

This foundation is intentionally not wired to the following seams yet:

- Preserve canonical parsing/building in `threading.ts`, the raw event cache,
  `hooks.ts` send path and backend `messages/thread_ref.rs`. A message C that
  was top-level and is displayed under A still needs native root C for a new
  reply to C. Sending projected root A is rejected by relay ancestry checks.
- Feed a separate validated presentation map after formatting original
  messages in `formatTimelineMessages.ts`, before `threadPanel.ts` indexes
  them. Never patch `RelayEvent.tags`, even on a copy labeled as signed data.
- `useThreadReplies.ts` and `independentThreadPanel.ts` need the union of all
  affected canonical subthreads, referenced top-level messages and aux
  edit/deletion/reaction closure. Relay-native thread windows/counters do not
  know about moved rows. Complete projected counts must be derived, or marked
  unknown/loading. Preserve access checks, pagination, overlap/dedup and stale
  result fences; do not lose moved rows on navigation.
- An audit badge must disclose the organizing author and original location,
  preserve canonical deep links/export, and offer authorized append-only undo.
  Main timeline, inline thread and side panel must use one presentation graph.
- Run expensive signature/projection work off the UI thread or in bounded
  cancellable chunks, retaining scope/generation fences. The pure function is
  synchronous and is not a reason to verify thousands of signatures during a
  React render. Do not optimize by trusting mutable cached-verified symbols.
- Apply Astra's existing Smart/Expanded/Collapsed and saved manual-choice
  precedence after projection. Shared annotations do not contain disclosure
  flags or change read receipts/status. Preserve explicit collapsed choices
  across any per-root storage migration, navigation and restarts.
- A worklog record remains keyed by its canonical source event ID. Annotation
  IDs are revision provenance, not new tasks. The collector must classify
  these messages as control annotations and retain no raw bodies.

Test kind9 admission and undo/conflict/readback on an isolated channel first.
Then exercise main timeline, inline and side-panel rendering, canonical sends,
counts, unread, edits/deletions, cold history, reconnect and restart. Verify
the fork UI only after root reviews the DM mapping. Keep the PR draft until
the repository's agent exercise and human test requirements are satisfied.
