import { relayClient } from "@/shared/api/relayClient";
import type { RelayEvent } from "@/shared/api/types";

import { getChannelIdFromTags, getThreadReference } from "../lib/threading";
import { LaneStore, encodeDoc } from "@/features/sidebar/lib/sidebarLaneStore";
import { LaneReconciler } from "@/features/sidebar/lib/sidebarLaneReconciler";
import {
  canonical,
  compareRegs,
  isReg,
  setRegs,
  type Reg,
} from "@/features/sidebar/lib/sidebarLwwMap";
import {
  ARCHIVE_BUCKETS,
  isArchiveReply,
  archiveBucket,
  archiveEntries,
  archiveKey,
  archiveLane,
  type ArchiveTarget,
} from "./model";

export type ArchiveUndo = {
  key: string;
  before: ArchiveTarget | null;
  written: Reg;
  durable: boolean;
};
const MAX_PLAINTEXT = 36_000;
/** Uses the existing settings reconciliation machinery; no new relay protocol. */
export class ArchiveEngine {
  private lanes = Array.from({ length: ARCHIVE_BUCKETS }, (_, bucket) =>
    archiveLane(bucket),
  );
  private stores: LaneStore[];
  private reconcilers = new Map<number, LaneReconciler>();
  private listeners = new Set<() => void>();
  private disposers: Array<() => void> = [];
  private alive = true;
  private revision = 0;
  private ready = false;
  private subscribed = false;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private records = new Map<string, ArchiveTarget>();
  private snapshot = { revision: 0, ready: false, records: this.records };
  readonly pubkey: string;
  readonly relayUrl: string;
  constructor(pubkey: string, relayUrl: string) {
    this.pubkey = pubkey;
    this.relayUrl = relayUrl;
    this.stores = this.lanes.map(
      (lane) => new LaneStore(lane, pubkey, relayUrl),
    );
    for (const store of this.stores) {
      this.disposers.push(
        store.subscribe(() => {
          this.refresh();
          this.reconciler(this.stores.indexOf(store)).defer();
        }),
        store.attachCrossTab(),
      );
    }
    this.refresh();
  }
  get = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private refresh() {
    this.records = new Map(
      this.stores.flatMap((store) =>
        archiveEntries(store.get()).flatMap(([key, reg]) =>
          reg[2] ? [[key, reg[2]] as [string, ArchiveTarget]] : [],
        ),
      ),
    );
    this.snapshot = {
      revision: ++this.revision,
      ready: this.ready,
      records: this.records,
    };
    for (const listener of this.listeners) listener();
  }
  private reconciler(bucket: number) {
    let rec = this.reconcilers.get(bucket);
    if (!rec) {
      rec = new LaneReconciler(
        this.lanes[bucket],
        this.stores[bucket],
        this.pubkey,
        this.relayUrl,
      );
      this.reconcilers.set(bucket, rec);
    }
    return rec;
  }
  private async ingest(event: RelayEvent) {
    if (!this.alive || event.pubkey !== this.pubkey) return;
    const tag = event.tags.find((tag) => tag[0] === "d")?.[1];
    const bucket = this.lanes.findIndex((lane) => lane.dTag === tag);
    if (bucket >= 0) await this.reconciler(bucket).ingest(event);
  }
  /** Subscribe before bootstrap so local/remote edits cannot fall in a gap. */
  async start() {
    const filter = {
      kinds: [30078],
      authors: [this.pubkey],
      "#d": this.lanes.map((lane) => lane.dTag),
    };
    try {
      const dispose = await relayClient.subscribeLive(
        { ...filter, limit: 0 },
        (event) => {
          void this.ingest(event);
        },
      );
      if (!this.alive) {
        await dispose();
        return;
      }
      this.subscribed = true;
      this.disposers.push(() => {
        void dispose();
      });
      await this.hydrate(filter);
    } catch {
      this.scheduleHydration(filter);
    }
    if (!this.alive) return;
    if (this.subscribed)
      this.disposers.push(
        relayClient.subscribeToReconnects(() => {
          void this.hydrate(filter);
        }),
      );
  }
  private scheduleHydration(filter: {
    kinds: number[];
    authors: string[];
    "#d": string[];
  }) {
    if (!this.alive || this.retry) return;
    this.retry = setTimeout(() => {
      this.retry = undefined;
      void (this.subscribed ? this.hydrate(filter) : this.start());
    }, 15_000);
  }
  private async hydrate(filter: {
    kinds: number[];
    authors: string[];
    "#d": string[];
  }) {
    try {
      const events = await relayClient.fetchEvents({
        ...filter,
        limit: ARCHIVE_BUCKETS + 1,
      });
      if (!this.alive) return;
      await Promise.all(events.map((event) => this.ingest(event)));
      if (!this.alive) return;
      this.ready = true;
      for (let bucket = 0; bucket < this.stores.length; bucket++) {
        if (Object.keys(this.stores[bucket].get()).length)
          this.reconciler(bucket).wake();
      }
      this.refresh();
    } catch {
      this.scheduleHydration(filter);
    }
  }
  /** One atomic per-item LWW register; explicit null is a synced unarchive. */
  set(key: string, value: ArchiveTarget | null): ArchiveUndo {
    if (!this.alive)
      throw new Error("Account changed; archive was not applied");
    const bucket = archiveBucket(key),
      store = this.stores[bucket];
    const before =
      archiveEntries(store.get()).find(([id]) => id === key)?.[1]?.[2] ?? null;
    const next = setRegs(store.get(), [[["a", key], value]]);
    if (
      new TextEncoder().encode(canonical(encodeDoc(this.lanes[bucket], next)))
        .length > MAX_PLAINTEXT
    )
      throw new Error(
        "Archive storage capacity reached; no change was applied",
      );
    store.transact(() => next);
    const durable = store.persist();
    this.reconciler(bucket).defer();
    const written = archiveEntries(store.get()).find(([id]) => id === key)?.[1];
    if (!written) throw new Error("Archive change could not be recorded");
    return { key, before, written, durable };
  }
  undo(token: ArchiveUndo): boolean {
    const current = archiveEntries(
      this.stores[archiveBucket(token.key)].get(),
    ).find(([id]) => id === token.key)?.[1];
    if (!current || compareRegs(current, token.written) !== 0) return false;
    this.set(token.key, token.before);
    return true;
  }
  isArchived(channelId: string, id: string, rootId?: string | null): boolean {
    const own = this.records.get(archiveKey("message", id));
    const thread = this.records.get(archiveKey("thread", rootId ?? id));
    return own?.channelId === channelId || thread?.channelId === channelId;
  }
  showArchived(channelId: string): boolean {
    const show = this.stores[0].get().show;
    const node = show && !isReg(show) ? show[channelId] : undefined;
    return isReg(node) && node[2] === true;
  }
  setShowArchived(channelId: string, show: boolean) {
    if (!this.alive) return;
    this.stores[0].transact((tree) =>
      setRegs(tree, [[["show", channelId], show]]),
    );
    this.reconciler(0).defer();
  }
  /** A genuinely live reply restores an archived thread, regardless of author clock. */
  observeLive(event: RelayEvent) {
    if (!this.alive) return;
    const channel = getChannelIdFromTags(event.tags),
      thread = getThreadReference(event.tags);
    if (!channel || !thread.parentId || !thread.rootId) return;
    const key = archiveKey("thread", thread.rootId),
      entry = this.records.get(key);
    if (
      entry?.channelId === channel &&
      isArchiveReply(event, channel, thread.rootId) &&
      !entry.replyIds?.includes(event.id)
    )
      this.set(key, null);
  }
  destroy() {
    this.alive = false;
    if (this.retry) clearTimeout(this.retry);
    for (const dispose of this.disposers) dispose();
    for (const rec of this.reconcilers.values()) rec.destroy();
    this.listeners.clear();
  }
}
