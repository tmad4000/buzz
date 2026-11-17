# Buzz Ideaflow setup links

This source increment implements desktop protocol helpers only. It is not connected to the native deep-link handler or UI, does not register a client, and does not enable pairing. The current manual SAS flow is unchanged. No version or bundle number is changed.

The accepted invitation is `buzz-ideaflow://setup#c=<opaque reference>` or the owned HTTPS landing route. A link never contains the existing Nostr pairing session secret, an ID token, authorization code, device private key, PKCE verifier, or Buzz identity key. Official Buzz and arbitrary endpoints are rejected.

Each receiving transaction creates a P-256 proof key, RFC7638 thumbprint and PKCE verifier. The private record must be persisted through the native secure store before making an admission request; browser storage/preferences are not allowed. No secure-store integration is included yet. A registered public client and authenticated Ideaflow ID subject are still required by the broker.

Encrypted broker envelopes use P-256 ECDH, HKDF-SHA256 and AES-256-GCM, followed by Ed25519 signature verification against a separately trusted ID public key. Expected grant and device binding are checked. Callers must additionally check issuer, account subject, pre-approved endpoint/server, scope/settings and expiry before applying anything. The envelope's data cannot select its own trusted signing key or network endpoint.

These helpers do not start SAS pairing, transfer an identity, apply configuration or claim a connected device. The next integration must preserve existing manual/old devices and require the existing SAS confirmation. Ideaflow ID grant removal blocks future setup/configuration refresh; it cannot revoke a Buzz key already copied by SAS. The Buzz community relay is not controlled by this release. Remote signing is future design work, not this adapter.

Validation so far is Linux Node/WebCrypto only, including a separate interoperability receipt against the actual ID broker crypto implementation. Unsupported crypto fails closed. Native WebView/iOS compatibility, native secure storage, OAuth callback handling, cancellation/expiry recovery and Apple device acceptance remain unverified. Heavy/native builds must be serialized with the release owner and use an actually free authorized Apple slot.

No dependency changes. The current native client/endpoint registration operation is held while the Box release operator owns registrar coordination.
