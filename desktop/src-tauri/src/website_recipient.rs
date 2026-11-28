//! Anonymous, user-initiated reads for New chat website recipients.
use reqwest::{header, Client, Url};
use serde::Serialize;
use std::{net::IpAddr, time::Duration};

const BODY_LIMIT: usize = 512 * 1024;
const TEXT_LIMIT: usize = 16_000;
const UNAVAILABLE: &str = "Couldn't read this public website.";

fn public_ip(ip: IpAddr) -> bool {
    // Require IPv6 global-unicast space. This also excludes translation
    // wrappers which the shared policy permits for some public destinations.
    if matches!(ip, IpAddr::V6(address) if !(0x2000..=0x3fff).contains(&address.segments()[0])) {
        return false;
    }
    !buzz_core_pkg::network::is_not_global_unicast(&ip)
}

fn public_url(raw: &str) -> Result<Url, &'static str> {
    let mut url = Url::parse(raw).map_err(|_| UNAVAILABLE)?;
    let domain = url.domain().ok_or(UNAVAILABLE)?;
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || domain.ends_with('.')
        || !domain.contains('.')
        || [
            "localhost",
            "local",
            "internal",
            "lan",
            "home",
            "test",
            "invalid",
            "onion",
            "alt",
        ]
        .iter()
        .any(|suffix| domain.rsplit('.').next() == Some(suffix))
    {
        return Err(UNAVAILABLE);
    }
    url.set_query(None);
    url.set_fragment(None);
    Ok(url)
}

// Deliberately restrictive. Encoded and opaque path components may contain
// secrets. The user can supply text for pages whose addresses we can't read.
fn public_path(url: &Url) -> bool {
    url.path().len() <= 512
        && url.path().split('/').all(|part| {
            part.len() <= 64
                && part
                    .bytes()
                    .all(|b| b.is_ascii_alphabetic() || b"-_.".contains(&b))
                && !part.split(['-', '_', '.']).any(|word| {
                    matches!(
                        word.to_ascii_lowercase().as_str(),
                        "auth"
                            | "token"
                            | "secret"
                            | "invite"
                            | "reset"
                            | "booking"
                            | "reservation"
                            | "confirm"
                            | "checkout"
                            | "account"
                            | "login"
                    )
                })
        })
}

async fn get(url: Url, metadata: bool) -> Result<(Url, String, String), &'static str> {
    if !metadata && !public_path(&url) {
        return Err(UNAVAILABLE);
    }
    let host = url.domain().ok_or(UNAVAILABLE)?.to_owned();
    // Query the absolute DNS name so local search domains never receive it.
    let absolute_host = format!("{host}.");
    let addresses: Vec<_> = tokio::net::lookup_host((absolute_host.as_str(), 443))
        .await
        .map_err(|_| UNAVAILABLE)?
        .take(33)
        .collect();
    if addresses.is_empty()
        || addresses.len() > 32
        || addresses.iter().any(|addr| !public_ip(addr.ip()))
    {
        return Err(UNAVAILABLE);
    }

    // Pin the validated answers for every hop. The client has no ambient
    // proxy, cookies, authentication, or Referer, and never runs page scripts.
    let client = Client::builder()
        .no_proxy()
        .https_only(true)
        .redirect(reqwest::redirect::Policy::none())
        .referer(false)
        .resolve_to_addrs(&host, &addresses)
        .build()
        .map_err(|_| UNAVAILABLE)?;

    read_response(&client, url, metadata).await
}

async fn read_response(
    client: &Client,
    mut url: Url,
    metadata: bool,
) -> Result<(Url, String, String), &'static str> {
    let origin = url.origin();
    for _ in 0..=3 {
        if !metadata && !public_path(&url) {
            return Err(UNAVAILABLE);
        }
        let mut response = client
            .get(url.clone())
            .header(header::ACCEPT_ENCODING, "identity")
            .send()
            .await
            .map_err(|_| UNAVAILABLE)?;
        if response.status().is_redirection() && !metadata {
            let location = response
                .headers()
                .get(header::LOCATION)
                .ok_or(UNAVAILABLE)?;
            let next = url
                .join(location.to_str().map_err(|_| UNAVAILABLE)?)
                .map_err(|_| UNAVAILABLE)?;
            // Query-bearing redirects are commonly access or login flows.
            if next.query().is_some() {
                return Err(UNAVAILABLE);
            }
            let next = public_url(next.as_str())?;
            if next.origin() != origin || next == url {
                return Err(UNAVAILABLE);
            }
            url = next;
            continue;
        }
        if !response.status().is_success() {
            return Err(UNAVAILABLE);
        }
        let mime = response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.split(';').next())
            .unwrap_or_default()
            .trim()
            .to_ascii_lowercase();
        if !matches!(
            (metadata, mime.as_str()),
            (true, "application/json" | "application/nostr+json")
                | (false, "text/html" | "text/plain")
        ) {
            return Err(UNAVAILABLE);
        }
        let mut body = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| UNAVAILABLE)? {
            if body.len() + chunk.len() > BODY_LIMIT {
                return Err(UNAVAILABLE);
            }
            body.extend_from_slice(&chunk);
        }
        let body = String::from_utf8(body).map_err(|_| UNAVAILABLE)?;
        return Ok((url, mime, body));
    }
    Err(UNAVAILABLE)
}

