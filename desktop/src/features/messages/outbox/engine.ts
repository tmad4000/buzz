import { OutboxConflictError } from "./errors";
import type { RelayEvent } from "@/shared/api/types";
import type { ImetaMedia } from "../lib/imetaMediaMarkdown";
import type { OutboxLookup, OutboxRecord, OutboxStorage } from "./types";

export type OutboxTransport = {
  owns: (row: OutboxRecord) => Promise<boolean>;
  upload: (
    row: OutboxRecord,
    index: number,
    progress: (value: number) => void,
  ) => Promise<ImetaMedia>;
  prepare: (row: OutboxRecord) => Promise<RelayEvent>;
  find: (row: OutboxRecord) => Promise<OutboxLookup>;
  publish: (row: OutboxRecord) => Promise<void>;
  accepted: (row: OutboxRecord) => void;
  authorize: (row: OutboxRecord) => Promise<void>;
  prepareAgents: (row: OutboxRecord) => Promise<void>;
  wake: (
    row: OutboxRecord,
    pubkey: string,
    replayFloorUnix: number,
  ) => Promise<void>;
};

export function conversationKey(row: OutboxRecord): string {
  const m = row.message;
  return JSON.stringify([
    m.relayUrl,
    m.signerPubkey,
    m.channelId,
    m.rootEventId,
  ]);
}

/** Retry times persist across restarts; jitter prevents a reconnect stampede. */
export function retryDelay(attempts: number, random = Math.random): number {
  return (
    Math.min(300_000, 1_000 * 2 ** Math.min(attempts - 1, 9)) *
    (0.8 + random() * 0.4)
  );
}

/** Process the head of each conversation. The caller holds the cross-window lock. */
export class OutboxEngine {
  private storage: OutboxStorage;
  private transport: OutboxTransport;
  private changed: () => Promise<void>;
  private progress: (id: string, value: number) => void;
  private now: () => number;

  constructor(
    storage: OutboxStorage,
    transport: OutboxTransport,
    changed: () => Promise<void>,
    progress: (id: string, value: number) => void,
    now = Date.now,
  ) {
    this.storage = storage;
    this.transport = transport;
    this.changed = changed;
    this.progress = progress;
    this.now = now;
  }

  async drain(): Promise<void> {
    const rows = await this.storage.all();
    const lanes = new Map<string, OutboxRecord[]>();
    for (const row of rows) {
      const key = conversationKey(row);
      const lane = lanes.get(key) ?? [];
      lane.push(row);
      lanes.set(key, lane);
    }
    const work = [...lanes.values()];
    let next = 0;
    const drainLane = async (lane: OutboxRecord[]) => {
      for (const captured of lane) {
        const row = (await this.storage.all()).find(
          (current) => current.id === captured.id,
        );
        if (!row) continue;
        if (
          row.state === "editing" ||
          row.state === "failed" ||
          row.nextAttemptAt > this.now()
        ) {
          if (row.accepted) continue;
          break;
        }
        if (!(await this.transport.owns(row))) break;
        if (!(await this.send(row)) && !row.accepted) break;
      }
    };
    // Bound raw file reads, and keep the worker lock until every started lane
    // settles even when another lane suffers a storage failure.
    const results = await Promise.allSettled(
      Array.from({ length: Math.min(3, work.length) }, async () => {
        while (next < work.length) await drainLane(work[next++]);
      }),
    );
    const failure = results.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
  }

  private async checkpoint(row: OutboxRecord): Promise<void> {
    await this.storage.put(row);
    row.revision++;
    await this.changed();
  }

  private async send(row: OutboxRecord): Promise<boolean> {
    let removed = false;
    try {
      row.state = "sending";
      await this.checkpoint(row);
      if (!row.accepted) {
        // A successful authenticated lookup must precede every publication,
        // especially replacement of an expired signature after a long outage.
        const existing = await this.transport.find(row);
        if (existing) {
          if ("event" in existing) row.signedEvent = existing.event;
          else {
            row.deleted = true;
            row.wakes = [];
          }
          row.accepted = true;
          await this.checkpoint(row);
          this.transport.accepted(row);
        }
      }
      if (!row.accepted) {
        const expired =
          row.signedEvent &&
          Math.floor(this.now() / 1000) - row.signedEvent.created_at > 900;
        if (!row.signedEvent || expired) {
          for (let index = 0; index < row.attachments.length; index++) {
            if (row.attachments[index].descriptor) continue;
            if (!(await this.transport.owns(row)))
              throw new Error("Community changed; waiting to reconnect.");
            row.attachments[index].descriptor = await this.transport.upload(
              row,
              index,
              (value) => {
                this.progress(row.id, (index + value) / row.attachments.length);
              },
            );
            await this.checkpoint(row);
          }
          if (!(await this.transport.owns(row)))
            throw new Error("Community changed; waiting to reconnect.");
          if (!row.agentsPrepared) {
            await this.transport.prepareAgents(row);
            row.agentsPrepared = true;
            await this.checkpoint(row);
          }
          const previousId = row.signedEvent?.id;
          row.signedEvent = await this.transport.prepare(row);
          row.signedEventIds = [
            ...new Set([
              ...(row.signedEventIds ?? []),
              ...(previousId ? [previousId] : []),
              row.signedEvent.id,
            ]),
          ];
          // A crash before this commit cannot have published anything. A crash
          // after it will always retry the exact same signed event.
          await this.checkpoint(row);
        }
        if (!(await this.transport.owns(row)))
          throw new Error("Community changed; waiting to reconnect.");
        await this.transport.authorize(row);
        if (!(await this.transport.owns(row)))
          throw new Error("Community changed; waiting to reconnect.");
        row.deliveryUncertain = true;
        await this.checkpoint(row);
        await this.transport.publish(row);
        row.accepted = true;
        await this.checkpoint(row);
        try {
          this.transport.accepted(row);
        } catch {
          /* Projection will reconcile from relay history. */
        }
      }
      for (const wake of [...(row.wakes ?? [])]) {
        if (!(await this.transport.owns(row)))
          throw new Error("Community changed; agent start is queued.");
        await this.transport.wake(row, wake.pubkey, wake.replayFloorUnix);
        row.wakes = row.wakes?.filter(
          (pending) => pending.pubkey !== wake.pubkey,
        );
        await this.checkpoint(row);
      }
      // Acceptance and each agent wake are durably checkpointed separately.
      await this.storage.remove(row.id, row.revision);
      removed = true;
      await this.changed();
      return true;
    } catch (error) {
      if (error instanceof OutboxConflictError) return false;
      if (removed) throw error;
      row.error = error instanceof Error ? error.message : String(error);
      row.attempts++;
      // Relay rejections are explicit; all transport ambiguity keeps its id.
      const rejected =
        /relay rejected event:|forbidden|not authorized|invalid channel|invalid .*tag/i.test(
          row.error,
        );
      row.state = rejected ? "failed" : "waiting";
      if (rejected) row.deliveryUncertain = false;
      row.nextAttemptAt = this.now() + retryDelay(row.attempts);
      await this.checkpoint(row);
      return false;
    }
  }
}
