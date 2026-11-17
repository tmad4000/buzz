# Mobile Inbox and channel search

The existing Activity destination is now labelled **Inbox**. Its feed sources, unread/read state, filters and personal triage remain unchanged. This label does not introduce shared task states or claim parity with the proposed desktop Needs you / Open threads design. An unread item, explicit action request and resolved conversation remain distinct.

Every channel header offers **Search this channel**. It opens an independent search route with a visible channel scope. The relay message query includes the channel's `#h` filter; unrelated channel results are also excluded before display. **All channels** reruns the current query across the selected community and restores people/channel discovery. The global Search tab retains its independent state.

Each open channel-search route owns its state, including when two routes refer to the same channel. Debounced work is cancelled and in-flight results/errors are invalidated by request generation across query, scope, community/identity changes and disposal. The existing transport has no request-abort API; stale completions are ignored rather than claimed cancelled at the wire. A community/identity change clears query, results and old channel scope.

Message-search failure is visibly unavailable, not a successful empty result. Manual **Retry messages** retains query, channel scope and any successful directory results, prevents concurrent/automatic retries, and clears the failure only after a successful message read. Technical transport details are not rendered in the product.

Stream results navigate to the exact message and canonical thread root, using the existing NIP-10 parser and channel deep-link hydration. Forum comments open their parent post; the current forum page has no exact-comment scroll/highlight API, and a comment missing its thread reference fails visibly. Broadcast replies open at channel level. Opening a result does not create shared task status.

## Remaining Inbox coverage

The current feed fetches explicitly addressed `p`-tag events and recent member-DM traffic. Its Threads filter classifies items already in that feed; it is not a separate complete participated/followed-thread source. Native replies carry `e` thread tags; `p` tags are explicit mentions. Consequently, an unmentioned reply in a non-DM thread can be absent even when its channel unread badge is correct.

Existing reusable interest state is available in `channels_provider.dart` (`buzz-thread-participation.v1` / `buzz-thread-authored.v1`, recorded from caught-up and live self messages) and `thread_follows/thread_follows_provider.dart` (already used by unread badges). A follow-up should consume those existing stores, resolve roots to current-member channels, and issue bounded paired `#h` + `#e` reply queries/subscriptions. Unknown/unavailable roots and bounded coverage need honest partial/loading states. Do not add another follow store, infer obligations from emoji, or turn personal Done into shared resolution.

This change is based on PR6 source `def5d37ec682158d79b101698ff077ed57fd0a54` for the next mobile candidate. TestFlight 0.1.0 (1), built from `19a2b2709a0543aadeaee7f604032367665a1bf5`, is unchanged. Mobile standards PR13 remains a separate integration input, including shared relative-time behavior and app metadata; it is not silently included here. Native iOS/device exercise and human verification remain required before marking the draft ready.
