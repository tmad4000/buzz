//! Shared channel HTML Page commands.
use crate::{
    client::{normalize_write_response, BuzzClient},
    error::CliError,
    validate::parse_uuid,
    PageCmd,
};
use nostr::{EventBuilder, Kind, Tag, Timestamp};
use serde_json::json;

const KIND: u16 = buzz_core::kind::KIND_CHANNEL_PAGE as u16;
const MAX_BYTES: usize = 512 * 1024;

async fn head(client: &BuzzClient, channel: &str) -> Result<Option<serde_json::Value>, CliError> {
    let raw = client.query(&json!({"kinds": [KIND], "#h": [channel], "#d": ["page"], "limit": 1, "consistency": "strong"})).await?;
    let events: Vec<serde_json::Value> =
        serde_json::from_str(&raw).map_err(|e| CliError::Other(e.to_string()))?;
    Ok(events.into_iter().next())
}

/// Execute a Page command, propagating read and publish failures.
pub async fn dispatch(cmd: PageCmd, client: &BuzzClient) -> Result<(), CliError> {
    match cmd {
        PageCmd::Get { channel } => {
            parse_uuid(&channel)?;
            println!(
                "{}",
                serde_json::to_string(&head(client, &channel).await?)
                    .map_err(|e| CliError::Other(e.to_string()))?
            );
        }
        PageCmd::Set { channel, file } => {
            parse_uuid(&channel)?;
            // Bound allocation as well as the final payload, including files that grow while read.
            use std::io::Read;
            let mut bytes = Vec::new();
            std::fs::File::open(file)
                .map_err(|e| CliError::Other(e.to_string()))?
                .take((MAX_BYTES + 1) as u64)
                .read_to_end(&mut bytes)
                .map_err(|e| CliError::Other(e.to_string()))?;
            if bytes.len() > MAX_BYTES {
                return Err(CliError::Other("Page exceeds 512 KiB".into()));
            }
            let html = String::from_utf8(bytes)
                .map_err(|e| CliError::Other(format!("Page must be UTF-8: {e}")))?;
            let now = Timestamp::now().as_secs();
            let previous = head(client, &channel)
                .await?
                .and_then(|e| e["created_at"].as_u64());
            let stamp = previous.map_or(now, |t| now.max(t.saturating_add(1)));
            if stamp > now + 300 {
                return Err(CliError::Other("Page head is too far in the future".into()));
            }
            let tags = [["h", channel.as_str()], ["d", "page"], ["m", "text/html"]]
                .into_iter()
                .map(|t| Tag::parse(t).map_err(|e| CliError::Other(e.to_string())))
                .collect::<Result<Vec<_>, _>>()?;
            let event = client.sign_event(
                EventBuilder::new(Kind::Custom(KIND), html)
                    .tags(tags)
                    .custom_created_at(Timestamp::from(stamp)),
            )?;
            let response = client.submit_event(event).await?;
            println!("{}", normalize_write_response(&response));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{extract::State, routing::post, Router};
    use std::sync::{Arc, Mutex};
    use tokio::net::TcpListener;

    #[tokio::test]
    async fn set_reads_shared_head_then_publishes_file_with_monotonic_timestamp() {
        let captured = Arc::new(Mutex::new(Vec::<serde_json::Value>::new()));
        let now = Timestamp::now().as_secs() + 60;
        let app = Router::new()
            .route(
                "/query",
                post(
                    move |axum::Json(filters): axum::Json<serde_json::Value>| async move {
                        assert_eq!(filters[0]["#d"], json!(["page"]));
                        assert_eq!(filters[0]["kinds"], json!([40101]));
                        assert_eq!(filters[0]["consistency"], "strong");
                        json!([{"created_at":now}]).to_string()
                    },
                ),
            )
            .route(
                "/events",
                post(
                    |State(events): State<Arc<Mutex<Vec<serde_json::Value>>>>,
                     axum::Json(event): axum::Json<serde_json::Value>| async move {
                        events.lock().unwrap().push(event);
                        r#"{"accepted":true,"event_id":"test"}"#
                    },
                ),
            )
            .with_state(captured.clone());
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let client = BuzzClient::new(url, nostr::Keys::generate(), None, None).unwrap();
        let file = std::env::temp_dir().join(format!("buzz-page-{}.html", uuid::Uuid::new_v4()));
        std::fs::write(&file, "<h1>Shared HTML</h1>").unwrap();
        let channel = "11111111-1111-1111-1111-111111111111";
        let result = dispatch(
            PageCmd::Set {
                channel: channel.into(),
                file: file.clone(),
            },
            &client,
        )
        .await;
        std::fs::remove_file(file).unwrap();
        server.abort();
        result.unwrap();
        let events = captured.lock().unwrap();
        let event = &events[0];
        assert_eq!(event["kind"], 40101);
        assert_eq!(event["content"], "<h1>Shared HTML</h1>");
        assert_eq!(event["created_at"], now + 1);
        assert_eq!(
            event["tags"],
            json!([["h", channel], ["d", "page"], ["m", "text/html"]])
        );
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
        let err = dispatch(
            PageCmd::Set {
                channel: "11111111-1111-1111-1111-111111111111".into(),
                file: file.clone(),
            },
            &client,
        )
        .await
        .unwrap_err();
        std::fs::remove_file(file).unwrap();
        assert!(err.to_string().contains("512 KiB"));
    }
}
