// Persist intent before publication. Never evict unresolved attempts or retry them.
export const HOLD_STORAGE_KEY = "buzz.agent-control-holds.v1";
type Revision = {eventId: string; createdAt: number};
type Hold = { intentAfter?: number; revision?: Revision; id: string; intent: "stop" | "continue"; baseline: string; status: "sending" | "sent" | "unknown" };
const listeners = new Set<() => void>();
export const subscribeHolds = (notify: () => void) => {
  listeners.add(notify);
  window.addEventListener("storage", notify);
  return () => { listeners.delete(notify); window.removeEventListener("storage", notify); };
};
export function holdSnapshot() {
  try { return localStorage.getItem(HOLD_STORAGE_KEY) ?? "{}"; }
  catch { return "!"; }
}
function read(): Record<string, Hold> {
  const value = JSON.parse(holdSnapshot());
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.values(value).some((h: any) => !h || typeof h.id !== "string" ||
        !["stop", "continue"].includes(h.intent) || typeof h.baseline !== "string" ||
        !["sending", "sent", "unknown"].includes(h.status))) throw Error("Invalid holds");
  return value;
}
function write(records: Record<string, Hold>) {
  localStorage.setItem(HOLD_STORAGE_KEY, JSON.stringify(records));
  for (const notify of listeners) notify();
}
export function getHold(key: string): Hold | null {
  try { return read()[key] ?? null; }
  catch { return { id: "", intent: "stop", baseline: "", status: "unknown" }; }
}
export function claimHold(key: string, intent: Hold["intent"], baseline: string, revision?: Revision) {
  try {
    const records = read();
    if (records[key] || Object.keys(records).length >= 128) return null;
    const intentAfter = Math.floor(Date.now() / 1000);
    if (!Number.isSafeInteger(intentAfter) || intentAfter <= 0) return null;
    const id = crypto.randomUUID();
    records[key] = { id, intent, baseline, intentAfter, revision: validRevision(revision) ? revision : undefined, status: "sending" };
    write(records);
    return id;
  } catch { return null; }
}
export function updateHold(key: string, id: string, status: Hold["status"] | null) {
  try {
    const records = read();
    if (records[key]?.id !== id) return;
    if (status) records[key].status = status;
    else delete records[key];
    write(records);
  } catch { /* Retain the original durable intent when persistence fails. */ }
}
function validRevision(revision: Revision | undefined): revision is Revision {
  return !!revision && /^[0-9a-f]{64}$/.test(revision.eventId) &&
    Number.isSafeInteger(revision.createdAt) && revision.createdAt > 0;
}
export function reconcileHold(key: string, token: string, source: string, state: string, revision?: Revision) {
  const hold = getHold(key);
  if (!hold || hold.baseline === token || source !== "jacob" ||
      !validRevision(hold.revision) || !validRevision(revision) ||
      revision.eventId === hold.revision.eventId ||
      !Number.isSafeInteger(hold.intentAfter) ||
      revision.createdAt <= Math.max(hold.revision.createdAt, hold.intentAfter!)) return;
  // Canonical equal-time selection is lowest event ID, but a tie does not prove
  // post-intent freshness. Keep the hold even when a tied ID wins selection.
  // Clock uncertainty can delay reconciliation; it must never authorize a retry.
  if (hold.intent === "stop" ? ["stopped", "idle", "interrupted"].includes(state) : state === "continuation")
    updateHold(key, hold.id, null);
}
export function controlRelayScope(raw: string | undefined) {
  try {
    const url = new URL(raw ?? "");
    url.protocol = url.protocol === "wss:" ? "https:" : url.protocol === "ws:" ? "http:" : url.protocol;
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
    return url.href.replace(/\/$/, "");
  } catch { return null; }
}
