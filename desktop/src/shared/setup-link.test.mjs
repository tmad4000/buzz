import assert from "node:assert/strict";
import {
  createCipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  sign,
  verify,
} from "node:crypto";
import { test } from "node:test";
import {
  createSetupAttempt,
  openSetupAuthorization,
  openSetupEnvelope,
  parseSetupLink,
  setupAdmission,
  setupConfirmationCode,
  setupExchangeRequest,
  setupPollRequest,
  setupReviewUrl,
  signSetupProof,
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
    `buzz-ideaflow://setup?#c=${code}`,
    `buzz-ideaflow://setup#%63=${code}`,
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
function envelopeFor(attempt, signer, manifest, aadBinding = manifest) {
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
      `ideaflow-setup-v1:${aadBinding.grantId}:${aadBinding.deviceThumbprint}`,
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

test("review URL contains only the exact public admission shape and refuses secret-bearing objects", async () => {
  const attempt = await createSetupAttempt(),
    request = await setupAdmission(
      attempt,
      randomBytes(32).toString("base64url"),
      "synthetic-client",
      "Synthetic phone",
    );
  const decode = (url) =>
    JSON.parse(Buffer.from(new URL(url).hash.slice(3), "base64url").toString());
  const url = new URL(setupReviewUrl(request));
  assert.equal(
    url.origin + url.pathname,
    "https://id.ideaflow.app/setup/receive",
  );
  assert.equal(url.search, "");
  assert.deepEqual(decode(url), request);
  for (const bad of [
    { ...request, pkceVerifier: attempt.pkceVerifier },
    { ...request, privateKey: attempt.privateKey },
    { ...request, callbackUrl: "https://evil.invalid" },
    { ...request, clientId: undefined },
    {
      ...request,
      devicePublicKey: {
        ...request.devicePublicKey,
        d: "private-not-permitted",
      },
    },
    null,
  ])
    assert.throws(
      () => setupReviewUrl(bad),
      (error) => error.message === "setup_unavailable",
    );
  const inherited = Object.assign(
    Object.create({
      toJSON() {
        throw Error("unsafe input serializer must not run");
      },
    }),
    request,
  );
  assert.deepEqual(decode(setupReviewUrl(inherited)), request);
});

test("poll, resume, exchange and displayed ID code use the broker's exact device bindings", async () => {
  const attempt = await createSetupAttempt(),
    authorizationCode = randomBytes(32).toString("base64url"),
    key = createPublicKey({ key: attempt.publicKey, format: "jwk" });
  const sha = (value) => createHash("sha256").update(value).digest("base64url");
  for (const operation of ["authorization", "resume"]) {
    const body = await setupPollRequest(attempt, operation),
      message = Buffer.from(
        JSON.stringify([
          "ideaflow-setup-v1",
          operation,
          attempt.id,
          attempt.nonce,
          attempt.thumbprint,
          attempt.nonce,
        ]),
      );
    assert.equal(
      verify(
        "sha256",
        message,
        { key, dsaEncoding: "ieee-p1363" },
        Buffer.from(body.signature, "base64url"),
      ),
      true,
    );
    assert.deepEqual(Object.keys(body).sort(), ["attemptId", "signature"]);
  }
  const exchange = await setupExchangeRequest(attempt, authorizationCode),
    binding = sha(JSON.stringify([authorizationCode, attempt.pkceVerifier]));
  assert.equal(
    verify(
      "sha256",
      Buffer.from(
        JSON.stringify([
          "ideaflow-setup-v1",
          "exchange",
          attempt.id,
          attempt.nonce,
          attempt.thumbprint,
          binding,
        ]),
      ),
      { key, dsaEncoding: "ieee-p1363" },
      Buffer.from(exchange.signature, "base64url"),
    ),
    true,
  );
  assert.equal(
    await setupConfirmationCode(attempt),
    sha(JSON.stringify(["sas", attempt.id, attempt.nonce, attempt.thumbprint]))
      .slice(0, 10)
      .toUpperCase(),
  );
  await assert.rejects(
    setupPollRequest(attempt, "arbitrary"),
    /setup_unavailable/,
  );
  await assert.rejects(
    setupExchangeRequest(attempt, "short"),
    /setup_unavailable/,
  );
});

test("authorization opening checks signed inner bindings, exact fields and a bounded live deadline", async () => {
  const attempt = await createSetupAttempt(),
    signer = generateKeyPairSync("ed25519"),
    trusted = signer.publicKey.export({ format: "jwk" }),
    now = Date.now();
  const value = {
    grantId: "authorization:" + attempt.id,
    deviceThumbprint: attempt.thumbprint,
    attemptId: attempt.id,
    authorizationCode: randomBytes(32).toString("base64url"),
    expiresAt: new Date(now + 30000).toISOString(),
  };
  assert.deepEqual(
    await openSetupAuthorization(
      attempt,
      envelopeFor(attempt, signer, value),
      trusted,
      now,
    ),
    { authorizationCode: value.authorizationCode, expiresAt: value.expiresAt },
  );
  for (const bad of [
    { ...value, attemptId: "wrong" },
    { ...value, grantId: "authorization:wrong" },
    { ...value, deviceThumbprint: "wrong" },
    { ...value, privilegedCommand: "not permitted" },
    { ...value, expiresAt: new Date(now - 1).toISOString() },
    { ...value, expiresAt: new Date(now + 720000).toISOString() },
    { ...value, authorizationCode: value.authorizationCode.slice(0, 42) + "R" },
  ])
    await assert.rejects(
      openSetupAuthorization(
        attempt,
        envelopeFor(attempt, signer, bad, value),
        trusted,
        now,
      ),
      (error) => error.message === "setup_unavailable",
    );
});
