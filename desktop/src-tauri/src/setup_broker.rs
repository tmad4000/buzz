//! Fixed-origin, bounded device-proof transport. This is not a general HTTP proxy.

use std::time::Duration;

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::Value;

const ORIGIN: &str = "https://id.ideaflow.app";
const RESPONSE_LIMIT: usize = 32 * 1024;
const UNAVAILABLE: &str = "Setup broker unavailable";

/// Only existing device-bound setup operations; no invitation, consent or arbitrary endpoint calls.
#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Operation {
    Authorization,
    Exchange,
    Resume,
}

impl Operation {
    fn path(self) -> &'static str {
        match self {
            Self::Authorization => "/api/setup/v1/authorization",
            Self::Exchange => "/api/setup/v1/exchange",
            Self::Resume => "/api/setup/v1/resume",
        }
    }

    fn accepts(self, body: &Value) -> bool {
        let Some(object) = body.as_object() else {
            return false;
        };
        let fields: &[&str] = match self {
            Self::Authorization | Self::Resume => &["attemptId", "signature"],
            Self::Exchange => &[
                "attemptId",
                "signature",
                "authorizationCode",
                "pkceVerifier",
            ],
        };
        if object.len() != fields.len() || fields.iter().any(|field| !object.contains_key(*field)) {
            return false;
        }
        if !encoded_bytes(&body["attemptId"], 32) || !encoded_bytes(&body["signature"], 64) {
            return false;
        }
        if matches!(self, Self::Exchange) {
            let Some(verifier) = body["pkceVerifier"].as_str() else {
                return false;
            };
            return encoded_bytes(&body["authorizationCode"], 32)
                && (43..=128).contains(&verifier.len())
                && verifier
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || b"._~-".contains(&byte));
        }
        true
    }
}

fn encoded_bytes(value: &Value, length: usize) -> bool {
    let Some(value) = value.as_str() else {
        return false;
    };
    // Reject overlong inputs before decoding, including a secret accidentally placed in the wrong field.
    if value.len() != (length * 8).div_ceil(6) {
        return false;
    }
    let Ok(bytes) = URL_SAFE_NO_PAD.decode(value) else {
        return false;
    };
    bytes.len() == length && URL_SAFE_NO_PAD.encode(bytes) == value
}

/// Error bodies are never relayed. The caller uses only status and a bounded retry interval.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Reply {
    status: u16,
    retry_after_seconds: Option<u64>,
    body: Option<Value>,
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .https_only(true)
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|_| UNAVAILABLE.to_owned())
}

async fn reply(mut response: reqwest::Response) -> Result<Reply, String> {
    let status = response.status().as_u16();
    let retry_after_seconds = response
        .headers()
        .get(reqwest::header::RETRY_AFTER)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok())
        .map(|value| value.clamp(1, 60));
    if status != 200 {
        return Ok(Reply {
            status,
            retry_after_seconds,
            body: None,
        });
    }
    let json = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.split(';').next() == Some("application/json"));
    if !json
        || response
            .content_length()
            .is_some_and(|length| length > RESPONSE_LIMIT as u64)
    {
        return Err(UNAVAILABLE.to_owned());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| UNAVAILABLE.to_owned())? {
        if chunk.len() > RESPONSE_LIMIT.saturating_sub(bytes.len()) {
            return Err(UNAVAILABLE.to_owned());
        }
        bytes.extend_from_slice(&chunk);
    }
    let body: Value = serde_json::from_slice(&bytes).map_err(|_| UNAVAILABLE.to_owned())?;
    if !body.is_object() {
        return Err(UNAVAILABLE.to_owned());
    }
    Ok(Reply {
        status,
        retry_after_seconds,
        body: Some(body),
    })
}

/// Obtain the public signing key only from the fixed Ideaflow ID origin, with redirects disabled.
#[tauri::command]
pub(crate) async fn setup_broker_public_key() -> Result<Reply, String> {
    reply(
        client()?
            .get(format!("{ORIGIN}/api/setup/v1/key"))
            .send()
            .await
            .map_err(|_| UNAVAILABLE.to_owned())?,
    )
    .await
}

/// Send a strictly shaped proof/exchange body over HTTPS POST. No input can select a URL or headers.
#[tauri::command]
pub(crate) async fn setup_broker_request(
    operation: Operation,
    body: Value,
) -> Result<Reply, String> {
    if !operation.accepts(&body) {
        return Err(UNAVAILABLE.to_owned());
    }
    let encoded = serde_json::to_vec(&body).map_err(|_| UNAVAILABLE.to_owned())?;
    if encoded.len() > 8192 {
        return Err(UNAVAILABLE.to_owned());
    }
    let response = client()?
        .post(format!("{ORIGIN}{}", operation.path()))
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(encoded)
        .send()
        .await
        .map_err(|_| UNAVAILABLE.to_owned())?;
    reply(response).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn poll() -> Value {
        json!({"attemptId":URL_SAFE_NO_PAD.encode([7u8;32]),"signature":URL_SAFE_NO_PAD.encode([9u8;64])})
    }

    #[test]
    fn only_exact_device_operations_and_payloads_are_supported() {
        let body = poll();
        assert!(Operation::Authorization.accepts(&body));
        assert!(Operation::Resume.accepts(&body));
        assert!(!Operation::Exchange.accepts(&body));
        for field in [
            "url",
            "headers",
            "callback",
            "privateKey",
            "accessToken",
            "settings",
        ] {
            let mut altered = body.clone();
            altered[field] = json!("not permitted");
            assert!(!Operation::Authorization.accepts(&altered));
        }
        assert!(serde_json::from_str::<Operation>("\"arbitrary\"").is_err());
        assert_eq!(
            Operation::Authorization.path(),
            "/api/setup/v1/authorization"
        );
        assert_eq!(Operation::Resume.path(), "/api/setup/v1/resume");
    }

    #[test]
    fn exchange_requires_canonical_code_and_bounded_pkce_verifier() {
        let mut body = poll();
        body["authorizationCode"] = json!(URL_SAFE_NO_PAD.encode([4u8; 32]));
        body["pkceVerifier"] = json!("A".repeat(43));
        assert!(Operation::Exchange.accepts(&body));
        assert!(!Operation::Resume.accepts(&body));
        for value in [
            "short".to_owned(),
            "A".repeat(129),
            format!("{}\n", "A".repeat(43)),
        ] {
            let mut altered = body.clone();
            altered["pkceVerifier"] = json!(value);
            assert!(!Operation::Exchange.accepts(&altered));
        }
        let mut altered = body.clone();
        altered["signature"] = json!("R".repeat(86));
        assert!(!Operation::Exchange.accepts(&altered));
    }
}
