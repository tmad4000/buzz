//! Narrow receiver for frozen private queue v1. No arbitrary peer or recipient decrypt API.
use crate::{app_state::AppState, relay::relay_api_base_url_with_override};
use base64::{engine::general_purpose::STANDARD, Engine};
use nostr::{nips::nip44, Event, JsonUtil, Keys, PublicKey, Timestamp};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use tauri::State;
const RELAY: &str = "https://jprojects.communities.buzz.xyz";
const BRIDGE: &str = "38ba46f41d56ff5c71cfbfb856d00b209e6216a218260d2a30c4f1b712bdd1cb";
const RECIPIENT: &str = "3eb6491e9fecd5e2c0221f76b79685a1478b591bf90ea155f5352ebe12672e1f";
const SERVER: &str = "srv_KIFHQ_zsBnI2";
const ROOT: &str = "d3caa262-cdcd-454d-9d42-0cd05ac69156";
const INVALID: &str = "Private queue unavailable";
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Row {
    id: String,
    source: String,
    created_at: u64,
    preview: String,
    state: String,
    state_observed_at: u64,
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Snapshot {
    v: u8,
    server_id: String,
    agent_id: String,
    observed_at: u64,
    verified_at: Option<u64>,
    availability: String,
    root_state: String,
    depth: Option<u64>,
    oldest_created_at: Option<u64>,
    items: Vec<Row>,
    recent: Vec<Row>,
    omitted: u64,
    complete: bool,
}
fn scope(state: &AppState, relay: &str, recipient: &str) -> Result<Keys, String> {
    // Do not let the relay helper's best-effort poison fallback authorize this receiver.
    drop(
        state
            .relay_url_override
            .lock()
            .map_err(|_| INVALID.to_string())?,
    );
    let keys = state.signing_keys().map_err(|_| INVALID.to_string())?;
    if relay != RELAY
        || recipient != RECIPIENT
        || keys.public_key().to_hex() != RECIPIENT
        || relay_api_base_url_with_override(state).trim_end_matches('/') != RELAY
    {
        return Err(INVALID.into());
    }
    Ok(keys)
}
fn preview(source: &str) -> Option<&'static str> {
    match source {
        "jacob-dm" => Some("Jacob DM request"),
        "jacob-p2" => Some("Jacob P2 request"),
        "watchdog" => Some("Automatic reminder"),
        "agent" => Some("Agent update"),
        "unknown" => Some("Queued item (source unavailable)"),
        _ => None,
    }
}
fn parse_snapshot(plaintext: &str, created_at: u64) -> Result<Snapshot, String> {
    if plaintext.len() > 16384 {
        return Err(INVALID.into());
    }
    // Typed parsing rejects duplicate/unknown fields. Required-key check also rejects omitted nullable fields.
    let q: Snapshot = serde_json::from_str(plaintext).map_err(|_| INVALID.to_string())?;
    let raw: serde_json::Value =
        serde_json::from_str(plaintext).map_err(|_| INVALID.to_string())?;
    let keys = [
        "v",
        "serverId",
        "agentId",
        "observedAt",
        "verifiedAt",
        "availability",
        "rootState",
        "depth",
        "oldestCreatedAt",
        "items",
        "recent",
        "omitted",
        "complete",
    ];
    if !keys.iter().all(|k| raw.get(k).is_some())
        || q.v != 1
        || q.server_id != SERVER
        || q.agent_id != ROOT
        || q.observed_at > created_at.saturating_add(60)
        || q.verified_at.is_some_and(|t| t > q.observed_at)
        || !["running", "idle", "unknown"].contains(&q.root_state.as_str())
        || q.items.len() > 64
        || q.recent.len() > 10
    {
        return Err(INVALID.into());
    }
    let mut ids = HashSet::new();
    for (rows, expected) in [(&q.items, "queued"), (&q.recent, "delivered")] {
        for row in rows {
            if row.id.len() != 64
                || !row
                    .id
                    .bytes()
                    .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
                || !ids.insert(row.id.clone())
                || preview(&row.source) != Some(row.preview.as_str())
                || row.state != expected
                || row.created_at > q.observed_at.saturating_add(60)
                || row.state_observed_at > q.observed_at.saturating_add(60)
                || row.state_observed_at < row.created_at
            {
                return Err(INVALID.into());
            }
        }
    }
    match q.availability.as_str() {
        "unavailable" => {
            if q.root_state != "unknown"
                || q.depth.is_some()
                || q.oldest_created_at.is_some()
                || !q.items.is_empty()
                || !q.recent.is_empty()
                || q.omitted != 0
                || q.complete
            {
                return Err(INVALID.into());
            }
        }
        "ok" => {
            let depth = q.depth.ok_or(INVALID)?;
            if q.verified_at != Some(q.observed_at)
                || depth > 1000
                || q.items.len() as u64 > depth
                || q.omitted != depth - q.items.len() as u64
                || q.complete != (q.omitted == 0)
            {
                return Err(INVALID.into());
            }
            if depth == 0 {
                if q.oldest_created_at.is_some() {
                    return Err(INVALID.into());
                }
            } else {
                let oldest = q.oldest_created_at.ok_or(INVALID)?;
                if oldest > q.observed_at.saturating_add(60)
                    || q.items.iter().any(|r| oldest > r.created_at)
                {
                    return Err(INVALID.into());
                }
            }
        }
        _ => return Err(INVALID.into()),
    }
    // JSON/TS integer contract, not Rust's wider u64 range.
    let safe = 9_007_199_254_740_991_u64;
    if q.observed_at > safe
        || q.verified_at.is_some_and(|t| t > safe)
        || q.oldest_created_at.is_some_and(|t| t > safe)
        || q.omitted > safe
        || q.items
            .iter()
            .chain(&q.recent)
            .any(|r| r.created_at > safe || r.state_observed_at > safe)
    {
        return Err(INVALID.into());
    }
    Ok(q)
}
fn decrypt(keys: &Keys, event_json: &str) -> Result<Snapshot, String> {
    if event_json.len() > 32768 || keys.public_key().to_hex() != RECIPIENT {
        return Err(INVALID.into());
    }
    let event = Event::from_json(event_json).map_err(|_| INVALID.to_string())?;
    if event.pubkey.to_hex() != BRIDGE
        || event.kind.as_u16() != 30078
        || !event.verify_id()
        || !event.verify_signature()
        || event.created_at.as_u64() > Timestamp::now().as_u64().saturating_add(60)
    {
        return Err(INVALID.into());
    }
    let expected = vec![vec!["d", "agent-queue-v1"], vec!["p", RECIPIENT]];
    let tags: Vec<Vec<&str>> = event
        .tags
        .iter()
        .map(|t| t.as_slice().iter().map(String::as_str).collect())
        .collect();
    if tags != expected || event.content.len() > 24576 || !event.content.is_ascii() {
        return Err(INVALID.into());
    }
    let ciphertext = STANDARD
        .decode(&event.content)
        .map_err(|_| INVALID.to_string())?;
    if ciphertext.first() != Some(&2) {
        return Err(INVALID.into());
    }
    // The nostr NIP44 decoder enforces authenticated padding/MAC.
    let bridge = PublicKey::from_hex(BRIDGE).map_err(|_| INVALID.to_string())?;
    decrypt_payload(keys, &bridge, &event.content, event.created_at.as_u64())
}
// Private only: the IPC entry point always supplies the fixed trusted bridge after envelope authentication.
fn decrypt_payload(
    keys: &Keys,
    bridge: &PublicKey,
    ciphertext: &str,
    created_at: u64,
) -> Result<Snapshot, String> {
    let plaintext =
        nip44::decrypt(keys.secret_key(), bridge, ciphertext).map_err(|_| INVALID.to_string())?;
    parse_snapshot(&plaintext, created_at)
}
#[tauri::command]
pub async fn decrypt_agent_queue_event(
    event_json: String,
    expected_relay_origin: String,
    expected_recipient: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let keys = scope(&state, &expected_relay_origin, &expected_recipient)?;
    let decoded = tauri::async_runtime::spawn_blocking(move || decrypt(&keys, &event_json))
        .await
        .map_err(|_| INVALID.to_string())??;
    scope(&state, &expected_relay_origin, &expected_recipient)?;
    serde_json::to_value(decoded).map_err(|_| INVALID.to_string())
}
#[cfg(test)]
#[path = "agent_queue_tests.rs"]
mod tests;
