use super::*;
fn fixtures() -> serde_json::Value {
    serde_json::from_str(include_str!(
        "../../../src/features/agent-fleet/contract-fixtures.json"
    ))
    .unwrap()
}
#[test]
fn frozen_valid_and_invalid_payload_vectors_match_native_validator() {
    let data = fixtures();
    for case in data["validPayloads"].as_array().unwrap() {
        let v = &case["payload"];
        assert!(
            parse_snapshot(&v.to_string(), v["observedAt"].as_u64().unwrap()).is_ok(),
            "{}",
            case["name"]
        );
    }
    for case in data["invalidPayloads"].as_array().unwrap() {
        let v = &case["payload"];
        assert!(
            parse_snapshot(&v.to_string(), v["observedAt"].as_u64().unwrap()).is_err(),
            "{}",
            case["name"]
        );
    }
}
#[test]
fn partial_root_outside_prefix_is_not_forced_into_counts() {
    let data = fixtures();
    let mut v = data["validPayloads"][1]["payload"].clone();
    let at = v["observedAt"].as_u64().unwrap();
    assert_eq!(v["gcp"]["running"], 0);
    assert_eq!(v["root"]["state"], "running");
    assert!(parse_snapshot(&v.to_string(), at).is_ok());
    v["availability"] = "ok".into();
    v["coverage"]["complete"] = true.into();
    v["coverage"]["total"] = 1.into();
    assert!(parse_snapshot(&v.to_string(), at).is_err());
}
#[test]
fn queue_age_validated_at_fleet_observation_not_later_client_receive_time() {
    let data = fixtures();
    let v = &data["validPayloads"][3]["payload"];
    let at = v["observedAt"].as_u64().unwrap();
    assert!(parse_snapshot(&v.to_string(), at + 30).is_ok());
    let mut bad = v.clone();
    bad["root"]["queue"]["observedAt"] = (at - 121).into();
    bad["root"]["queue"]["verifiedAt"] = (at - 121).into();
    assert!(parse_snapshot(&bad.to_string(), at).is_err());
}
#[test]
fn strict_limits_required_nullable_fields_and_clock_bounds() {
    let data = fixtures();
    let base = &data["validPayloads"][0]["payload"];
    let at = base["observedAt"].as_u64().unwrap();
    let mut missing = base.clone();
    missing.as_object_mut().unwrap().remove("verifiedAt");
    assert!(parse_snapshot(&missing.to_string(), at).is_err());
    let mut future = base.clone();
    future["observedAt"] = (at + 61).into();
    future["verifiedAt"] = (at + 61).into();
    assert!(parse_snapshot(&future.to_string(), at).is_err());
    let mut max = base.clone();
    max["observedAt"] = (MAX_TIME + 1).into();
    max["verifiedAt"] = (MAX_TIME + 1).into();
    assert!(parse_snapshot(&max.to_string(), MAX_TIME + 1).is_err());
    assert!(parse_snapshot(&" ".repeat(4097), at).is_err());
}
#[test]
fn other_active_identity_cannot_use_the_narrow_receiver() {
    assert!(decrypt(&Keys::generate(), "{}").is_err());
}

#[test]
fn absolute_receiver_clock_rejects_chained_future_timestamps() {
    let data = fixtures();
    let mut v = data["validPayloads"][0]["payload"].clone();
    let now = v["observedAt"].as_u64().unwrap();
    v["observedAt"] = (now + 61).into();
    v["verifiedAt"] = (now + 61).into();
    assert!(parse_snapshot_at(&v.to_string(), now + 60, now).is_err());
    let mut v = data["validPayloads"][0]["payload"].clone();
    v["root"]["queue"] = serde_json::json!({"availability":"ok","depth":1,"observedAt":now+61,"verifiedAt":now+61,"sourceEventId":"a".repeat(64)});
    assert!(parse_snapshot_at(&v.to_string(), now, now).is_err());
}
