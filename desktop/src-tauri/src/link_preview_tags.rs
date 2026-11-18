use nostr::Tag;
use std::collections::HashSet;

const MAX_SNAPSHOTS: usize = 8;
const MAX_TITLE: usize = 300;
const MAX_SITE: usize = 100;
const MAX_DESCRIPTION: usize = 1000;

fn valid_text(value: &str, max: usize, allow_newlines: bool) -> bool {
    value.len() <= max
        && !value
            .chars()
            .any(|character| character.is_control() && !(allow_newlines && character == '\n'))
}

fn valid_sha256(value: &str) -> bool {
    value.len() == 64 && value.chars().all(|c| matches!(c, '0'..='9' | 'a'..='f'))
}

fn valid_media_pair(url: &str, hash: &str, relay_base: &url::Url) -> bool {
    if url.is_empty() && hash.is_empty() {
        return true;
    }
    if url.is_empty() || !valid_sha256(hash) {
        return false;
    }
    let Ok(parsed) = url::Url::parse(url) else {
        return false;
    };
    if parsed.origin() != relay_base.origin()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
    {
        return false;
    }
    let Some(filename) = parsed.path().strip_prefix("/media/") else {
        return false;
    };
    if filename.contains('/') || filename.contains('%') {
        return false;
    }
    let Some((path_hash, ext)) = filename.split_once('.') else {
        return false;
    };
    path_hash == hash && valid_sha256(path_hash) && matches!(ext, "jpg" | "png" | "gif" | "webp")
}

pub fn append(
    preview_tags: &[Vec<String>],
    relay_base: &str,
    content: &str,
    tags: &mut Vec<Tag>,
) -> Result<(), String> {
    if preview_tags.len() > MAX_SNAPSHOTS {
        return Err(format!(
            "too many link preview snapshots (max {MAX_SNAPSHOTS})"
        ));
    }
    let base = url::Url::parse(relay_base).map_err(|_| "invalid relay base URL")?;
    let mut seen = HashSet::new();
    for (index, preview_tag) in preview_tags.iter().enumerate() {
        if preview_tag.as_slice() == ["link-preview", "none"] {
            if preview_tags.len() != 1 {
                return Err("link-preview suppression cannot include snapshots".into());
            }
            tags.push(
                Tag::parse(["link-preview", "none"])
                    .map_err(|e| format!("invalid link-preview tag: {e}"))?,
            );
            continue;
        }
        // Preview metadata is optional. URL serialization can add a slash or
        // change case/encoding, while the relay requires a literal body match.
        if preview_tag.len() == 11
            && preview_tag[0] == "link-preview"
            && preview_tag[1] == "snapshot"
            && preview_tag[2] == "1"
        {
            let canonical = &preview_tag[3];
            let reason = if !url::Url::parse(canonical).is_ok_and(|url| {
                url.scheme() == "https"
                    && url.username().is_empty()
                    && url.password().is_none()
                    && url.fragment().is_none()
            }) {
                Some("invalid_canonical_url")
            } else if !content.contains(canonical) {
                Some("canonical_not_in_content")
            } else if !seen.insert(canonical.clone()) {
                Some("duplicate_canonical_url")
            } else {
                None
            };
            if let Some(reason) = reason {
                eprintln!(
                    "{}",
                    serde_json::json!({
                        "event": "link_preview_omitted", "tag_index": index,
                        "reason": reason, "tag": diagnostic(preview_tag),
                    })
                );
                continue;
            }
        }
        let valid = preview_tag.len() == 11
            && preview_tag[0] == "link-preview"
            && preview_tag[1] == "snapshot"
            && preview_tag[2] == "1"
            && valid_text(&preview_tag[4], MAX_TITLE, false)
            && valid_text(&preview_tag[5], MAX_SITE, false)
            && valid_text(&preview_tag[6], MAX_DESCRIPTION, true)
            && valid_media_pair(&preview_tag[7], &preview_tag[8], &base)
            && valid_media_pair(&preview_tag[9], &preview_tag[10], &base);
        if !valid {
            return Err("invalid link-preview snapshot tag".into());
        }
        let parts: Vec<&str> = preview_tag.iter().map(String::as_str).collect();
        tags.push(Tag::parse(parts).map_err(|e| format!("invalid link-preview tag: {e}"))?);
    }
    Ok(())
}

