//! Fixed private fleet-v1 receiver. Separate from the immutable queue receiver.
use crate::{app_state::AppState, relay::relay_api_base_url_with_override};
use base64::{engine::general_purpose::STANDARD, Engine};
use nostr::{nips::nip44, Event, JsonUtil, Keys, PublicKey, Timestamp};
use serde::{Deserialize, Serialize};
use tauri::State;
const RELAY: &str = "https://jprojects.communities.buzz.xyz";
const BRIDGE: &str = "38ba46f41d56ff5c71cfbfb856d00b209e6216a218260d2a30c4f1b712bdd1cb";
const RECIPIENT: &str = "3eb6491e9fecd5e2c0221f76b79685a1478b591bf90ea155f5352ebe12672e1f";
const SERVER: &str = "srv_KIFHQ_zsBnI2";
const ROOT: &str = "d3caa262-cdcd-454d-9d42-0cd05ac69156";
const MAX_TIME: u64 = 253402300799;
const INVALID: &str = "Private fleet unavailable";
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Coverage {
    seen: u64,
    total: Option<u64>,
    complete: bool,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Counts {
    running: Option<u64>,
    idle: Option<u64>,
    blocked: Option<u64>,
    needs_permission: Option<u64>,
    unknown: Option<u64>,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Queue {
    availability: String,
    depth: Option<u64>,
    observed_at: Option<u64>,
    verified_at: Option<u64>,
    source_event_id: Option<String>,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Root {
    agent_id: String,
    state: String,
    queue: Queue,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct OtherHosts {
    m4: String,
    m5: String,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Snapshot {
    v: u8,
    server_id: String,
    observed_at: u64,
    verified_at: Option<u64>,
    availability: String,
    coverage: Coverage,
    gcp: Counts,
    root: Root,
    other_hosts: OtherHosts,
}
fn exact(value: &serde_json::Value, keys: &[&str]) -> bool {
    value
        .as_object()
        .is_some_and(|map| map.len() == keys.len() && keys.iter().all(|key| map.contains_key(*key)))
}
fn scope(state: &AppState, relay: &str, recipient: &str) -> Result<Keys, String> {
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
fn parse_snapshot(plaintext: &str, event_created_at: u64) -> Result<Snapshot, String> {
    parse_snapshot_at(plaintext, event_created_at, Timestamp::now().as_u64())
}
fn parse_snapshot_at(plaintext: &str, event_created_at: u64, now: u64) -> Result<Snapshot, String> {
    if plaintext.len() > 4096 || event_created_at > now.saturating_add(60) {
        return Err(INVALID.into());
    }
    // Typed parse rejects duplicate/unknown fields; exact checks require even nullable fields.
    let q: Snapshot = serde_json::from_str(plaintext).map_err(|_| INVALID.to_string())?;
    let raw: serde_json::Value =
        serde_json::from_str(plaintext).map_err(|_| INVALID.to_string())?;
    if !exact(
        &raw,
        &[
            "v",
            "serverId",
            "observedAt",
            "verifiedAt",
            "availability",
            "coverage",
            "gcp",
            "root",
            "otherHosts",
        ],
    ) || !exact(&raw["coverage"], &["seen", "total", "complete"])
        || !exact(
            &raw["gcp"],
            &["running", "idle", "blocked", "needsPermission", "unknown"],
        )
        || !exact(&raw["root"], &["agentId", "state", "queue"])
        || !exact(
            &raw["root"]["queue"],
            &[
                "availability",
                "depth",
                "observedAt",
                "verifiedAt",
                "sourceEventId",
            ],
        )
        || !exact(&raw["otherHosts"], &["m4", "m5"])
        || q.v != 1
        || q.server_id != SERVER
        || q.root.agent_id != ROOT
        || q.other_hosts.m4 != "unknown"
        || q.other_hosts.m5 != "unknown"
        || q.observed_at > now.saturating_add(60)
        || q.observed_at > MAX_TIME
        || q.observed_at > event_created_at.saturating_add(60)
        || q.verified_at.is_some_and(|t| t > q.observed_at)
        || !["running", "idle", "blocked", "needs-permission", "unknown"]
            .contains(&q.root.state.as_str())
    {
        return Err(INVALID.into());
    }
    let c = &q.coverage;
    let queue = &q.root.queue;
    if c.seen > 10000 || c.total.is_some_and(|t| t > 10000) {
        return Err(INVALID.into());
    }
    match &queue.source_event_id {
        None => {
            if queue.observed_at.is_some() || queue.verified_at.is_some() {
                return Err(INVALID.into());
            }
        }
        Some(id) => {
            let at = queue.observed_at.ok_or(INVALID)?;
            if id.len() != 64
                || !id
                    .bytes()
                    .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
                || at > MAX_TIME
                || at > now.saturating_add(60)
                || at > q.observed_at.saturating_add(60)
                || queue.verified_at.is_some_and(|t| t > at)
            {
                return Err(INVALID.into());
            }
        }
    }
    match queue.availability.as_str() {
        "ok" => {
            let at = queue.observed_at.ok_or(INVALID)?;
            if queue.depth.is_none_or(|d| d > 1000)
                || queue.verified_at != Some(at)
                || queue.source_event_id.is_none()
                || q.observed_at.saturating_sub(at) > 120
            {
                return Err(INVALID.into());
            }
        }
        "unavailable" => {
            if queue.depth.is_some() {
                return Err(INVALID.into());
            }
        }
        _ => return Err(INVALID.into()),
    }
    let counts = [
        q.gcp.running,
        q.gcp.idle,
        q.gcp.blocked,
        q.gcp.needs_permission,
        q.gcp.unknown,
    ];
    if q.availability == "unavailable" {
        if c.seen != 0
            || c.total.is_some()
            || c.complete
            || counts.iter().any(Option::is_some)
            || q.root.state != "unknown"
            || queue.availability != "unavailable"
            || queue.source_event_id.is_some()
            || queue.observed_at.is_some()
            || queue.verified_at.is_some()
        {
            return Err(INVALID.into());
        }
    } else {
        if q.verified_at != Some(q.observed_at)
            || counts.iter().any(|v| v.is_none_or(|n| n > 10000))
            || counts.iter().flatten().sum::<u64>() != c.seen
        {
            return Err(INVALID.into());
        }
        match q.availability.as_str() {
            "ok" => {
                if !c.complete || c.total != Some(c.seen) {
                    return Err(INVALID.into());
                }
                let root_count = match q.root.state.as_str() {
                    "running" => q.gcp.running,
                    "idle" => q.gcp.idle,
                    "blocked" => q.gcp.blocked,
                    "needs-permission" => q.gcp.needs_permission,
                    _ => None,
                };
                if q.root.state != "unknown" && root_count.is_none_or(|n| n < 1) {
                    return Err(INVALID.into());
                }
            }
            "partial" => {
                if c.complete || c.total.is_some() || c.seen > 9999 {
                    return Err(INVALID.into());
                }
            }
            _ => return Err(INVALID.into()),
        }
    }
    Ok(q)
}
fn decrypt(keys: &Keys, event_json: &str) -> Result<Snapshot, String> {
    if event_json.len() > 16384 || keys.public_key().to_hex() != RECIPIENT {
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
    let expected = vec![vec!["d", "fleet-status-v1"], vec!["p", RECIPIENT]];
    let tags: Vec<Vec<&str>> = event
        .tags
        .iter()
        .map(|tag| tag.as_slice().iter().map(String::as_str).collect())
        .collect();
    if tags != expected || event.content.len() > 8192 || !event.content.is_ascii() {
        return Err(INVALID.into());
    }
    let ciphertext = STANDARD
        .decode(&event.content)
        .map_err(|_| INVALID.to_string())?;
    if ciphertext.first() != Some(&2) {
        return Err(INVALID.into());
    }
    let bridge = PublicKey::from_hex(BRIDGE).map_err(|_| INVALID.to_string())?;
    let plaintext = nip44::decrypt(keys.secret_key(), &bridge, &event.content)
        .map_err(|_| INVALID.to_string())?;
    parse_snapshot(&plaintext, event.created_at.as_u64())
}
#[tauri::command]
pub async fn decrypt_agent_fleet_event(
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
#[path = "agent_fleet_tests.rs"]
mod tests;
