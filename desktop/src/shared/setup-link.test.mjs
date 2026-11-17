import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createPublicKey,
  createPrivateKey,
  verify,
  generateKeyPairSync,
  diffieHellman,
  hkdfSync,
  createCipheriv,
  sign,
  randomBytes,
} from "node:crypto";
import {
  createSetupAttempt,
  parseSetupLink,
  setupAdmission,
  signSetupProof,
  openSetupEnvelope,
} from "./setup-link.ts";

test("setup links accept only the fork and owned landing with a single opaque reference", () => {
  const code = Buffer.alloc(32, 17).toString("base64url");
  for (const link of [
    `buzz-ideaflow://setup#c=${code}`,
    `https://setup.ideaflow.app/v1/buzz/pair#c=${code}`,
  ])
    assert.equal(parseSetupLink(link), code);
  for (const link of [
    `buzz://setup#c=${code}`,
    `buzz-ideaflow://setup/path#c=${code}`,
    `buzz-ideaflow://setup?secret=abc#c=${code}`,
    `buzz-ideaflow://setup#c=${code}&c=${code}`,
    `buzz-ideaflow://setup#c=${code}&secret=abc`,
    `https://setup.ideaflow.app.attacker.invalid/v1/buzz/pair#c=${code}`,
    `https://person@setup.ideaflow.app/v1/buzz/pair#c=${code}`,
    `nostrpair://key?secret=${code}`,
    `buzz-ideaflow://setup#c=${code.slice(0, -1)}R`,
  ])
    assert.equal(parseSetupLink(link), null);
});

test("WebCrypto device admission matches broker P1363 proof and RFC7638 thumbprint", async () => {
  const attempt = await createSetupAttempt();
  const code = randomBytes(32).toString("base64url"),
    body = await setupAdmission(
      attempt,
      code,
      "synthetic-public-client",
      "Synthetic phone",
    );
  const hash = async (value) =>
    Buffer.from(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ).toString("base64url");
  assert.equal(body.pkceChallenge, await hash(attempt.pkceVerifier));
  const binding = await hash(
    JSON.stringify([code, body.clientId, body.pkceChallenge]),
  );
  const message = Buffer.from(
    JSON.stringify([
      "ideaflow-setup-v1",
      "prepare",
      attempt.id,
      attempt.nonce,
      attempt.thumbprint,
      binding,
    ]),
  );
  const key = createPublicKey({ key: attempt.publicKey, format: "jwk" });
  assert.equal(Buffer.from(body.signature, "base64url").length, 64);
  assert.equal(
    verify(
      "sha256",
      message,
      { key, dsaEncoding: "ieee-p1363" },
      Buffer.from(body.signature, "base64url"),
    ),
    true,
  );
  assert.equal(
    verify(
      "sha256",
      Buffer.concat([message, Buffer.from("changed")]),
      { key, dsaEncoding: "ieee-p1363" },
      Buffer.from(body.signature, "base64url"),
    ),
    false,
  );
  assert.notEqual((await createSetupAttempt()).thumbprint, attempt.thumbprint);
  assert.equal(
    Buffer.from(
      await signSetupProof(attempt, "resume", attempt.nonce),
      "base64url",
    ).length,
    64,
  );
  await assert.rejects(
    setupAdmission(attempt, code, "client", "Phone\nInjected"),
    /setup_unavailable/,
  );
});

// Independent Node implementation of the broker's fixed P-256/HKDF/AES-GCM + Ed25519 envelope.
function envelopeFor(attempt, signer, manifest) {
  const payload = Buffer.from(JSON.stringify(manifest));
  const signed = Buffer.from(
    JSON.stringify({
      payload: payload.toString("base64url"),
      signature: sign(null, payload, signer.privateKey).toString("base64url"),
    }),
  );
  const ephemeral = generateKeyPairSync("ec", { namedCurve: "prime256v1" }),
    salt = randomBytes(32),
    iv = randomBytes(12);
  const shared = diffieHellman({
    privateKey: ephemeral.privateKey,
    publicKey: createPublicKey({ key: attempt.publicKey, format: "jwk" }),
  });
  const key = Buffer.from(
    hkdfSync("sha256", shared, salt, "ideaflow-setup-v1:manifest", 32),
  );
  const cipher = createCipheriv("aes-256-gcm", key, iv),
    aad = Buffer.from(
      `ideaflow-setup-v1:${manifest.grantId}:${manifest.deviceThumbprint}`,
    );
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(signed), cipher.final()]);
  shared.fill(0);
  key.fill(0);
  return {
    version: 1,
    ephemeralKey: ephemeral.publicKey.export({ format: "jwk" }),
    salt: salt.toString("base64url"),
    iv: iv.toString("base64url"),
    aad: aad.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
  };
}

test("envelopes require the recipient, expected grant, trusted signing key and intact ciphertext", async () => {
  const attempt = await createSetupAttempt(),
    signer = generateKeyPairSync("ed25519"),
    other = generateKeyPairSync("ed25519");
  const trusted = signer.publicKey.export({ format: "jwk" }),
    manifest = {
      grantId: `authorization:${attempt.id}`,
      deviceThumbprint: attempt.thumbprint,
      authorizationCode: "synthetic-test-code",
    };
  const envelope = envelopeFor(attempt, signer, manifest);
  assert.deepEqual(
    await openSetupEnvelope(attempt, envelope, manifest.grantId, trusted),
    manifest,
  );
  for (const [record, box, id, key] of [
    [await createSetupAttempt(), envelope, manifest.grantId, trusted],
    [attempt, envelope, "wrong-grant", trusted],
    [
      attempt,
      envelope,
      manifest.grantId,
      other.publicKey.export({ format: "jwk" }),
    ],
    [
      attempt,
      { ...envelope, tag: Buffer.alloc(16).toString("base64url") },
      manifest.grantId,
      trusted,
    ],
    [attempt, { ...envelope, version: 2 }, manifest.grantId, trusted],
    [
      attempt,
      envelopeFor(attempt, signer, { ...manifest, deviceThumbprint: "wrong" }),
      manifest.grantId,
      trusted,
    ],
  ])
    await assert.rejects(
      openSetupEnvelope(record, box, id, key),
      (error) => error.message === "setup_unavailable",
    );
  // A private JWK is never accepted in the trusted public signing-key slot.
  await assert.rejects(
    openSetupEnvelope(
      attempt,
      envelope,
      manifest.grantId,
      createPrivateKey(
        signer.privateKey.export({ format: "pem", type: "pkcs8" }),
      ).export({ format: "jwk" }),
    ),
    /setup_unavailable/,
  );
});
