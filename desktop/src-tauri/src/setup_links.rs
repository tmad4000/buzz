//! Default-off setup invitation handoff. No identity, credential or SAS changes occur here.

use std::{
    collections::VecDeque,
    sync::Mutex,
    time::{Duration, Instant},
};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use serde::Serialize;
use tauri::{Emitter, Manager, State};
use url::Url;

const CAPACITY: usize = 4;
const LOCAL_RETENTION: Duration = Duration::from_secs(600);

/// An invitation reference, not proof of authorization. Deliberately has no Debug implementation.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PendingSetupLink {
    id: String,
    code: String,
}

struct Entry {
    link: PendingSetupLink,
    received: Instant,
}

#[derive(Default)]
struct Queue(VecDeque<Entry>);

impl Queue {
    fn prune(&mut self, now: Instant) {
        self.0
            .retain(|entry| now.saturating_duration_since(entry.received) < LOCAL_RETENTION);
    }

    fn insert(&mut self, code: String, now: Instant) -> bool {
        self.prune(now);
        if self.0.iter().any(|entry| entry.link.code == code) {
            return true;
        }
        if self.0.len() >= CAPACITY {
            return false;
        }
        self.0.push_back(Entry {
            link: PendingSetupLink {
                id: uuid::Uuid::new_v4().to_string(),
                code,
            },
            received: now,
        });
        true
    }

    fn first(&mut self, now: Instant) -> Option<PendingSetupLink> {
        self.prune(now);
        self.0.front().map(|entry| entry.link.clone())
    }

    fn acknowledge(&mut self, id: &str, now: Instant) -> bool {
        self.prune(now);
        if self.0.front().is_some_and(|entry| entry.link.id == id) {
            self.0.pop_front();
            true
        } else {
            false
        }
    }
}

/// Process-owned, bounded cold/warm handoff queue, independent of the current Buzz community.
#[derive(Default)]
pub(crate) struct PendingSetupLinks(Mutex<Queue>);

/// New setup links are opt-in at build time and unavailable in separately named demo builds.
pub(crate) fn enabled() -> bool {
    option_env!("BUZZ_IDEAFLOW_SETUP_LINKS") == Some("1") && !crate::build_identity::is_demo_build()
}

fn invitation(url: &Url) -> Option<String> {
    if url.scheme() != "buzz-ideaflow"
        || url.host_str() != Some("setup")
        || !url.path().is_empty()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || url.query().is_some()
    {
        return None;
    }
    let code = url.fragment()?.strip_prefix("c=")?;
    if code.len() != 43 {
        return None;
    }
    let bytes = URL_SAFE_NO_PAD.decode(code).ok()?;
    if bytes.len() != 32 || URL_SAFE_NO_PAD.encode(bytes) != code {
        return None;
    }
    Some(code.to_owned())
}

/// Queue a validated reference only; neither opening nor acknowledging a link approves a device.
pub(crate) fn receive(app: &tauri::AppHandle, url: &Url) -> bool {
    if !enabled() {
        return false;
    }
    let Some(code) = invitation(url) else {
        return false;
    };
    let state = app.state::<PendingSetupLinks>();
    let Ok(mut queue) = state.0.lock() else {
        return false;
    };
    let accepted = queue.insert(code, Instant::now());
    drop(queue);
    if accepted {
        // Notification carries no URL, invitation, proof or identity material.
        let _ = app.emit("ideaflow-setup-link-available", ());
    }
    accepted
}

/// Inspect feature availability without accessing credentials or creating a transaction.
#[tauri::command]
pub(crate) fn ideaflow_setup_links_enabled() -> bool {
    enabled()
}

/// Peek the oldest reference. The frontend must durably accept it before explicit acknowledgement.
#[tauri::command]
pub(crate) fn take_pending_setup_link(
    state: State<'_, PendingSetupLinks>,
) -> Result<Option<PendingSetupLink>, String> {
    if !enabled() {
        return Ok(None);
    }
    state
        .0
        .lock()
        .map(|mut queue| queue.first(Instant::now()))
        .map_err(|_| "Setup handoff unavailable".to_owned())
}

/// Remove only the acknowledged head; stale handlers cannot discard a newer queued reference.
#[tauri::command]
pub(crate) fn acknowledge_pending_setup_link(
    id: String,
    state: State<'_, PendingSetupLinks>,
) -> Result<bool, String> {
    if !enabled() {
        return Ok(false);
    }
    state
        .0
        .lock()
        .map(|mut queue| queue.acknowledge(&id, Instant::now()))
        .map_err(|_| "Setup handoff unavailable".to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_canonical_fork_invitation_references_are_accepted() {
        let code = URL_SAFE_NO_PAD.encode([17u8; 32]);
        let parse = |value: String| invitation(&Url::parse(&value).unwrap());
        assert_eq!(
            parse(format!("buzz-ideaflow://setup#c={code}")),
            Some(code.clone())
        );
        for value in [
            format!("buzz://setup#c={code}"),
            format!("buzz-ideaflow://person@setup#c={code}"),
            format!("buzz-ideaflow://setup/path#c={code}"),
            format!("buzz-ideaflow://setup?#c={code}"),
            format!("buzz-ideaflow://setup?secret=x#c={code}"),
            format!("buzz-ideaflow://setup#c={code}&c={code}"),
            format!("buzz-ideaflow://setup#c={code}&secret=x"),
            format!("nostrpair://setup#c={code}"),
            format!("buzz-ideaflow://setup#c={}R", &code[..42]),
        ] {
            assert!(parse(value).is_none());
        }
    }

    #[test]
    fn queue_is_bounded_deduplicated_and_acknowledges_only_its_head() {
        let mut queue = Queue::default();
        let now = Instant::now();
        assert!(queue.insert("one".to_owned(), now));
        let first = queue.first(now).unwrap();
        assert!(queue.insert("one".to_owned(), now));
        assert_eq!(queue.first(now).unwrap().id, first.id);
        for code in ["two", "three", "four"] {
            assert!(queue.insert(code.to_owned(), now));
        }
        assert!(!queue.insert("overflow".to_owned(), now));
        assert!(!queue.acknowledge("stale", now));
        assert!(queue.acknowledge(&first.id, now));
        assert!(!queue.acknowledge(&first.id, now));
        assert_eq!(queue.first(now).unwrap().code, "two");
    }

    #[test]
    fn local_expiry_does_not_renew_on_duplicate_delivery() {
        let mut queue = Queue::default();
        let now = Instant::now();
        assert!(queue.insert("one".to_owned(), now));
        assert!(queue.insert("one".to_owned(), now + Duration::from_secs(590)));
        assert!(queue.first(now + LOCAL_RETENTION).is_none());
    }
}
