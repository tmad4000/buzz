/** One external reading restore may own automatic positioning at a time. */
export function createScrollPositionOwnership() {
  let current: object | null = null;
  let epoch = 0;
  let reserved = false;
  const listeners = new Set<() => void>();
  const released = () => {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        /* A layout listener cannot strand ownership. */
      }
    }
  };
  return {
    blocked: () => reserved || current !== null,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reserve: () => {
      epoch++;
      current = null;
      reserved = true;
    },
    epoch: () => epoch,
    retire: (notify = true) => {
      const wasBlocked = reserved || current !== null;
      epoch++;
      current = null;
      reserved = false;
      if (wasBlocked && notify) released();
    },
    acquire() {
      epoch++;
      reserved = false;
      const token = {};
      current = token;
      return {
        current: () => current === token,
        release: () => {
          if (current !== token) return;
          current = null;
          released();
        },
      };
    },
  };
}
export type ScrollPositionLease = ReturnType<
  ReturnType<typeof createScrollPositionOwnership>["acquire"]
>;

export type ScrollPositionLayout = Pick<
  ReturnType<typeof createScrollPositionOwnership>,
  "blocked" | "subscribe"
>;
