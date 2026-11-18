/** One external reading restore may own automatic positioning at a time. */
export function createScrollPositionOwnership() {
  let current: object | null = null;
  let epoch = 0;
  return {
    blocked: () => current !== null,
    epoch: () => epoch,
    retire: () => {
      epoch++;
      current = null;
    },
    acquire() {
      epoch++;
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
