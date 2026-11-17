use nostr::{Event, PublicKey, Tag};

/// Stable logical identity survives signature expiry without changing intent.
pub(super) fn outbox_tags(client_id: &str, intended_at: u64) -> Result<Vec<Tag>, String> {
    uuid::Uuid::parse_str(client_id).map_err(|_| "invalid queued client_message_id".to_string())?;
    let written_at = intended_at.to_string();
    [
        Tag::parse(["client_msg_id", client_id]),
        Tag::parse(["client_written_at", &written_at]),
    ]
    .into_iter()
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())
}

/// Match only verified versions that this journal could actually have sent.
pub(super) fn matches_queued_event(
    event: &Event,
    signer: PublicKey,
    channel: &str,
    client_id: &str,
    ids: &[String],
) -> Result<bool, String> {
    event
        .verify()
        .map_err(|e| format!("invalid outbox lookup event: {e}"))?;
    let has = |key: &str, value: &str| {
        event.tags.iter().any(|tag| {
            let parts = tag.as_slice();
            parts.len() == 2 && parts[0] == key && parts[1] == value
        })
    };
    Ok(ids.contains(&event.id.to_hex())
        && event.pubkey == signer
        && event.kind.as_u16() == 9
        && has("h", channel)
        && has("client_msg_id", client_id))
}

/// Moderator deletions may have another author and need not carry an h tag.
pub(super) fn matches_deletion_receipt(event: &Event, ids: &[String]) -> Result<bool, String> {
    event
        .verify()
        .map_err(|e| format!("invalid outbox deletion receipt: {e}"))?;
    Ok(matches!(event.kind.as_u16(), 5 | 9005)
        && event.tags.iter().any(|tag| {
            let parts = tag.as_slice();
            parts.len() >= 2 && parts[0] == "e" && ids.contains(&parts[1])
        }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use nostr::{EventBuilder, Keys, Kind, Timestamp};
    const CLIENT: &str = "3ee12149-838f-457b-a681-63dd9d0c984e";
    const CHANNEL: &str = "11fba43a-e0ba-4534-882c-6b758aa14874";
    fn signed(keys: &Keys, at: u64) -> Event {
        EventBuilder::new(Kind::Custom(9), "same content")
            .tags([Tag::parse(["h", CHANNEL]).unwrap()])
            .tags(outbox_tags(CLIENT, 10).unwrap())
            .custom_created_at(Timestamp::from(at))
            .sign_with_keys(keys)
            .unwrap()
    }
    #[test]
    fn desktop_outbox_resigning_keeps_client_identity_content_destination_and_written_time() {
        let keys = Keys::generate();
        let old = signed(&keys, 10);
        let fresh = signed(&keys, 10_000);
        assert_ne!(old.id, fresh.id);
        assert_ne!(old.sig, fresh.sig);
        assert_eq!(old.tags, fresh.tags);
        assert_eq!(old.content, fresh.content);
        assert!(outbox_tags("not-a-uuid", 10).is_err());
    }
    #[test]
    fn desktop_outbox_lookup_requires_signature_author_channel_stable_id_and_known_version() {
        let keys = Keys::generate();
        let event = signed(&keys, 10);
        let ids = vec![event.id.to_hex()];
        assert!(matches_queued_event(&event, keys.public_key(), CHANNEL, CLIENT, &ids).unwrap());
        assert!(!matches_queued_event(
            &event,
            Keys::generate().public_key(),
            CHANNEL,
            CLIENT,
            &ids
        )
        .unwrap());
        assert!(!matches_queued_event(&event, keys.public_key(), "wrong", CLIENT, &ids).unwrap());
        assert!(!matches_queued_event(&event, keys.public_key(), CHANNEL, "wrong", &ids).unwrap());
        assert!(!matches_queued_event(&event, keys.public_key(), CHANNEL, CLIENT, &[]).unwrap());
        let mut forged = event.clone();
        forged.content = "forged".into();
        assert!(matches_queued_event(&forged, keys.public_key(), CHANNEL, CLIENT, &ids).is_err());
    }
    #[test]
    fn desktop_outbox_accepts_exact_standard_and_moderator_deletion_receipts() {
        let id = "a".repeat(64);
        let ids = vec![id.clone()];
        let keys = Keys::generate();
        for kind in [5, 9005] {
            let event = EventBuilder::new(Kind::Custom(kind), "deleted")
                .tags([Tag::parse(["e", &id]).unwrap()])
                .sign_with_keys(&keys)
                .unwrap();
            assert!(matches_deletion_receipt(&event, &ids).unwrap());
            assert!(!matches_deletion_receipt(&event, &[]).unwrap());
        }
        assert!(!matches_deletion_receipt(&signed(&keys, 10), &ids).unwrap());
    }
}
