/** Setup URLs contain only a non-authorizing invitation reference, never a SAS/session key. */
export function parseSetupLink(input: string): string | null {
  if (typeof input !== "string" || input.length > 512 || /\s/.test(input)) return null;
  try {
    const url = new URL(input);
    const native =
      url.protocol === "buzz-ideaflow:" &&
      url.hostname === "setup" &&
      url.pathname === "";
    const web =
      url.protocol === "https:" &&
      url.hostname === "setup.ideaflow.app" &&
      url.pathname === "/v1/buzz/pair";
    if (
      (!native && !web) ||
      url.username ||
      url.password ||
      url.port ||
      url.search
    )
      return null;
    const fragment = new URLSearchParams(url.hash.slice(1));
    if ([...fragment.keys()].length !== 1) return null;
    const code = fragment.get("c");
    return code &&
      /^[A-Za-z0-9_-]{43}$/.test(code) &&
      code === base64url(decode(code))
      ? code
      : null;
  } catch {
    return null;
  }
}

type PublicDeviceKey = { kty: "EC"; crv: "P-256"; x: string; y: string };

/** Sensitive local state: persist only through the native secure store, never preferences or URLs. */
export type SetupAttempt = {
  id: string;
  nonce: string;
  privateKey: JsonWebKey;
  publicKey: PublicDeviceKey;
  thumbprint: string;
  pkceVerifier: string;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function decode(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > 32768)
    throw Error("setup_unavailable");
  const bytes = Uint8Array.from(
    atob(value.replaceAll("-", "+").replaceAll("_", "/")),
    (c) => c.charCodeAt(0),
  );
  if (base64url(bytes) !== value) throw Error("setup_unavailable");
  return bytes;
}

async function digest(value: string): Promise<string> {
  return base64url(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(value)),
    ),
  );
}

function opaque(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

/** Create a fresh device proof key and PKCE transaction. No network request or ID grant is made. */
export async function createSetupAttempt(): Promise<SetupAttempt> {
  const keys = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const exported = await crypto.subtle.exportKey("jwk", keys.publicKey);
  if (!exported.x || !exported.y) throw Error("setup_unavailable");
  const publicKey: PublicDeviceKey = {
    kty: "EC",
    crv: "P-256",
    x: exported.x,
    y: exported.y,
  };
  const thumbprint = await digest(
    JSON.stringify({ crv: "P-256", kty: "EC", x: exported.x, y: exported.y }),
  );
  return {
    id: opaque(),
    nonce: opaque(),
    privateKey: await crypto.subtle.exportKey("jwk", keys.privateKey),
    publicKey,
    thumbprint,
    pkceVerifier: opaque(),
  };
}

/** Sign only the broker's domain-separated setup transaction operations. */
export async function signSetupProof(
  attempt: SetupAttempt,
  operation: "prepare" | "authorization" | "exchange" | "resume",
  binding: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "jwk",
    attempt.privateKey,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const message = JSON.stringify([
    "ideaflow-setup-v1",
    operation,
    attempt.id,
    attempt.nonce,
    attempt.thumbprint,
    binding,
  ]);
  return base64url(
    new Uint8Array(
      await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        key,
        encoder.encode(message),
      ),
    ),
  );
}

/** Build the device-bound admission request; callers must authenticate to the fixed Ideaflow ID origin. */
export async function setupAdmission(
  attempt: SetupAttempt,
  code: string,
  clientId: string,
  deviceLabel: string,
) {
  if (
    parseSetupLink(`buzz-ideaflow://setup#c=${code}`) !== code ||
    !clientId ||
    clientId.length > 80 ||
    !/^[^\p{C}]{1,80}$/u.test(deviceLabel)
  )
    throw Error("setup_unavailable");
  const pkceChallenge = await digest(attempt.pkceVerifier);
  const binding = await digest(JSON.stringify([code, clientId, pkceChallenge]));
  return {
    code,
    clientId,
    deviceLabel,
    devicePublicKey: attempt.publicKey,
    pkceChallenge,
    nonce: attempt.nonce,
    attemptId: attempt.id,
    signature: await signSetupProof(attempt, "prepare", binding),
  };
}

