use nostr::{nips::nip44, Keys, PublicKey};

/// Decrypt the fixed private bootstrap with the active local signing identity.
/// Real section names and channel IDs are never plaintext in the public repo.
pub(crate) fn load(keys: &Keys) -> Result<String, String> {
    let seed: serde_json::Value =
        serde_json::from_str(include_str!("commands/sidebar_sections_seed.json"))
            .map_err(|e| format!("invalid sidebar bootstrap: {e}"))?;
    let sender = seed["sender"].as_str().ok_or("missing bootstrap sender")?;
    let ciphertext = seed["ciphertext"]
        .as_str()
        .ok_or("missing bootstrap ciphertext")?;
    decrypt_sidebar_defaults(keys, sender, ciphertext)
}

fn decrypt_sidebar_defaults(keys: &Keys, sender: &str, ciphertext: &str) -> Result<String, String> {
    let sender =
        PublicKey::from_hex(sender).map_err(|e| format!("invalid bootstrap sender: {e}"))?;
    nip44::decrypt(keys.secret_key(), &sender, ciphertext)
        .map_err(|e| format!("sidebar bootstrap decrypt failed: {e}"))
}

#[cfg(test)]
mod sidebar_defaults_tests {
    use super::{decrypt_sidebar_defaults, load};
    use nostr::{nips::nip44, Keys};

    #[test]
    fn bundled_bootstrap_rejects_an_unrelated_identity() {
        assert!(load(&Keys::generate()).is_err());
    }

    #[test]
    fn only_the_recipient_can_decrypt_the_bootstrap() {
        let sender = Keys::generate();
        let recipient = Keys::generate();
        let ciphertext = nip44::encrypt(
            sender.secret_key(),
            &recipient.public_key(),
            "private sidebar",
            nip44::Version::V2,
        )
        .unwrap();
        assert_eq!(
            decrypt_sidebar_defaults(&recipient, &sender.public_key().to_hex(), &ciphertext)
                .unwrap(),
            "private sidebar"
        );
        assert!(decrypt_sidebar_defaults(
            &Keys::generate(),
            &sender.public_key().to_hex(),
            &ciphertext
        )
        .is_err());
        assert!(decrypt_sidebar_defaults(&recipient, "invalid", &ciphertext).is_err());
    }
}
