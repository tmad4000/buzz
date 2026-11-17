type QueuedRead = { start: () => void };
let active = 0;
const queue: QueuedRead[] = [];
function drain() {
  while (active < 2 && queue.length) queue.shift()?.start();
}
/** Native reads cannot be forcibly canceled; retain their slot until they finish. */
export function boundedInlineThreadRead<T>(
  work: () => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const aborted = () =>
      new DOMException("Thread read canceled", "AbortError");
    if (signal.aborted) {
      reject(aborted());
      return;
    }
    let started = false;
    const abort = () => {
      if (started) return;
      const index = queue.indexOf(item);
      if (index >= 0) queue.splice(index, 1);
      reject(aborted());
    };
    const item: QueuedRead = {
      start: () => {
        started = true;
        signal.removeEventListener("abort", abort);
        active++;
        void Promise.resolve()
          .then(() => {
            if (signal.aborted) throw aborted();
            return work();
          })
          .then(resolve, reject)
          .finally(() => {
            active--;
            drain();
          });
      },
    };
    signal.addEventListener("abort", abort, { once: true });
    queue.push(item);
    drain();
  });
}
