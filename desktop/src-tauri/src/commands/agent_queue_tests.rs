use super::*;
fn fixture() -> serde_json::Value {
    serde_json::json!({"v":1,"serverId":SERVER,"agentId":ROOT,"observedAt":1000,"verifiedAt":1000,
        "availability":"ok","rootState":"running","depth":1,"oldestCreatedAt":900,
        "items":[{"id":"1".repeat(64),"source":"jacob-dm","createdAt":900,"preview":"Jacob DM request","state":"queued","stateObservedAt":900}],
        "recent":[],"omitted":0,"complete":true})
}
#[test]
fn strict_queue_snapshot_accepts_success_and_retained_unavailable_clock() {
    assert!(parse_snapshot(&fixture().to_string(), 1000).is_ok());
    let mut v = fixture();
    v["availability"] = "unavailable".into();
    v["rootState"] = "unknown".into();
    v["depth"] = serde_json::Value::Null;
    v["oldestCreatedAt"] = serde_json::Value::Null;
    v["items"] = serde_json::json!([]);
    v["complete"] = false.into();
    v["observedAt"] = 1100.into();
    let got = parse_snapshot(&v.to_string(), 1100).unwrap();
    assert_eq!(got.verified_at, Some(1000));
}
#[test]
fn strict_queue_snapshot_rejects_private_text_fields_placement_and_inferred_states() {
    for (field, value) in [
        ("preview", serde_json::json!("literal private agent body")),
        ("state", serde_json::json!("steered")),
        ("source", serde_json::json!("unproved")),
        ("stateObservedAt", serde_json::json!(899)),
        ("createdAt", serde_json::json!(1061)),
    ] {
        let mut v = fixture();
        v["items"][0][field] = value;
        assert!(parse_snapshot(&v.to_string(), 1000).is_err());
    }
    let mut v = fixture();
    v["privateBody"] = "x".into();
    assert!(parse_snapshot(&v.to_string(), 1000).is_err());
    let mut v = fixture();
    v["recent"] = v["items"].clone();
    assert!(parse_snapshot(&v.to_string(), 1000).is_err());
    let mut v = fixture();
    v.as_object_mut().unwrap().remove("verifiedAt");
    assert!(parse_snapshot(&v.to_string(), 1000).is_err());
}
#[test]
fn strict_queue_snapshot_rejects_bad_arithmetic_clocks_and_noncanonical_unavailable() {
    for (field, value) in [
        ("depth", serde_json::json!(1001)),
        ("omitted", serde_json::json!(1)),
        ("complete", serde_json::json!(false)),
        ("observedAt", serde_json::json!(1061)),
        ("verifiedAt", serde_json::json!(1001)),
        ("availability", serde_json::json!("unavailable")),
    ] {
        let mut v = fixture();
        v[field] = value;
        assert!(parse_snapshot(&v.to_string(), 1000).is_err());
    }
}
#[test]
fn narrow_receiver_rejects_other_keystore_identity_before_decrypt() {
    assert!(decrypt(&Keys::generate(), "{}").is_err());
}

#[test]
fn private_payload_helper_cross_author_v2_authenticates_and_rejects_wrong_counterparty() {
    let sender = Keys::generate();
    let receiver = Keys::generate();
    let other = Keys::generate();
    let ciphertext = nip44::encrypt(
        sender.secret_key(),
        &receiver.public_key(),
        fixture().to_string(),
        nip44::Version::V2,
    )
    .unwrap();
    let got = decrypt_payload(&receiver, &sender.public_key(), &ciphertext, 1000).unwrap();
    assert_eq!(got.depth, Some(1));
    assert!(decrypt_payload(&receiver, &other.public_key(), &ciphertext, 1000).is_err());
}
