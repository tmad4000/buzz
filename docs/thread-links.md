# Thread organization annotations (v1)

This branch includes the strict parser, pure presentation projector and a scoped
GCP publisher CLI. It does **not connect the overlay to the desktop UI**. No
messages have been moved by this PR; relay admission and real client behavior
still require independently reviewed private-channel smoke testing before DM use.

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
  "content": "Thread organization: one prior message reorganized. Original signed messages unchanged.",
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

## Scoped CLI

The executable is `scripts/ideaflow/thread-links`. The bridge may dispatch
`buzz-paseo thread` to this executable after review; this PR does not change the
live bridge dispatcher. All stdout is JSON; stderr contains fixed error codes.
`--help` reads no key and makes no network request.

```text
scripts/ideaflow/thread-links link CHILD --parent PARENT --dry-run --out PLAN.json
scripts/ideaflow/thread-links unlink CHILD --dry-run --out UNDO.json
scripts/ideaflow/thread-links plan --operations OPS.json --out PLAN.json
scripts/ideaflow/thread-links apply PLAN.json --expected-digest SHA256
scripts/ideaflow/thread-links verify PLAN.json --expected-digest SHA256
```

`OPS.json` is an owned, regular, single-link 0600 file containing an explicit
array; it does not infer relationships or ingest chat bodies:

```json
[{
  "operation": "link",
  "childEventId": "CHILD_EVENT_ID",
  "parentEventId": "PARENT_EVENT_ID",
  "confidence": "explicit"
}]
```

Use `operation: unlink` with `parentEventId: null` for append-only undo. It
restores the canonical native parent. A plan refuses no-op operations, duplicate
children, cycles, incomplete closure and invalid canonical roots. Cross-author
rows are `proposal-only`, contain no signed event bytes, and cannot be applied.

Dry runs authenticate reads against the fixed existing community, verify signed
channel metadata/roster, complete bounded message and annotation history, then
run the production parser/projector. Plans contain IDs, graph metadata and the
new annotation's literal receipt only; source message bodies stay in memory.
Event IDs are Nostr hashes of the original signed fields. The exact signed
annotation bytes and ID are frozen in the dry-run plan, before review. Applying
never signs a replacement annotation. Review binds SHA256 of the exact canonical
UTF8 plan file bytes, including its final newline. `--out` creates a new 0600
file exclusively and refuses to overwrite an existing file.

The default scope is the verified Jacob/Paseo DM
`ad66b837-7232-4fa0-b41f-cbc49d415b0b`, with its exact two expected pubkeys.
The only other permitted scope is a parent-created, pre-authorized, private,
Paseo-owned smoke channel registered at the fixed task-local file
`/home/dev/code/buzz-worklog-20261116/thread-link-smoke-scope.json`:

```json
{
  "version": 1,
  "channelId": "FRESH_PRIVATE_CHANNEL_UUID",
  "creatorEventId": "SIGNED_CREATE_EVENT_ID",
  "ownerPubkey": "38ba46f41d56ff5c71cfbfb856d00b209e6216a218260d2a30c4f1b712bdd1cb",
  "purpose": "thread-link-smoke",
  "expiresAt": 0
}
```

The registration must be owned, regular, single-link 0600 with an actual future
UTC expiry no more than seven days away. Its digest is bound into plan/journal.
The signed creation event, current private metadata, sole-owner membership,
creator and non-archived status must agree. Registration records a concrete
already-authorized test scope; it does not authorize arbitrary channels. Do not
unarchive old tests. No endpoint, key, content, arbitrary-event or state-directory
override is exposed. The existing 0600 Paseo key is read in place on GCP only;
NIP-98 binds the fixed endpoint, method, fresh nonce and POST payload hash.

## Apply, retry and recovery

Before every submission, apply rechecks current scope/membership, tool source
fingerprint, original IDs/canonical closure, unchanged snapshot and expected
annotation head. Relay acceptance is distinct from deterministic projector
selection: the relay offers no atomic compare-and-swap. A concurrent same-head
winner may leave this operation accepted but not selected. Output reports both
facts and always reports `uiVerified: false`; publisher success proves no UI work.

The private journal lives at `~/.local/state/buzz-thread-links/PLAN_SHA256`.
Its directory is 0700 and journal files are 0600. A global writer lock serializes
plans. Before any POST, an atomically renamed, file-and-directory-fsynced journal
contains the exact reviewed plan bytes and **all** exact signed annotation bytes
and IDs. A second durable marker records the particular attempt before POST.
Original message bodies are never journaled. Preserve this journal after errors.

There are no automatic retries. Repeat `apply` with the same exact plan/digest
after an uncertain timeout: it first reads the saved ID, then either verifies it
or explicitly resubmits the same saved bytes/ID while still valid. It never
creates a duplicate ID by signing again. Another plan for the same child is
blocked while an earlier intent is submitting/uncertain, and an accepted prior
intent must appear in the new plan's verified annotation history. A known
verified event that disappears is not automatically resurrected.

Signed annotations expire operationally after 15 minutes. An expired/uncertain
operation is never silently refreshed or adopted under a new tool hash. A parent
may generate a fresh **unsubmitted** plan and operationally revalidate the same
approved semantic mapping against unchanged original hashes and heads. Pure
timestamp refresh of the already-approved mapping requires no new Jacob approval.
Changed mapping, source or head requires root review. Submitted/uncertain intents
remain bound to the saved bytes/IDs; retain the receipt and resolve with root.

A stale lock is not automatically broken. Inspect its PID, `/proc` start identity
and owner token, establish that no task-owned writer remains, and obtain an
operational recovery review before removing only that task lock. Never remove a
live/foreign owner's lock or clear a journal to force a retry. `verify` is
read-only and reports presence, selected heads, unchanged reviewed originals and
tool fingerprint match. It can inspect old plans without rewriting their state.

Parent review must precede private-channel publication. Test link, exact readback,
conflict and unlink on a fresh own/private channel first. DM application also
requires the reviewed mapping and completed union-loader/UI tests. This tool
neither changes read frontiers/collapse preferences nor claims desktop visibility.

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