/// Redacted tag shape for local diagnostics; never include body or URL secrets.
pub fn diagnostic(tag: &[String]) -> serde_json::Value {
    let canonical = tag.get(3).and_then(|value| url::Url::parse(value).ok());
    serde_json::json!({
        "field_bytes": tag.iter().map(String::len).collect::<Vec<_>>(),
        "canonical_origin": canonical.map(|url| url.origin().ascii_serialization()),
    })
}

/// Structured HTTP rejection context, limited to signed ID and redacted previews.
pub fn rejection_diagnostic(event: &nostr::Event, status: u16, error: &str) -> serde_json::Value {
    let previews: Vec<_> = event
        .tags
        .iter()
        .enumerate()
        .filter(|(_, tag)| tag.as_slice().first().map(String::as_str) == Some("link-preview"))
        .map(|(index, tag)| {
            serde_json::json!({
                "tag_index": index, "tag": diagnostic(tag.as_slice()),
            })
        })
        .collect();
    serde_json::json!({
        "event": "relay_event_rejected", "event_id": event.id.to_hex(),
        "status": status, "link_preview_tags": previews,
        "reason": if error.contains("invalid link-preview canonical URL") {
            "invalid_link_preview_canonical_url"
        } else { "relay_client_error" },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const HASH: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const BASE: &str = "https://relay.example";

    fn tag(image_url: &str, image_hash: &str) -> Vec<String> {
        [
            "link-preview",
            "snapshot",
            "1",
            "https://linear.app/acme/issue/ABC-123/example",
            "Example",
            "Linear",
            "Description",
            image_url,
            image_hash,
            "",
            "",
        ]
        .map(str::to_string)
        .to_vec()
    }

    #[test]
    fn canonical_mismatch_drops_only_preview_and_preserves_message_tags() {
        let content = "<https://humanityinfrastructure.com> <https://x.com/kevinrose/status/2122394902168473975>";
        let mut humanity = tag("", "");
        humanity[3] = "https://humanityinfrastructure.com/".into();
        let mut x = tag("", "");
        x[3] = "https://x.com/kevinrose/status/2122394902168473975".into();
        let existing = Tag::parse(["h", "channel"]).unwrap();
        let mut tags = vec![existing.clone()];
        append(&[humanity, x.clone()], BASE, content, &mut tags).unwrap();
        assert_eq!(tags.len(), 2);
        assert_eq!(tags[0], existing);
        assert_eq!(tags[1].as_slice(), x.as_slice());
    }

    #[test]
    fn canonical_rules_omit_invalid_or_absent_urls_without_failing_send() {
        for canonical in [
            "http://example.com/",
            "https://user:password@example.com/",
            "https://example.com/#fragment",
            "[example](https://example.com/)",
            "not a URL",
            "https://example.com/redirected",
        ] {
            let mut preview = tag("", "");
            preview[3] = canonical.into();
            let mut tags = Vec::new();
            append(&[preview], BASE, "https://example.com/", &mut tags).unwrap();
            assert!(tags.is_empty(), "{canonical}");
        }
    }

    #[test]
    fn markdown_and_angle_wrappers_allow_exact_canonical_and_duplicates_are_omitted() {
        let preview = tag("", "");
        let canonical = &preview[3];
        for content in [format!("[label]({canonical})"), format!("<{canonical}>")] {
            let mut tags = Vec::new();
            append(
                &[preview.clone(), preview.clone()],
                BASE,
                &content,
                &mut tags,
            )
            .unwrap();
            assert_eq!(tags.len(), 1);
        }
    }

    #[test]
    fn diagnostics_redact_url_credentials_query_fragment_and_text() {
        let mut preview = tag("", "");
        preview[3] = "https://user:password@example.com/private?token=secret#secret".into();
        let diagnostic = diagnostic(&preview);
        assert_eq!(diagnostic["canonical_origin"], "https://example.com");
        let serialized = diagnostic.to_string();
        for secret in ["password", "secret", "private", "Example", "Description"] {
            assert!(!serialized.contains(secret));
        }
    }

    #[test]
    fn rejection_record_has_signed_id_status_tag_index_and_safe_reason() {
        let keys = nostr::Keys::parse(&"1".repeat(64)).unwrap();
        let preview = Tag::parse(tag("", "")).unwrap();
        let event = nostr::EventBuilder::text_note("private message body")
            .tags([Tag::parse(["h", "channel"]).unwrap(), preview])
            .sign_with_keys(&keys)
            .unwrap();
        let record = rejection_diagnostic(&event, 400, "invalid link-preview canonical URL");
        assert_eq!(record["event_id"], event.id.to_hex());
        assert_eq!(record["status"], 400);
        assert_eq!(record["link_preview_tags"][0]["tag_index"], 1);
        assert_eq!(record["reason"], "invalid_link_preview_canonical_url");
        assert!(!record.to_string().contains("private message body"));
        assert!(!record.to_string().contains(&event.sig.to_string()));
        assert_eq!(
            rejection_diagnostic(&event, 403, "untrusted secret response")["reason"],
            "relay_client_error"
        );
    }

    #[test]
    fn append_accepts_complete_local_snapshot() {
        let mut tags = Vec::new();
        append(
            &[tag(&format!("{BASE}/media/{HASH}.png"), HASH)],
            BASE,
            "https://linear.app/acme/issue/ABC-123/example",
            &mut tags,
        )
        .unwrap();
        assert_eq!(tags.len(), 1);
    }

    #[test]
    fn append_accepts_blanket_suppression_by_itself() {
        let mut tags = Vec::new();
        append(
            &[vec!["link-preview".into(), "none".into()]],
            BASE,
            "https://linear.app/acme/issue/ABC-123/example",
            &mut tags,
        )
        .unwrap();
        assert_eq!(tags[0].as_slice(), ["link-preview", "none"]);
        assert!(append(
            &[vec!["link-preview".into(), "none".into()], tag("", ""),],
            BASE,
            "https://linear.app/acme/issue/ABC-123/example",
            &mut Vec::new(),
        )
        .is_err());
    }

    #[test]
    fn append_accepts_description_newlines() {
        let mut preview_tag = tag("", "");
        preview_tag[6] = "First paragraph\n\nSecond paragraph".into();
        assert!(append(
            &[preview_tag],
            BASE,
            "https://linear.app/acme/issue/ABC-123/example",
            &mut Vec::new()
        )
        .is_ok());
    }

    #[test]
    fn append_rejects_other_control_characters() {
        let mut preview_tag = tag("", "");
        preview_tag[6] = "Unsafe\tdescription".into();
        assert!(append(
            &[preview_tag],
            BASE,
            "https://linear.app/acme/issue/ABC-123/example",
            &mut Vec::new()
        )
        .is_err());
    }

    #[test]
    fn append_rejects_untrusted_or_malformed_snapshot_media() {
        for url in [
            format!("https://evil.example/media/{HASH}.png"),
            format!("{BASE}/media/{HASH}.png?token=leak"),
            format!("{BASE}/media/{HASH}.png#fragment"),
            format!("https://user@relay.example/media/{HASH}.png"),
            format!("{BASE}/media/{HASH}.svg"),
            format!("{BASE}/media/{HASH}.png/extra"),
        ] {
            assert!(
                append(
                    &[tag(&url, HASH)],
                    BASE,
                    "https://linear.app/acme/issue/ABC-123/example",
                    &mut Vec::new()
                )
                .is_err(),
                "{url}"
            );
        }
        assert!(append(
            &[tag(&format!("{BASE}/media/{HASH}.png"), &"b".repeat(64))],
            BASE,
            "https://linear.app/acme/issue/ABC-123/example",
            &mut Vec::new(),
        )
        .is_err());
    }
}
