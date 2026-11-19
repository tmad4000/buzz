use nostr::Tag;

/// Same-channel provenance only. This path cannot add h/e/p tags or change audience.
pub(super) fn validated_origin(
    origin: Option<&[String]>,
    channel_id: &str,
    has_parent: bool,
    kind: u32,
) -> Result<Option<Tag>, String> {
    let Some(origin) = origin else {
        return Ok(None);
    };
    if origin.len() != 3
        || origin[0] != "origin"
        || origin[1] != channel_id
        || origin[2] != "main"
        || !has_parent
        || kind != buzz_core_pkg::kind::KIND_STREAM_MESSAGE
    {
        return Err(
            "dispatch origin must name this stream reply's channel and main composer".into(),
        );
    }
    Tag::parse(origin.iter().map(String::as_str).collect::<Vec<_>>())
        .map(Some)
        .map_err(|error| format!("invalid dispatch origin: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn same_channel_reply_only() {
        let tag = vec!["origin".into(), "channel".into(), "main".into()];
        assert!(validated_origin(Some(&tag), "channel", true, 9)
            .unwrap()
            .is_some());
        assert!(validated_origin(Some(&tag), "other", true, 9).is_err());
        assert!(validated_origin(Some(&tag), "channel", false, 9).is_err());
        assert!(validated_origin(Some(&tag), "channel", true, 40003).is_err());
        assert!(validated_origin(
            Some(&["h".into(), "channel".into(), "main".into()]),
            "channel",
            true,
            9
        )
        .is_err());
        assert!(validated_origin(None, "channel", false, 9)
            .unwrap()
            .is_none());
    }
}
