import type { RelayEvent } from "@/shared/api/types";
import {
  authenticatedFleet,
  newerFleet,
  parseFleet,
  fleetEnvelope,
  type FleetSnapshot,
} from "./model";
export type FleetView = {
  status: "loading" | "ready" | "error";
  snapshot?: FleetSnapshot;
};
export type FleetIO = {
  subscribe: (
    event: (e: RelayEvent) => void,
    ready: (state: string) => void,
    signal: AbortSignal,
  ) => Promise<() => Promise<void>>;
  decrypt: (e: RelayEvent) => Promise<unknown>;
  now: () => number;
  authenticate?: typeof authenticatedFleet;
};
const EMPTY: FleetView = { status: "loading" };
/** One bounded subscription/history and at most one decrypt + one latest pending event. RAM only. */
export function createFleetReader(io: FleetIO) {
  let value = EMPTY,
    generation = 0,
    winner: RelayEvent | undefined,
    pending: RelayEvent | undefined;
  let controller: AbortController | undefined,
    dispose: (() => Promise<void>) | undefined;
  let draining = false;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let expiredId: string | undefined;
  const clearDeadline = () => {
    clearTimeout(deadline);
    deadline = undefined;
  };
  const listeners = new Set<() => void>();
  const emit = (next: FleetView) => {
    value = next;
    for (const f of listeners) f();
  };
  const fail = () => emit({ status: "error" });
  async function drain(epoch: number) {
    if (draining) return;
    draining = true;
    try {
      while (pending && epoch === generation) {
        const event = pending;
        pending = undefined;
        try {
          if (expiredId === event.id) continue;
          if (!fleetEnvelope(event, io.now()))
            throw new Error("Invalid private queue event");
          const raw = await io.decrypt(event);
          if (
            epoch !== generation ||
            winner?.id !== event.id ||
            expiredId === event.id
          )
            continue;
          emit({
            status: "ready",
            snapshot: parseFleet(raw, event.created_at, io.now()),
          });
        } catch {
          if (epoch === generation && winner?.id === event.id) fail();
        } finally {
          if (epoch === generation && winner?.id === event.id) clearDeadline();
        }
      }
    } finally {
      draining = false;
      // A new owner can subscribe while a retired native operation is still finishing.
      if (pending && listeners.size) void drain(generation);
    }
  }
  function accept(event: RelayEvent) {
    if (
      !listeners.size ||
      winner?.id === event.id ||
      !(io.authenticate ?? authenticatedFleet)(event, io.now()) ||
      (winner && !newerFleet(event, winner))
    )
      return;
    winner = event;
    pending = event;
    expiredId = undefined;
    clearDeadline();
    const epoch = generation;
    // Report a stalled IPC honestly, but do NOT start a second native operation before it settles.
    deadline = setTimeout(() => {
      if (epoch === generation && winner?.id === event.id) {
        expiredId = event.id;
        fail();
      }
    }, 5000);
    emit(EMPTY);
    void drain(generation);
  }
  function start() {
    const epoch = ++generation;
    controller = new AbortController();
    expiredId = undefined;
    clearDeadline();
    winner = undefined;
    pending = undefined;
    emit(EMPTY);
    void io
      .subscribe(
        (event) => {
          if (epoch === generation) accept(event);
        },
        (state) => {
          if (epoch === generation && (state !== "eose" || !winner)) {
            pending = undefined;
            expiredId = winner?.id;
            clearDeadline();
            fail();
          }
        },
        controller.signal,
      )
      .then((close) => {
        if (epoch !== generation) void close().catch(() => {});
        else dispose = close;
      })
      .catch(() => {
        if (epoch === generation) {
          pending = undefined;
          expiredId = winner?.id;
          clearDeadline();
          fail();
        }
      });
  }
  return {
    getSnapshot: () => value,
    subscribe(fn: () => void) {
      listeners.add(fn);
      if (listeners.size === 1) start();
      return () => {
        listeners.delete(fn);
        if (!listeners.size) {
          ++generation;
          clearDeadline();
          expiredId = undefined;
          controller?.abort();
          controller = undefined;
          pending = undefined;
          winner = undefined;
          expiredId = undefined;
          value = EMPTY;
          const close = dispose;
          dispose = undefined;
          void close?.().catch(() => {});
        }
      };
    },
  };
}
