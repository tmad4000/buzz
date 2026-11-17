import { invoke } from "@tauri-apps/api/core";
import type { setupExchangeRequest, setupPollRequest } from "../setup-link";

export type SetupBrokerReply = {
  status: number;
  retryAfterSeconds: number | null;
  body: Record<string, unknown> | null;
};

function reply(value: unknown): SetupBrokerReply {
  if (!value || typeof value !== "object")
    throw Error("Setup broker unavailable");
  const result = value as Record<string, unknown>;
  if (
    !Number.isInteger(result.status) ||
    (result.status as number) < 100 ||
    (result.status as number) > 599
  )
    throw Error("Setup broker unavailable");
  const retry = result.retryAfterSeconds;
  const retryAfterSeconds =
    typeof retry === "number" &&
    Number.isInteger(retry) &&
    retry >= 1 &&
    retry <= 60
      ? retry
      : null;
  if (result.status !== 200)
    return { status: result.status as number, retryAfterSeconds, body: null };
  if (
    !result.body ||
    typeof result.body !== "object" ||
    Array.isArray(result.body)
  )
    throw Error("Setup broker unavailable");
  return {
    status: 200,
    retryAfterSeconds,
    body: result.body as Record<string, unknown>,
  };
}

/** Public key retrieval is restricted to the fixed native ID transport; callers still validate its JWK. */
export async function fetchSetupBrokerPublicKey(): Promise<SetupBrokerReply> {
  try {
    return reply(await invoke("setup_broker_public_key"));
  } catch {
    throw Error("Setup broker unavailable");
  }
}

type Proof = Awaited<ReturnType<typeof setupPollRequest>>;
type Exchange = Awaited<ReturnType<typeof setupExchangeRequest>>;

export function requestSetupBroker(
  operation: "authorization" | "resume",
  body: Proof,
): Promise<SetupBrokerReply>;
export function requestSetupBroker(
  operation: "exchange",
  body: Exchange,
): Promise<SetupBrokerReply>;
/** Private exchange data is an IPC/HTTPS POST body. There is no caller-selected URL or header. */
export async function requestSetupBroker(
  operation: "authorization" | "resume" | "exchange",
  body: Proof | Exchange,
): Promise<SetupBrokerReply> {
  try {
    return reply(await invoke("setup_broker_request", { operation, body }));
  } catch {
    throw Error("Setup broker unavailable");
  }
}
