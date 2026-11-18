/** Event-driven retirement survives rAF suspension and false -> true admission intervals. */
export function createReadingRestoreAdmission({
  windowEvents,
  documentEvents,
  canRestore,
}: {
  windowEvents: EventTarget;
  documentEvents: EventTarget;
  canRestore: () => boolean;
}) {
  let epoch = 0;
  let disposed = false;
  const invalidate = () => {
    epoch++;
  };
  windowEvents.addEventListener("blur", invalidate);
  documentEvents.addEventListener("visibilitychange", invalidate);
  return {
    invalidate,
    capture() {
      const captured = epoch;
      const initiallyAdmitted = !disposed && canRestore();
      return () =>
        initiallyAdmitted && !disposed && epoch === captured && canRestore();
    },
    dispose() {
      disposed = true;
      invalidate();
      windowEvents.removeEventListener("blur", invalidate);
      documentEvents.removeEventListener("visibilitychange", invalidate);
    },
  };
}
