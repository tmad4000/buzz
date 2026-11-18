/** One external reading restore may own automatic positioning at a time. */
export function createScrollPositionOwnership() {
  let current: object | null = null;
  let epoch = 0;
  let reserved = false;
  return {
    blocked: () => reserved || current !== null,
    reserve: () => {
      epoch++;
      current = null;
      reserved = true;
    },
    epoch: () => epoch,
    retire: () => {
      epoch++;
      current = null;
      reserved = false;
    },
    acquire() {
      epoch++;
      reserved = false;
      const token = {};
      current = token;
      return {
        current: () => current === token,
        release: () => {
          if (current === token) current = null;
        },
      };
    },
  };
}
export type ScrollPositionLease = ReturnType<
  ReturnType<typeof createScrollPositionOwnership>["acquire"]
>;
