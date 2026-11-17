//! Shared HTML Page validation and strict membership authorization.
use crate::state::AppState;
use buzz_core::{
    kind::{event_kind_u32, KIND_CHANNEL_PAGE},
    tenant::TenantContext,
};
use nostr::Event;
use uuid::Uuid;

/// Validate the Page slot and choose its decoded UTF-8 content ceiling.
pub(crate) fn content_limit(event: &Event) -> Result<usize, String> {
    if event_kind_u32(event) != KIND_CHANNEL_PAGE {
        return Ok(256 * 1024);
    }
    let slots: Vec<_> = event
        .tags
        .iter()
        .filter(|t| t.as_slice().first().map(String::as_str) == Some("d"))
        .collect();
    if slots.len() != 1
        || slots[0].as_slice().len() != 2
        || slots[0].as_slice().get(1).map(String::as_str) != Some("page")
    {
        return Err("invalid: Page requires one d=page tag".into());
    }
    Ok(512 * 1024)
}

/// Unlike ordinary open-channel posting, replacing a Page requires actual membership.
pub(crate) async fn check_membership(
    tenant: &TenantContext,
    state: &AppState,
    channel: Uuid,
    pubkey: &[u8],
) -> Result<(), String> {
    match state
        .is_member_cached(tenant.community(), channel, pubkey)
        .await
    {
        Ok(true) => Ok(()),
        Ok(false) => Err("restricted: not a channel member".into()),
        Err(e) => Err(format!("error: database error: {e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use nostr::{EventBuilder, Keys, Kind, Tag};
    #[test]
    fn page_slot_and_content_ceiling() {
        let keys = Keys::generate();
        let event = |tags: Vec<Tag>| {
            EventBuilder::new(Kind::Custom(KIND_CHANNEL_PAGE as u16), "")
                .tags(tags)
                .sign_with_keys(&keys)
                .unwrap()
        };
        assert!(content_limit(&event(vec![])).is_err());
        assert!(content_limit(&event(vec![Tag::parse(["d", "other"]).unwrap()])).is_err());
        assert!(content_limit(&event(vec![
            Tag::parse(["d", "page"]).unwrap(),
            Tag::parse(["d", "other"]).unwrap()
        ]))
        .is_err());
        assert_eq!(
            content_limit(&event(vec![Tag::parse(["d", "page"]).unwrap()])).unwrap(),
            524288
        );
        let ordinary = EventBuilder::new(Kind::Custom(40002), "")
            .sign_with_keys(&keys)
            .unwrap();
        assert_eq!(content_limit(&ordinary).unwrap(), 262144);
    }
    #[tokio::test]
    async fn page_membership_gate_rejects_nonmembers_and_isolates_community() {
        let state = crate::state::tests::test_state().await;
        let community = buzz_core::CommunityId::from_uuid(Uuid::new_v4());
        let tenant = TenantContext::resolved(community, "page.test");
        let channel = Uuid::new_v4();
        let key = vec![1; 32];
        state
            .membership_cache
            .insert((community, channel, key.clone()), false);
        assert!(check_membership(&tenant, &state, channel, &key)
            .await
            .unwrap_err()
            .contains("not a channel member"));
        state
            .membership_cache
            .insert((community, channel, key.clone()), true);
        assert!(check_membership(&tenant, &state, channel, &key)
            .await
            .is_ok());
        let other = buzz_core::CommunityId::from_uuid(Uuid::new_v4());
        state
            .membership_cache
            .insert((other, channel, key.clone()), false);
        assert!(check_membership(
            &TenantContext::resolved(other, "other.test"),
            &state,
            channel,
            &key
        )
        .await
        .is_err());
    }
}
