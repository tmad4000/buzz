import { setLocalStorageItemWithRecovery } from "@/shared/lib/localStorageQuota";
import type { ThreadLinkUndoRecord } from "./threadLinkUndo";

const PREFIX = "buzz-thread-link-undo.v1:";
/** Exact community/identity/channel/message/head journal address. */
export function threadLinkUndoKey(
  scopeKey: string,
  child: string,
  previous: string,
) {
  return PREFIX + JSON.stringify([scopeKey, child, previous]);
}
/** Load a durable signed receipt; malformed receipts fail closed. */
export function loadThreadLinkUndo(key: string): ThreadLinkUndoRecord | null {
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  // The writer validates every field/signature before use. A malformed durable
  // receipt is an explicit repair error; it must never become a fresh send.
  const record: unknown = JSON.parse(raw);
  if (!record || typeof record !== "object")
    throw Error("Undo receipt is unreadable; retained for inspection");
  const candidate = record as Partial<ThreadLinkUndoRecord>;
  if (
    candidate.version !== 1 ||
    typeof candidate.scopeKey !== "string" ||
    typeof candidate.identity !== "string" ||
    !/^[0-9a-f]{64}$/.test(candidate.identity) ||
    typeof candidate.childId !== "string" ||
    !/^[0-9a-f]{64}$/.test(candidate.childId) ||
    typeof candidate.previousId !== "string" ||
    !/^[0-9a-f]{64}$/.test(candidate.previousId) ||
    !["pending", "verified"].includes(candidate.state ?? "") ||
    !candidate.event ||
    typeof candidate.event.id !== "string" ||
    !/^[0-9a-f]{64}$/.test(candidate.event.id)
  )
    throw Error("Undo receipt is unreadable; retained for inspection");
  return candidate as ThreadLinkUndoRecord;
}
/** Persist before publish; false prevents the network write. */
export function saveThreadLinkUndo(key: string, record: ThreadLinkUndoRecord) {
  return setLocalStorageItemWithRecovery(key, JSON.stringify(record));
}
/** Enumerate bounded pending receipts for this exact mounted scope. */
export function pendingThreadLinkUndos(
  scopeKey: string,
): ThreadLinkUndoRecord[] {
  const result: ThreadLinkUndoRecord[] = [];
  for (let index = 0; index < window.localStorage.length; index++) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith(PREFIX)) continue;
    const parts: unknown = JSON.parse(key.slice(PREFIX.length));
    if (!Array.isArray(parts) || parts[0] !== scopeKey) continue;
    const record = loadThreadLinkUndo(key);
    if (
      record?.scopeKey === scopeKey &&
      record.state === "pending" &&
      /^[0-9a-f]{64}$/.test(record.childId) &&
      /^[0-9a-f]{64}$/.test(record.previousId)
    )
      result.push(record);
    if (result.length > 64)
      throw Error("Too many pending undo receipts; inspect before continuing");
  }
  return result;
}
