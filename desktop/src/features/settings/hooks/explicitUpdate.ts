export type InstallableUpdate = {
  version: string;
  download: (
    onEvent?: undefined,
    options?: { timeout: number },
  ) => Promise<void>;
  install: () => Promise<void>;
  close: () => Promise<void>;
};
export type InstallPhase =
  | "available"
  | "downloading"
  | "installing"
  | "ready"
  | "error";

/** No work until start is called by an explicit user action. */
export function explicitUpdate(
  update: InstallableUpdate,
  canRestart: () => boolean,
  relaunch: () => Promise<void>,
  notify: (phase: InstallPhase, message?: string) => void,
) {
  let busy = false;
  let disposed = false;
  let downloaded = false;
  let installed = false;
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await update.close().catch(() => {});
  };
  const blocked = () => {
    if (disposed) return true;
    if (canRestart()) return false;
    notify(
      installed ? "ready" : "available",
      "Save or cancel your edits before restarting.",
    );
    return true;
  };
  return {
    get busy() {
      return busy;
    },
    async start() {
      if (busy || disposed) return;
      busy = true;
      try {
        if (blocked()) return;
        if (!downloaded) {
          notify("downloading");
          // Tauri 2.10 verifies the signature before download() resolves.
          // Its Finished progress event occurs BEFORE verification; do not use it.
          await update.download(undefined, { timeout: 120000 });
          downloaded = true;
        }
        if (blocked()) return;
        if (!installed) {
          notify("installing");
          await update.install();
          installed = true;
        }
        // Edits may have appeared while either native operation was in flight.
        if (blocked()) return;
        notify("ready");
        await relaunch(); // Existing Tauri request_restart -> Buzz shutdown hooks.
      } catch (error) {
        if (!disposed)
          notify(
            installed ? "ready" : "error",
            error instanceof Error ? error.message : String(error),
          );
      } finally {
        busy = false;
        if (disposed) await close();
      }
    },
    async dispose() {
      disposed = true;
      if (!busy) await close();
    },
  };
}
