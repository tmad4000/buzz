# Forward to agent (.9 opt-in candidate)

Jacob asked in Buzz P2 at 05:50Z on 2026-11-18 for one-click sends to another orchestrator lane, alongside Send to thread. Root chose two reversible defaults rather than recursive tiers: Paseo DM → P2 (later), and P2 → Paseo DM (now), with a picker for the existing Direct agents rows. This is a separate feature/PR stacked on Direct Agents PR81; it does not change PR81 or rename P2.

Enable **Settings → Appearance → Preferences → Forward to agent** on this device. It defaults off. A delivered message's hover/focus action rail then offers a one-click forward icon for the unambiguous Paseo DM/P2 pair, plus **Forward to agent ▸** for the picker. Icon controls have accessible labels and titles; the action rail remains visible while the picker is open. Only ordinary text-message sources (existing kinds9/40002) are admitted. Pending/system/reaction-only sources are excluded.

## Destinations and default safety

The picker reads the sidebar's persisted section view without creating a second sync writer. Membership and section deletion/rename are preserved. Jacob's recipient-encrypted bundled defaults supply only the section's stable identity, so an edited section label still works; membership always comes from the current view. Other users can use a section named Direct agents. No private channel IDs or keys are hardcoded or copied into source.

Rows must be joined, unarchived DM/stream channels. Forums and the source itself are excluded. Exactly one identifiable agent recipient is required: the known-agent roster, or the single peer of a two-member lane. Ambiguous rows remain visible but disabled. Runtime cards from PR81 optionally supply host chips when that device's runtime-card opt-in is also enabled; cards never turn an agent session UUID into a channel/thread ID.

The one-click DM/P2 defaults additionally require the existing Paseo and Paseo P2/P2 labels, private visibility, exactly two matching members and exactly one opposite lane. Ambiguity, renaming or changed membership removes the shortcut; the explicit picker remains available. No P3 is created. This is a button caption, not a channel rename or priority-contract change.

Opening the picker refreshes its section snapshot. Selecting any destination re-reads current section membership before capture. The relay's existing authorization remains the final membership/write gate. The picker shares a scope-keyed query; disabled forwarding does not mount its queries or signer hooks.

## Publication and source receipt

The action quotes every line of the selected body, includes a readable original-author attribution, and adds the canonical fork message backlink with source channel/event/thread IDs. It does not copy source mention recipients or change/delete/reparent the original. The outgoing target message is an ordinary kind9 message signed by the active user's own client identity. The chosen lane's agent gets an explicit recipient p-tag, including on stream targets, so existing bridge routing applies.

Send-to-thread owner af293993 confirmed the reusable seam: `useSendMessageMutation(channel, identity).mutateAsync(...)`, which returns the target acknowledgement. This feature captures the full target channel, signer and relay; it never calls the composer's private submit method, clears its draft, or overloads `sentFromThreadRootId`. A small additive `expectedScope` argument forces the existing native HTTP path and forwards the already-supported expected relay/signer arguments. A changed native identity/community fails closed. Existing unscoped composer and outbox behavior is preserved.

Scoped action sends skip optimistic cache projection and global timeout-state writes. On ACK they only mark the captured QueryClient's target message/window queries stale, without refetch side effects. `CommunityQueryProvider` is keyed by community/reinitialization/signer/signer epoch, so an old action cannot mutate the replacement cache. Late ACKs save their captured receipt but do not toast/update a replacement view.

Only after acknowledgement does the original show **Forwarded to P2 ↗** (or the chosen lane's name). It opens the exact acknowledged target event. The marker is a device-local navigation receipt, scoped by relay and signer; it is not a public edit, a reaction or cross-device synced read state. It never changes exact-observed receipts, archive, follow-up, thread state or completion.

Concurrent/repeated clicks for the same source/destination/content share one send/receipt. A SHA-256 fingerprint distinguishes edited source text, so forwarding an edit creates a new target message. If publication succeeds but receipt storage fails, the acknowledged ID remains in memory and selecting that target again retries only receipt storage. History is bounded to the latest1000 records per scope. A process crash or ambiguous network failure before the ACK is received cannot prove delivery; inspect the target before retrying. This direct message action does not create an offline outbox entry.

## Verification and release gates

Focused tests bind the production model, shared mutation callbacks, action callbacks, preference and receipt store: defaults, scope fences, target revalidation, quote/backlink, signed-recipient capture, default-OFF behavior, late ACKs, receipt-only retry, edited-text forwarding and target-marker navigation. Existing routing and DM-recipient tests run alongside them. TypeScript and changed-file Biome/diff checks accompany those tests.

All test processes use setsid-equivalent `start_new_session=True`, bounded deadlines and TERM/KILL process-group cleanup. No heavy browser/native/Tauri/cargo builds, M5 access, live Buzz forward, dependency/lock/version changes or deployment occurred. Native layout/keyboard/handler/actual-relay and human acceptance remain release-captain scoped. Independent Sol source review is requested through root for the separate draft PR.

Acceptance in the captain's approved slot: enable the switch; forward a message DM→P2 and P2→DM; verify Jacob's signature/normal routing, exact quote/backlink and clickable source marker after ACK. Try another Direct agents row with a card; verify the host chip and agent recipient. Confirm opening/dismissing never sends; archived/removed/ambiguous lanes cannot send; source drafts remain intact; duplicate clicks and receipt failures do not resend; account/community switches cannot redirect late work. Disable the flag and confirm all forward actions/markers disappear. P2's actual name stays unchanged.