type SetupEnvelope = {
  version: number;
  ephemeralKey: JsonWebKey;
  salt: string;
  iv: string;
  aad: string;
  ciphertext: string;
  tag: string;
};

/** Decrypt and authenticate a broker envelope using a separately trusted ID signing key.
 * Unsupported WebCrypto algorithms fail closed; Apple support still requires native qualification.
 * The caller must separately validate the returned manifest's issuer, subject, endpoint, scope and expiry.
 */
export async function openSetupEnvelope(
  attempt: SetupAttempt,
  envelope: SetupEnvelope,
  expectedGrantId: string,
  trustedSigningKey: JsonWebKey,
): Promise<Record<string, unknown>> {
  try {
    if (
      envelope.version !== 1 ||
      !expectedGrantId ||
      trustedSigningKey.kty !== "OKP" ||
      trustedSigningKey.crv !== "Ed25519" ||
      trustedSigningKey.d
    )
      throw Error();
    const aad = decode(envelope.aad);
    if (
      decoder.decode(aad) !==
      `ideaflow-setup-v1:${expectedGrantId}:${attempt.thumbprint}`
    )
      throw Error();
    const salt = decode(envelope.salt),
      iv = decode(envelope.iv),
      tag = decode(envelope.tag);
    if (salt.length !== 32 || iv.length !== 12 || tag.length !== 16)
      throw Error();
    const jwk = envelope.ephemeralKey;
    if (
      jwk.kty !== "EC" ||
      jwk.crv !== "P-256" ||
      jwk.d ||
      !jwk.x ||
      !jwk.y ||
      decode(jwk.x).length !== 32 ||
      decode(jwk.y).length !== 32
    )
      throw Error();
    const privateKey = await crypto.subtle.importKey(
      "jwk",
      { ...attempt.privateKey, key_ops: ["deriveBits"] },
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveBits"],
    );
    const publicKey = await crypto.subtle.importKey(
      "jwk",
      { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y },
      { name: "ECDH", namedCurve: "P-256" },
      false,
      [],
    );
    const shared = new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: "ECDH", public: publicKey },
        privateKey,
        256,
      ),
    );
    let hkdf: CryptoKey;
    try {
      hkdf = await crypto.subtle.importKey("raw", shared, "HKDF", false, [
        "deriveKey",
      ]);
    } finally {
      shared.fill(0);
    }
    const key = await crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt,
        info: encoder.encode("ideaflow-setup-v1:manifest"),
      },
      hkdf,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );
    const ciphertext = decode(envelope.ciphertext);
    const combined = new Uint8Array(ciphertext.length + tag.length);
    combined.set(ciphertext);
    combined.set(tag, ciphertext.length);
    const plaintext = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv, additionalData: aad, tagLength: 128 },
        key,
        combined,
      ),
    );
    try {
      const signed = JSON.parse(decoder.decode(plaintext));
      const payload = decode(signed.payload),
        signature = decode(signed.signature);
      const signingKey = await crypto.subtle.importKey(
        "jwk",
        trustedSigningKey,
        "Ed25519",
        false,
        ["verify"],
      );
      if (
        signature.length !== 64 ||
        !(await crypto.subtle.verify("Ed25519", signingKey, signature, payload))
      )
        throw Error();
      const manifest = JSON.parse(decoder.decode(payload));
      if (
        !manifest ||
        Array.isArray(manifest) ||
        typeof manifest !== "object" ||
        manifest.grantId !== expectedGrantId ||
        manifest.deviceThumbprint !== attempt.thumbprint
      )
        throw Error();
      return manifest;
    } finally {
      plaintext.fill(0);
    }
  } catch {
    // Never attach a URL, key, authorization code, plaintext or crypto exception to this error.
    throw Error("setup_unavailable");
  }
}
