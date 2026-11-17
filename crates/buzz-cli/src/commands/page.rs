//! Channel HTML Pages over the hosted relay's existing channel-scoped pin kind.
use crate::{
    client::{normalize_write_response, BuzzClient},
    error::CliError,
    validate::parse_uuid,
    PageCmd,
};
use nostr::{Event, EventBuilder, Kind, Tag, Timestamp};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashSet;

const KIND: u16 = 40004;
const SLOT: &str = "buzz-page:page";
const ANCHOR: &str = "b54af358b595b466bdb36d30cc7f2d32385aaeb5731674dc557a030c234ea7d1";
const MAX_BYTES: usize = 512 * 1024;
const CHUNK_BYTES: usize = 24 * 1024;
const MAX_CHUNKS: usize = 24;

#[derive(Serialize, Deserialize)]
struct Manifest {
    #[serde(rename = "type")]
    marker: String,
    version: u8,
    page: String,
    publication: String,
    chunks: Vec<String>,
    bytes: usize,
}
#[derive(Serialize, Deserialize)]
struct Chunk {
    #[serde(rename = "type")]
    marker: String,
    version: u8,
    page: String,
    publication: String,
    index: usize,
    html: String,
}
fn failure(message: impl Into<String>) -> CliError {
    CliError::Other(message.into())
}
fn has_tag(event: &Event, key: &str, value: &str) -> bool {
    event.tags.iter().any(|tag| {
        tag.as_slice().first().map(String::as_str) == Some(key)
            && tag.as_slice().get(1).map(String::as_str) == Some(value)
    })
}
fn manifest(event: &Event, channel: &str) -> Result<Manifest, CliError> {
    if event.kind != Kind::Custom(KIND)
        || !has_tag(event, "h", channel)
        || !has_tag(event, "d", SLOT)
        || event.content.len() > 8192
    {
        return Err(failure("Invalid Page manifest scope"));
    }
    let m: Manifest =
        serde_json::from_str(&event.content).map_err(|_| failure("Invalid Page manifest"))?;
    if m.marker != "buzz.page"
        || m.version != 1
        || m.page != "page"
        || uuid::Uuid::parse_str(&m.publication).is_err()
        || m.bytes > MAX_BYTES
        || m.chunks.len() > MAX_CHUNKS
        || m.chunks.iter().any(|id| {
            id.len() != 64
                || !id
                    .bytes()
                    .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
        })
        || m.chunks.iter().collect::<HashSet<_>>().len() != m.chunks.len()
        || (m.bytes == 0) != (m.chunks.is_empty())
    {
        return Err(failure("Invalid Page manifest fields"));
    }
    Ok(m)
}
async fn query(client: &BuzzClient, filter: serde_json::Value) -> Result<Vec<Event>, CliError> {
    serde_json::from_str(&client.query(&filter).await?)
        .map_err(|e| failure(format!("Malformed Page query response: {e}")))
}
async fn head(
    client: &BuzzClient,
    channel: &str,
    authors: &[String],
) -> Result<Option<Event>, CliError> {
    Ok(query(
        client,
        json!({"kinds":[KIND],"#h":[channel],"#e":[ANCHOR],"authors":authors,"limit":1,"consistency":"strong"}),
    )
    .await?
    .into_iter()
    .next())
}
async fn channel_authors(client: &BuzzClient, channel: &str) -> Result<Vec<String>, CliError> {
    let events = query(
        client,
        json!({"kinds":[39002],"#d":[channel],"limit":1,"consistency":"strong"}),
    )
    .await?;
    Ok(events
        .first()
        .map(|event| {
            event
                .tags
                .iter()
                .filter_map(|tag| {
                    let t = tag.as_slice();
                    if t.first().map(String::as_str) == Some("p") {
                        t.get(1).cloned()
                    } else {
                        None
                    }
                })
                .collect()
        })
        .unwrap_or_default())
}
fn split_html(html: &str) -> Vec<&str> {
    let mut parts = Vec::new();
    let mut start = 0;
    while start < html.len() {
        let mut end = (start + CHUNK_BYTES).min(html.len());
        while !html.is_char_boundary(end) {
            end -= 1;
        }
        parts.push(&html[start..end]);
        start = end;
    }
    parts
}
fn build(
    client: &BuzzClient,
    channel: &str,
    slot: &str,
    content: String,
    stamp: u64,
) -> Result<Event, CliError> {
    let mut raw_tags = vec![["h", channel], ["d", slot], ["t", "buzz-page-v1"]];
    if slot == SLOT {
        raw_tags.push(["e", ANCHOR]);
    }
    let tags = raw_tags
        .into_iter()
        .map(|tag| Tag::parse(tag).map_err(|e| failure(e.to_string())))
        .collect::<Result<Vec<_>, _>>()?;
    client.sign_event(
        EventBuilder::new(Kind::Custom(KIND), content)
            .tags(tags)
            .custom_created_at(Timestamp::from(stamp)),
    )
}
async fn publish(client: &BuzzClient, event: Event) -> Result<String, CliError> {
    let response = client.submit_event(event).await?;
    let normalized = normalize_write_response(&response);
    let value: serde_json::Value = serde_json::from_str(&normalized)
        .map_err(|_| failure("Malformed Page publish acknowledgement"))?;
    if value["accepted"] != true {
        return Err(failure("Relay rejected Page publication"));
    }
    Ok(normalized)
}
async fn load_html(client: &BuzzClient, event: &Event, channel: &str) -> Result<String, CliError> {
    let m = manifest(event, channel)?;
    if m.chunks.is_empty() {
        return Ok(String::new());
    }
    let chunks=query(client,json!({"kinds":[KIND],"ids":m.chunks,"#h":[channel],"limit":MAX_CHUNKS,"consistency":"strong"})).await?;
    let mut html = String::new();
    for (index, id) in m.chunks.iter().enumerate() {
        let e = chunks
            .iter()
            .find(|e| e.id.to_hex() == *id)
            .ok_or_else(|| failure("Page chunk missing; retry get"))?;
        if e.kind != Kind::Custom(KIND)
            || e.pubkey != event.pubkey
            || !has_tag(e, "h", channel)
            || !has_tag(
                e,
                "d",
                &format!("buzz-page:chunk:{}:{index}", m.publication),
            )
        {
            return Err(failure("Page chunk has wrong scope or author"));
        }
        let chunk: Chunk =
            serde_json::from_str(&e.content).map_err(|_| failure("Invalid Page chunk"))?;
        if chunk.marker != "buzz.page.chunk"
            || chunk.version != 1
            || chunk.page != "page"
            || chunk.publication != m.publication
            || chunk.index != index
            || chunk.html.len() > CHUNK_BYTES + 4
        {
            return Err(failure("Invalid Page chunk fields"));
        }
        html.push_str(&chunk.html);
        if html.len() > MAX_BYTES {
            return Err(failure("Page exceeds 512 KiB"));
        }
    }
    if html.len() != m.bytes {
        return Err(failure("Page byte count mismatch"));
    }
    Ok(html)
}
/// Get a reconstructed Page or publish acknowledged chunks followed by its shared manifest.
pub async fn dispatch(cmd: PageCmd, client: &BuzzClient) -> Result<(), CliError> {
    match cmd {
        PageCmd::Get { channel } => {
            parse_uuid(&channel)?;
            let authors = channel_authors(client, &channel).await?;
            if authors.is_empty() {
                println!("null");
                return Ok(());
            }
            match head(client, &channel, &authors).await? {
                Some(event) => {
                    let html = load_html(client, &event, &channel).await?;
                    println!("{}", json!({"event":event,"html":html,"page":"page"}));
                }
                None => println!("null"),
            }
        }
        PageCmd::Set { channel, file } => {
            parse_uuid(&channel)?;
            use std::io::Read;
            let mut bytes = Vec::new();
            std::fs::File::open(file)
                .map_err(|e| failure(e.to_string()))?
                .take((MAX_BYTES + 1) as u64)
                .read_to_end(&mut bytes)
                .map_err(|e| failure(e.to_string()))?;
            if bytes.len() > MAX_BYTES {
                return Err(failure("Page exceeds 512 KiB"));
            }
            let html = String::from_utf8(bytes).map_err(|_| failure("Page must be UTF-8"))?;
            let authors = channel_authors(client, &channel).await?;
            if !authors.contains(&client.keys().public_key().to_hex()) {
                return Err(failure("Only channel members can replace the Page"));
            }
            let now = Timestamp::now().as_secs();
            let stamp = head(client, &channel, &authors)
                .await?
                .map_or(now, |event| {
                    now.max(event.created_at.as_secs().saturating_add(1))
                });
            if stamp > now + 300 {
                return Err(failure("Page head is too far in the future"));
            }
            let publication = uuid::Uuid::new_v4().to_string();
            let mut ids = Vec::new();
            for (index, part) in split_html(&html).into_iter().enumerate() {
                let chunk = Chunk {
                    marker: "buzz.page.chunk".into(),
                    version: 1,
                    page: "page".into(),
                    publication: publication.clone(),
                    index,
                    html: part.into(),
                };
                let event = build(
                    client,
                    &channel,
                    &format!("buzz-page:chunk:{publication}:{index}"),
                    serde_json::to_string(&chunk).map_err(|e| failure(e.to_string()))?,
                    stamp,
                )?;
                ids.push(event.id.to_hex());
                publish(client, event).await?;
            }
            if !channel_authors(client, &channel)
                .await?
                .contains(&client.keys().public_key().to_hex())
            {
                return Err(failure("Channel membership changed before Page commit"));
            }
            let root = Manifest {
                marker: "buzz.page".into(),
                version: 1,
                page: "page".into(),
                publication,
                chunks: ids,
                bytes: html.len(),
            };
            let event = build(
                client,
                &channel,
                SLOT,
                serde_json::to_string(&root).map_err(|e| failure(e.to_string()))?,
                stamp,
            )?;
            println!("{}", publish(client, event).await?);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn chunks_preserve_utf8_and_fit_hosted_envelopes() {
        for html in [
            "é🙂".repeat(MAX_BYTES / 6),
            "\0".repeat(MAX_BYTES),
            String::new(),
        ] {
            let parts = split_html(&html);
            assert!(parts.len() <= MAX_CHUNKS);
            assert_eq!(parts.concat(), html);
            for (index, part) in parts.iter().enumerate() {
                let chunk = Chunk {
                    marker: "buzz.page.chunk".into(),
                    version: 1,
                    page: "page".into(),
                    publication: uuid::Uuid::new_v4().to_string(),
                    index,
                    html: (*part).into(),
                };
                assert!(serde_json::to_string(&chunk).unwrap().len() < 256 * 1024);
            }
        }
    }
    #[tokio::test]
    async fn rejects_oversized_file_before_any_network_request() {
        let client = BuzzClient::new(
            "http://127.0.0.1:1".into(),
            nostr::Keys::generate(),
            None,
            None,
        )
        .unwrap();
        let file = std::env::temp_dir().join(format!("buzz-page-{}.html", uuid::Uuid::new_v4()));
        std::fs::write(&file, vec![b'a'; MAX_BYTES + 1]).unwrap();
        let error = dispatch(
            PageCmd::Set {
                channel: "11111111-1111-1111-1111-111111111111".into(),
                file: file.clone(),
            },
            &client,
        )
        .await
        .unwrap_err();
        std::fs::remove_file(file).unwrap();
        assert!(error.to_string().contains("512 KiB"));
    }
}
