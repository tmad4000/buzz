/** At most four independent thread-history reads per mounted channel scope. */
export function createReplyEvidenceQueue() {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async function run<T>(
    signal: AbortSignal,
    read: () => Promise<T>,
  ): Promise<T> {
    if (active >= 4)
      await new Promise<void>((resolve) => waiting.push(resolve));
    else active++;
    try {
      signal.throwIfAborted();
      return await read();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}
