import type { ThreadLinkWorkerRequest } from "./threadLinkWorker";

/** Each request owns its worker; cancellation cannot leave stale CPU work queued. */
export function runThreadLinkWorker<T>(
  request: ThreadLinkWorkerRequest,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Scope changed", "AbortError"));
      return;
    }
    const worker = new Worker(
      new URL("./threadLinkWorker.ts", import.meta.url),
      { type: "module" },
    );
    const timeout = setTimeout(() => {
      dispose();
      reject(Error("Thread organization verification timed out"));
    }, 30000);
    const dispose = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      worker.terminate();
    };
    const abort = () => {
      dispose();
      reject(new DOMException("Scope changed", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    worker.onerror = () => {
      dispose();
      reject(Error("Thread organization verification unavailable"));
    };
    worker.onmessage = (
      event: MessageEvent<{ ok: boolean; value?: T; error?: string }>,
    ) => {
      dispose();
      if (event.data.ok) resolve(event.data.value as T);
      else
        reject(
          Error(event.data.error ?? "Thread organization verification failed"),
        );
    };
    try {
      worker.postMessage(request);
    } catch (error) {
      dispose();
      reject(error);
    }
  });
}
