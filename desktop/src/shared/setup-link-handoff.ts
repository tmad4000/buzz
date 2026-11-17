import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type PendingSetupLink = { id: string; code: string };

export interface SetupHandoffDeps {
  /** Return true only after a device transaction has been durably accepted in native secure storage.
   * Check signal.aborted after every await and before UI/account mutations. False leaves the link queued.
   */
  accept: (pending: PendingSetupLink, signal: AbortSignal) => Promise<boolean>;
  onAvailable: (retry: () => void) => () => void;
  onUnavailable: () => void;
}

// A remount waits for the old accepting operation, preventing overlapping secure-store transactions.
let tail: Promise<void> = Promise.resolve();

/** Drain the native cold/warm queue without consuming links on failed acceptance or stale mounts. */
export async function listenForSetupLinkHandoffs(
  deps: SetupHandoffDeps,
): Promise<UnlistenFn> {
  if (!(await invoke<boolean>("ideaflow_setup_links_enabled"))) return () => {};
  const controller = new AbortController();
  let running = false;
  let requested = false;
  const drain = () => {
    if (controller.signal.aborted) return;
    requested = true;
    if (running) return;
    running = true;
    const work = tail.then(async () => {
      try {
        while (requested && !controller.signal.aborted) {
          requested = false;
          while (!controller.signal.aborted) {
            const pending = await invoke<PendingSetupLink | null>(
              "take_pending_setup_link",
            );
            if (!pending || controller.signal.aborted) break;
            const accepted = await deps.accept(pending, controller.signal);
            if (!accepted || controller.signal.aborted) break;
            if (
              !(await invoke<boolean>("acknowledge_pending_setup_link", {
                id: pending.id,
              }))
            )
              break;
          }
        }
      } catch {
        // Do not pass native errors, links, proof keys or OAuth material to logs or UI callbacks.
        if (!controller.signal.aborted) deps.onUnavailable();
      } finally {
        running = false;
        if (requested && !controller.signal.aborted) drain();
      }
    });
    tail = work.catch(() => {});
  };
  const stopNative = await listen("ideaflow-setup-link-available", drain);
  let stopAvailability: () => void;
  try {
    stopAvailability = deps.onAvailable(drain);
  } catch {
    controller.abort();
    stopNative();
    throw Error("Setup handoff unavailable");
  }
  drain();
  return () => {
    if (controller.signal.aborted) return;
    controller.abort();
    stopAvailability();
    stopNative();
  };
}
