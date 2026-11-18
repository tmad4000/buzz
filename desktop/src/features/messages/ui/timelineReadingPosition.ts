/** A view-local message anchor and bounded fallback, never a draft snapshot. */
export type TimelineReadingPosition = {
  id: string | null;
  offset: number;
  pixel: number;
  neighbors: string[];
};
export type ReadingRestoreStop = "complete" | "gesture" | "retired";

/** Capture a message anchor inside the actual virtualizer scroller. */
export function captureReadingPosition(
  container: HTMLElement,
  ids: string[],
): TimelineReadingPosition {
  const top = container.getBoundingClientRect().top;
  const rows = [
    ...container.querySelectorAll<HTMLElement>("[data-message-id]"),
  ];
  const row = rows.find((node) => node.getBoundingClientRect().bottom > top);
  const id = row?.dataset.messageId ?? null;
  const index = id ? ids.indexOf(id) : -1;
  const neighbors =
    index < 0
      ? []
      : Array.from({ length: ids.length }, (_, n) => n + 1)
          .flatMap((distance) => [ids[index + distance], ids[index - distance]])
          .filter((value): value is string => Boolean(value));
  return {
    id,
    offset: row ? row.getBoundingClientRect().top - top : 0,
    pixel: container.scrollTop,
    neighbors,
  };
}

/** Realize the saved row before restoring its intra-message offset. Bounded and
 * canceled by a new reading gesture so restoration cannot fight the reader. */
export function restoreReadingPosition(
  container: HTMLElement,
  snapshot: TimelineReadingPosition,
  ids: string[],
  realize: (id: string) => boolean,
  canRestore: () => boolean = () => true,
  onStop?: (reason: ReadingRestoreStop) => void,
) {
  const id = [snapshot.id, ...snapshot.neighbors].find(
    (candidate) => candidate && ids.includes(candidate),
  );
  let frame = 0;
  let tries = 0;
  let stable = 0;
  let stopped = false;
  const stop = (reason: ReadingRestoreStop = "retired") => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    container.removeEventListener("wheel", gesture);
    container.removeEventListener("touchstart", gesture);
    container.removeEventListener("keydown", gesture);
    container.removeEventListener("pointerdown", gesture);
    onStop?.(reason);
  };
  const gesture = () => stop("gesture");
  const restore = () => {
    if (stopped) return;
    if (
      !container.isConnected ||
      !canRestore() ||
      stopped ||
      !container.isConnected
    ) {
      stop();
      return;
    }
    if (++tries > 30) {
      container.scrollTop = snapshot.pixel;
      stop("complete");
      return;
    }
    const row = id
      ? [...container.querySelectorAll<HTMLElement>("[data-message-id]")].find(
          (node) => node.dataset.messageId === id,
        )
      : null;
    if (row) {
      const delta =
        row.getBoundingClientRect().top -
        container.getBoundingClientRect().top -
        snapshot.offset;
      container.scrollTop += delta;
      if (stopped) return;
      stable = Math.abs(delta) < 1 ? stable + 1 : 0;
      container.dispatchEvent(new Event("scroll"));
    } else if (id) {
      realize(id);
      stable = 0;
    } else {
      container.scrollTop = snapshot.pixel;
      stable++;
    }
    if (stopped) return;
    if (stable >= 4) {
      stop("complete");
      return;
    }
    frame = requestAnimationFrame(restore);
  };
  container.addEventListener("wheel", gesture, { passive: true });
  container.addEventListener("touchstart", gesture, { passive: true });
  container.addEventListener("keydown", gesture);
  container.addEventListener("pointerdown", gesture);
  frame = requestAnimationFrame(restore);
  return () => stop();
}
