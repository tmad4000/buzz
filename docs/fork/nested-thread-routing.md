# Nested thread routing (.9)

`Send to thread…` is available beside Send in channel/DM main composers and now in side-panel and inline thread reply composers. In a thread, the picker uses the same local keyword, recency and participant scoring over loaded descendant replies only. It shows up to three choices plus `Reply to thread root`. Missing ancestry, foreign branches, system events and pending messages are not destinations. There are no model calls or new relay kinds.

Opening, dismissing or restoring a picker does not publish. Selecting a descendant sends the current draft through the existing mention/media/durable-outbox pipeline, with that message as the reply parent and the thread's canonical root retained. Selecting `Reply to thread root` replies to the currently displayed thread head; ordinary Send retains the existing reply banner behavior. Choosing a destination does not navigate or change another pane's reply target, expansion or draft.

The picker is transient within the existing owner-only composer. Draft keys, takeover guards, synchronous send locks, per-surface `localSendOrigin`, attachment handling and outbox admission/recovery are unchanged. Ownership loss rejects retained submit callbacks. Root fallback cannot publish a pending/synthetic thread head.

## Validation and acceptance

Automated checks bind the production ranking/target resolution, real submit callback, mounted picker/ownership handler, existing mention/outbox pipeline and browser composers. Browser checks use the mock Tauri bridge and sandboxed Linux Chrome; they inspect actual queued signed-event payloads for NIP-10 root/reply tags. These checks do not verify native IPC, a live relay, Apple behavior or human acceptance.

Manual acceptance: open a channel or DM thread with several nested replies. Type a draft matching a deep reply, open the picker and dismiss with Escape: no message should appear and the draft remains. Reopen and select the deep reply: one reply should appear under that message with the original canonical root. Repeat in an inline composer while an independent side-panel draft is present; the side-panel draft and selection must remain unchanged. Choose `Reply to thread root` to send to the displayed head. Test attachment admission/failure recovery and draft takeover with the release captain before readiness.

Independent Sol source review and captain-owned native/human/release acceptance remain separate gates. This additive change starts from `buzz-ideaflow-v0.5.28-ideaflow.8` (`16fa57dfc97f115d00382fcb75128295b5fb3def`); other .9 features are not composed here.