fn page_text(mime: &str, body: &str) -> Result<String, &'static str> {
    let text = if mime == "text/html" {
        let document = dom_query::Document::from(body);
        document
            .select("script, style, template, noscript, iframe, [hidden]")
            .remove();
        document.select("body").formatted_text().to_string()
    } else {
        body.to_owned()
    };
    let text: String = text.trim().chars().take(TEXT_LIMIT).collect();
    if text.is_empty() {
        return Err(UNAVAILABLE);
    }
    Ok(text)
}

/// A bounded, inert excerpt and its public citation URL.
#[derive(Serialize)]
pub struct WebsitePage {
    url: String,
    text: String,
}

/// Fetch the public page after an explicit request in New chat.
#[tauri::command]
pub async fn read_website_recipient(url: String) -> Result<WebsitePage, String> {
    let url = public_url(&url)?;
    let (url, mime, body) = tokio::time::timeout(Duration::from_secs(12), get(url, false))
        .await
        .map_err(|_| UNAVAILABLE)??;
    Ok(WebsitePage {
        url: url.into(),
        text: page_text(&mime, &body)?,
    })
}

/// Read NIP-05 metadata from the exact domain, without following redirects.
#[tauri::command]
pub async fn lookup_website_recipient(url: String) -> Result<serde_json::Value, String> {
    let mut url = public_url(&url)?;
    url.set_path("/.well-known/nostr.json");
    let (_, _, body) = tokio::time::timeout(Duration::from_secs(12), get(url, true))
        .await
        .map_err(|_| UNAVAILABLE)??;
    serde_json::from_str(&body).map_err(|_| "The site returned invalid NIP-05 metadata.".to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };

    #[test]
    fn only_public_addresses_can_be_resolved() {
        for ip in [
            "127.0.0.1",
            "0.0.0.0",
            "10.1.2.3",
            "100.100.100.100",
            "169.254.169.254",
            "172.31.0.1",
            "192.168.1.1",
            "198.18.0.1",
            "::",
            "::1",
            "::ffff:127.0.0.1",
            "fe80::1",
            "fc00::1",
            "2002:a00:1::",
            "2001:db8::1",
        ] {
            assert!(!public_ip(ip.parse().unwrap()), "{ip}");
        }
        for ip in ["8.8.8.8", "2606:4700::1111"] {
            assert!(public_ip(ip.parse().unwrap()), "{ip}");
        }
    }

    #[test]
    fn request_urls_cannot_carry_credentials_or_tokens() {
        for url in [
            "https://127.1/policy",
            "https://[::1]/policy",
            "https://service.local/policy",
            "https://intranet/",
            "https://user:pass@example.com/policy",
            "https://example.com:8443/policy",
            "http://example.com/policy",
        ] {
            assert!(public_url(url).is_err(), "{url}");
        }
        let url = public_url("https://example.com/baggage-policy?token=private#booking").unwrap();
        assert_eq!(url.as_str(), "https://example.com/baggage-policy");
        assert!(public_path(&url));
        for path in ["/booking/abc", "/ticket/AZ1234", "/%61bc", "/reset/secret"] {
            let url = public_url(&format!("https://example.com{path}")).unwrap();
            assert!(!public_path(&url), "{path}");
        }
    }

    // A real one-request fixture socket, reachable only inside this test.
    // Production constructs the pinned, public-only client before calling
    // the same response/redirect reader.
    async fn fixture(response: &'static str) -> (Url, tokio::task::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = Url::parse(&format!("http://{}/policy", listener.local_addr().unwrap())).unwrap();
        let handle = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut received = Vec::new();
            while !received.ends_with(b"\r\n\r\n") && received.len() < 4096 {
                received.push(stream.read_u8().await.unwrap());
            }
            stream.write_all(response.as_bytes()).await.unwrap();
            String::from_utf8(received).unwrap()
        });
        (url, handle)
    }

    #[tokio::test]
    async fn page_reads_only_the_document_and_extracts_citable_text() {
        tokio::time::timeout(Duration::from_secs(5), async {
            let (url, request) = fixture(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n<h1>Baggage</h1><p>One bag is included.</p><script>bad()</script><img src='/pixel'>",
            ).await;
            let client = Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none()).build().unwrap();
            let (_, mime, body) = read_response(&client, url, false).await.unwrap();
            let excerpt = page_text(&mime, &body).unwrap();
            assert!(excerpt.contains("One bag is included."));
            assert!(!excerpt.contains("bad()"));
            let request = request.await.unwrap().to_ascii_lowercase();
            assert!(request.starts_with("get /policy http/"));
            for header in ["cookie:", "authorization:", "referer:"] {
                assert!(!request.contains(header));
            }
        }).await.unwrap();
    }

    #[tokio::test]
    async fn redirects_and_inaccessible_pages_fail_closed() {
        tokio::time::timeout(Duration::from_secs(5), async {
            let client = Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none()).build().unwrap();
            for response in [
                "HTTP/1.1 302 Found\r\nLocation: https://169.254.169.254/\r\nContent-Length: 0\r\n\r\n",
                "HTTP/1.1 302 Found\r\nLocation: /policy?token=private\r\nContent-Length: 0\r\n\r\n",
                "HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n",
            ] {
                let (url, request) = fixture(response).await;
                assert!(read_response(&client, url, false).await.is_err());
                request.await.unwrap();
            }
            let (url, request) = fixture(
                "HTTP/1.1 302 Found\r\nLocation: https://example.com/nostr.json\r\nContent-Length: 0\r\n\r\n",
            ).await;
            assert!(read_response(&client, url, true).await.is_err());
            request.await.unwrap();
        }).await.unwrap();
    }
}
