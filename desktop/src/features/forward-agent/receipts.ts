import { ForwardMarkerError } from "./delivery";
import { useSyncExternalStore } from "react";
export type ForwardReceipt = {
  sourceChannelId: string;
  sourceId: string;
  targetChannelId: string;
  targetId: string;
  label: string;
  revision?: string;
};
const listeners = new Set<() => void>();
const acknowledged = new Map<string, ForwardReceipt>();
const pending = new Map<string, Promise<ForwardReceipt>>();
const key = (scope: string) => `buzz.forward-agent-receipts.v1:${scope}`;
const id = (scope: string, source: string, target: string, revision = "") =>
  `${scope}:${source}:${target}:${revision}`;
const valid = (v: unknown): v is ForwardReceipt =>
  typeof v === "object" &&
  v !== null &&
  ["sourceChannelId", "sourceId", "targetChannelId", "targetId", "label"].every(
    (k) => typeof (v as Record<string, unknown>)[k] === "string",
  );
function stored(scope: string): ForwardReceipt[] {
  const raw = globalThis.localStorage.getItem(key(scope));
  if (!raw) return [];
  if (raw.length > 1_048_576)
    throw new Error("Forward receipt history is too large.");
  const rows: unknown = JSON.parse(raw);
  if (!Array.isArray(rows) || rows.length > 1000 || !rows.every(valid))
    throw new Error("Forward receipt history is unreadable.");
  return rows;
}
export function forwardReceipts(scope: string, sourceId: string) {
  const rows = [
    ...stored(scope),
    ...[...acknowledged.entries()]
      .filter(([k]) => k.startsWith(`${scope}:`))
      .map(([, r]) => r),
  ];
  const visible = new Map<string, ForwardReceipt>();
  for (const receipt of rows) {
    if (receipt.sourceId === sourceId)
      visible.set(receipt.targetChannelId, receipt);
  }
  return [...visible.values()];
}
function save(scope: string, r: ForwardReceipt) {
  const rows = stored(scope).filter(
    (x) =>
      !(
        x.sourceId === r.sourceId &&
        x.targetChannelId === r.targetChannelId &&
        (x.revision ?? "") === (r.revision ?? "")
      ),
  );
  globalThis.localStorage.setItem(
    key(scope),
    JSON.stringify([...rows, r].slice(-1000)),
  );
  if (!stored(scope).some((x) => x.targetId === r.targetId))
    throw new Error("Could not verify saved forward marker.");
  acknowledged.delete(id(scope, r.sourceId, r.targetChannelId, r.revision));
  for (const fn of listeners) fn();
}
/** Single-flight per source/destination. Retry an acknowledged marker write without resending. */
export async function forwardOnce(
  scope: string,
  sourceChannelId: string,
  sourceId: string,
  targetChannelId: string,
  label: string,
  send: () => Promise<{ id: string; pubkey: string; pending?: boolean }>,
  signer: string,
  revision = "",
): Promise<ForwardReceipt> {
  const k = id(scope, sourceId, targetChannelId, revision);
  const existing =
    acknowledged.get(k) ??
    stored(scope).find(
      (r) =>
        r.sourceId === sourceId &&
        r.targetChannelId === targetChannelId &&
        (r.revision ?? "") === revision,
    );
  if (existing) {
    try {
      save(scope, existing);
    } catch {
      throw new ForwardMarkerError(
        "Forward sent, but its marker could not be saved. Do not send again; check the target.",
      );
    }
    return existing;
  }
  const inflight = pending.get(k);
  if (inflight) return inflight;
  if (pending.size >= 50 || acknowledged.size >= 1000)
    throw new Error("Resolve pending forwards before sending more.");
  const operation = Promise.resolve().then(async () => {
    const event = await send();
    if (
      event.pending ||
      event.pubkey !== signer ||
      !/^[0-9a-f]{64}$/.test(event.id)
    )
      throw new Error(
        "Forward acknowledgement did not match the captured signer.",
      );
    const receipt = {
      sourceChannelId,
      sourceId,
      targetChannelId,
      targetId: event.id,
      label,
      revision,
    };
    acknowledged.set(k, receipt);
    for (const fn of listeners) fn();
    try {
      save(scope, receipt);
    } catch {
      throw new ForwardMarkerError(
        "Forward sent, but its marker could not be saved. Do not send again; check the target.",
      );
    }
    return receipt;
  });
  pending.set(k, operation);
  try {
    return await operation;
  } finally {
    pending.delete(k);
  }
}
let revision = 0;
function subscribe(fn: () => void) {
  const wrapped = () => {
    revision++;
    fn();
  };
  listeners.add(wrapped);
  const storage = () => wrapped();
  globalThis.window?.addEventListener("storage", storage);
  return () => {
    listeners.delete(wrapped);
    globalThis.window?.removeEventListener("storage", storage);
  };
}
export function useForwardReceiptRevision() {
  return useSyncExternalStore(
    subscribe,
    () => revision,
    () => 0,
  );
}

/** Edited source text is a distinct forward; repeat clicks on the same text reuse its receipt. */
export async function forwardRevision(content: string): Promise<string> {
  const hash = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(content),
  );
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
