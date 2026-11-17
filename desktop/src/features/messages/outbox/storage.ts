import { OutboxConflictError } from "./errors";
import type { OutboxRecord, OutboxStorage } from "./types";

let database: Promise<IDBDatabase> | undefined;
function open(): Promise<IDBDatabase> {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("buzz-message-outbox-v1", 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore("messages", {
        keyPath: "id",
      });
      store.createIndex("sequence", "sequence", { unique: true });
      request.result.createObjectStore("metadata");
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onblocked = () =>
      reject(new Error("Outbox storage is busy in another window."));
  }).catch((error: unknown) => {
    database = undefined;
    throw error;
  });
  return database;
}

function completed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () =>
      reject(tx.error ?? new Error("Outbox transaction aborted."));
    tx.onerror = () => reject(tx.error ?? new Error("Outbox storage failed."));
  });
}

/** Resolve writes on transaction completion, never on request success. */
export const outboxStorage: OutboxStorage = {
  async all() {
    const db = await open();
    const tx = db.transaction("messages", "readonly");
    const done = completed(tx);
    const request = tx.objectStore("messages").getAll();
    const rows = await new Promise<OutboxRecord[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as OutboxRecord[]);
      request.onerror = () => reject(request.error);
    });
    await done;
    return rows.sort((a, b) => a.sequence - b.sequence);
  },
  async add(record) {
    const db = await open();
    const tx = db.transaction(["messages", "metadata"], "readwrite", {
      durability: "strict",
    });
    const done = completed(tx);
    const meta = tx.objectStore("metadata");
    const counter = meta.get("sequence");
    let saved = record;
    counter.onsuccess = () => {
      const sequence = Number(counter.result ?? 0) + 1;
      saved = { ...record, sequence };
      meta.put(sequence, "sequence");
      tx.objectStore("messages").add(saved);
    };
    await done;
    return saved;
  },
  async put(record) {
    const db = await open();
    const tx = db.transaction("messages", "readwrite", {
      durability: "strict",
    });
    const done = completed(tx);
    const store = tx.objectStore("messages");
    const request = store.get(record.id);
    let conflict = false;
    request.onsuccess = () => {
      const current = request.result as OutboxRecord | undefined;
      if (!current || current.revision !== record.revision) {
        conflict = true;
        tx.abort();
        return;
      }
      store.put({ ...record, revision: record.revision + 1 });
    };
    try {
      await done;
    } catch (error) {
      if (conflict)
        throw new OutboxConflictError("Queued message changed; try again.");
      throw error;
    }
  },
  async remove(id, expectedRevision) {
    const db = await open();
    const tx = db.transaction("messages", "readwrite", {
      durability: "strict",
    });
    const done = completed(tx);
    const store = tx.objectStore("messages");
    const request = store.get(id);
    let conflict = false;
    request.onsuccess = () => {
      const current = request.result as OutboxRecord | undefined;
      if (
        expectedRevision !== undefined &&
        current?.revision !== expectedRevision
      ) {
        conflict = true;
        tx.abort();
        return;
      }
      store.delete(id);
    };
    try {
      await done;
    } catch (error) {
      if (conflict)
        throw new OutboxConflictError("Queued message changed; try again.");
      throw error;
    }
  },
};
