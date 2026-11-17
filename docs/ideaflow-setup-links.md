# Buzz Ideaflow setup links

This source implements desktop protocol helpers and a default-off native invitation handoff. The native handler queues references for an explicit frontend acceptor; the actual setup UI, secure-store persistence, OAuth and SAS handoff are not wired. It does not register a client or enable pairing. The current manual SAS flow is unchanged. No version or bundle number is changed.

The accepted invitation is `buzz-ideaflow://setup#c=<opaque reference>` or the owned HTTPS landing route. A link never contains the existing Nostr pairing session secret, an ID token, authorization code, device private key, PKCE verifier, or Buzz identity key. Official Buzz and arbitrary endpoints are rejected.

Each receiving transaction creates a P-256 proof key, RFC7638 thumbprint and PKCE verifier. The private record must be persisted through the native secure store before making an admission request; browser storage/preferences are not allowed. No secure-store integration is included yet. A registered public client and authenticated Ideaflow ID subject are still required by the broker.

Encrypted broker envelopes use P-256 ECDH, HKDF-SHA256 and AES-256-GCM, followed by Ed25519 signature verification against a separately trusted ID public key. Expected grant and device binding are checked. Callers must additionally check issuer, account subject, pre-approved endpoint/server, scope/settings and expiry before applying anything. The envelope's data cannot select its own trusted signing key or network endpoint.

These helpers do not start SAS pairing, transfer an identity, apply configuration or claim a connected device. The next integration must preserve existing manual/old devices and require the existing SAS confirmation. Ideaflow ID grant removal blocks future setup/configuration refresh; it cannot revoke a Buzz key already copied by SAS. The Buzz community relay is not controlled by this release. Remote signing is future design work, not this adapter.

Validation so far is Linux Node/WebCrypto only, including a separate interoperability receipt against the actual ID broker crypto implementation. Unsupported crypto fails closed. Native WebView/iOS compatibility, native secure storage, OAuth callback handling, cancellation/expiry recovery and Apple device acceptance remain unverified. Heavy/native builds must be serialized with the release owner and use an actually free authorized Apple slot.

No dependency changes. The current native client/endpoint registration operation is held while the Box release operator owns registrar coordination.

## Native invitation handoff

The build-time `BUZZ_IDEAFLOW_SETUP_LINKS=1` gate is absent by default and excluded for separately named demo builds. Do not enable it for a release before the remaining setup flow and native qualification pass review. It is independent of the broker's default-off issuance flag; neither gate is changed by this source increment.

The existing cold/warm deep-link entry point recognizes only the fork's canonical `buzz-ideaflow://setup#c=...` shape. A four-entry process-owned queue deduplicates references, retains them for at most ten minutes locally, and removes only a matching head acknowledgement. Duplicate delivery does not renew that local retention. Local retention never extends the broker's original invitation deadline. An event announces availability without including the URL or reference. Deep-link parse/failure logs no longer print untrusted URLs, actions or parser errors.

The frontend handoff helper waits across mounts for an outstanding acceptor, passes an abort signal, and does not acknowledge failed, declined or stale acceptance. The acceptor must persist its device transaction in the native secure store before returning success and check cancellation after awaits. That persistence/UI implementation remains required. An explicit availability retry can recover after a failed acceptance. The process queue alone is not durable install recovery: use the broker's account-bound pending intent and a fresh invitation for that flow.

Eight focused frontend/protocol tests and an isolated strict TypeScript check pass on Linux. New Rust parser/queue regressions are written, and Rust formatting/syntax parsing passes, but Rust compilation/unit execution and full native integration checks are pending a coordinated build window. No native verification or release approval follows from JavaScript IPC mocks. No heavy build or Apple slot was started for this increment.
