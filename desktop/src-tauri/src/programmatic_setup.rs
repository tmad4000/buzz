use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SetupRequest {
    relay_url: String,
    pubkey: String,
    check_only: bool,
}

#[tauri::command]
pub(crate) fn get_setup_request() -> Result<Option<SetupRequest>, String> {
    let Ok(relay_url) = std::env::var("BUZZ_SETUP_RELAY") else {
        return Ok(None);
    };
    let pubkey = std::env::var("BUZZ_SETUP_PUBKEY").unwrap_or_default();
    parse_request(
        &relay_url,
        &pubkey,
        std::env::var("BUZZ_SETUP_CHECK").as_deref() == Ok("1"),
    )
    .map(Some)
}

fn parse_request(relay_url: &str, pubkey: &str, check_only: bool) -> Result<SetupRequest, String> {
    let url = url::Url::parse(relay_url).map_err(|_| "Invalid setup relay URL")?;
    if url.scheme() != "wss"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("Setup requires a wss URL without credentials, query, or fragment".into());
    }
    if pubkey.len() != 64 || !pubkey.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("Set BUZZ_SETUP_PUBKEY to the expected 64-character public key".into());
    }
    Ok(SetupRequest {
        relay_url: url.as_str().trim_end_matches('/').to_owned(),
        pubkey: pubkey.to_ascii_lowercase(),
        check_only,
    })
}

#[derive(serde::Deserialize, Debug)]
#[serde(rename_all = "snake_case")]
pub(crate) enum SetupStatus {
    InvalidInput,
    IdentityUnavailable,
    DifferentCommunity,
    SetupInProgress,
    SubscriptionRequired,
    ConsentRequired,
    RelayAccessRequired,
    ReadyToConnect,
    AlreadyConfigured,
    Connecting,
    Connected,
    ProfileRequired,
    Failed,
}

#[tauri::command]
pub(crate) fn report_setup_status(app: tauri::AppHandle, status: SetupStatus) {
    if std::env::var_os("BUZZ_SETUP_RELAY").is_none() {
        return;
    }
    eprintln!("buzz setup: {status:?}");
    if std::env::var("BUZZ_SETUP_CHECK").as_deref() == Ok("1") {
        let ready = matches!(
            status,
            SetupStatus::ReadyToConnect | SetupStatus::AlreadyConfigured
        );
        app.exit(if ready { 0 } else { 1 });
    }
}

#[tauri::command]
pub(crate) async fn has_claude_subscription() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(crate::managed_agents::has_claude_subscription)
        .await
        .map_err(|_| "Could not check Claude subscription".to_owned())
}

#[tauri::command]
pub(crate) async fn check_setup_relay_access(
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Result<(), String> {
    let request = get_setup_request()?.ok_or("No setup request")?;
    let keys = state
        .keys
        .lock()
        .map_err(|_| "Identity unavailable")?
        .clone();
    if keys.public_key().to_hex() != request.pubkey {
        return Err("Setup identity changed".into());
    }
    let base = crate::relay::relay_http_base_url(&request.relay_url);
    crate::relay::query_relay_at_with_keys(
        &state,
        &base,
        &[serde_json::json!({ "kinds": [0], "authors": [request.pubkey], "limit": 1 })],
        &keys,
        None,
    )
    .await
    .map(|_| ())
    .map_err(|_| "Could not read the relay with the setup identity".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_target_before_any_setup_work() {
        let key = "AB".repeat(32);
        let request = parse_request("wss://relay.example/", &key, true).unwrap();
        assert_eq!(request.relay_url, "wss://relay.example");
        assert_eq!(request.pubkey, key.to_ascii_lowercase());
        assert!(request.check_only);
        for invalid in [
            "ws://relay.example",
            "wss://user@relay.example",
            "wss://relay.example/?token=value",
            "wss://relay.example/#fragment",
        ] {
            assert!(parse_request(invalid, &key, false).is_err());
        }
        assert!(parse_request("wss://relay.example", "wrong", false).is_err());
    }
}
