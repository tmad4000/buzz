import * as React from "react";
import type { VListHandle } from "virtua";
import {
  captureVirtualizedReadingAnchor,
  hasVirtualizedReadingInput,
  isNearVirtualizedBottom,
  restoreVirtualizedReadingAnchor,
  type VirtualizedReadingAnchor,
} from "./virtualizedReadingAnchor";

const SCROLL_INTENT_KEYS = new Set([
  "ArrowDown",
  "ArrowUp",
  "End",
  "Home",
  "PageDown",
  "PageUp",
  " ",
]);
function isEditableKeyboardTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.closest("input, textarea, select, [contenteditable='true']") !==
        null)
  );
}

/** One geometry owner: bottom intent or a reading anchor, never both. */
export function useVirtualizedBottomSettle(
  hostRef: React.RefObject<HTMLDivElement | null>,
  listRef: React.RefObject<VListHandle | null>,
  itemsLengthRef: React.RefObject<number>,
  onReadingIntentChange?: (atBottom: boolean) => void,
) {
  const onReadingIntentChangeRef = React.useRef(onReadingIntentChange);
  onReadingIntentChangeRef.current = onReadingIntentChange;
  const bottomIntentRef = React.useRef(false);
  const frameRef = React.useRef<number | null>(null);
  const hoveredRowRef = React.useRef<HTMLElement | null>(null);
  const anchorRef = React.useRef<VirtualizedReadingAnchor | null>(null);
  const navigationOwnsPositionRef = React.useRef(false);
  const correctedScrollTopRef = React.useRef<number | null>(null);
  const getScroller = React.useCallback(() => {
    const node = hostRef.current?.firstElementChild;
    return node instanceof HTMLDivElement ? node : null;
  }, [hostRef]);
  const cancelFrame = React.useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);
  const hasReadingInteraction = React.useCallback((scroller: HTMLElement) => {
    const hovered = hoveredRowRef.current;
    if (hovered && !scroller.contains(hovered)) hoveredRowRef.current = null;
    return (
      hoveredRowRef.current !== null || hasVirtualizedReadingInput(scroller)
    );
  }, []);
  const cancel = React.useCallback(() => {
    bottomIntentRef.current = false;
    navigationOwnsPositionRef.current = true;
    anchorRef.current = null;
    cancelFrame();
  }, [cancelFrame]);

  const preserveReadingPosition = React.useCallback((): boolean => {
    const scroller = getScroller();
    if (!scroller) return false;
    const reading = hasReadingInteraction(scroller);
    if (reading) {
      bottomIntentRef.current = false;
      cancelFrame();
      anchorRef.current ??= captureVirtualizedReadingAnchor(
        scroller,
        hoveredRowRef.current,
      );
    } else if (bottomIntentRef.current) {
      return false;
    } else if (!anchorRef.current && !isNearVirtualizedBottom(scroller)) {
      anchorRef.current = captureVirtualizedReadingAnchor(scroller);
    }
    const anchor = anchorRef.current;
    if (!anchor) return reading;
    const before = scroller.scrollTop;
    const restored = restoreVirtualizedReadingAnchor(scroller, anchor);
    if (scroller.scrollTop !== before)
      correctedScrollTopRef.current = scroller.scrollTop;
    return restored || reading;
  }, [cancelFrame, getScroller, hasReadingInteraction]);

  const pinToBottom = React.useCallback((): boolean => {
    const scroller = getScroller();
    const list = listRef.current;
    const lastIndex = itemsLengthRef.current - 1;
    if (!scroller || !list || lastIndex < 0 || !bottomIntentRef.current)
      return false;
    if (
      list.scrollSize - list.viewportSize - list.scrollOffset > 1 ||
      !Number.isFinite(list.scrollSize - list.viewportSize - list.scrollOffset)
    ) {
      list.scrollToIndex(lastIndex, { align: "end" });
    }
    return true;
  }, [getScroller, itemsLengthRef, listRef]);

  // Explicit mount/own-send navigation may intentionally leave a reading anchor.
  const settle = React.useCallback((): boolean => {
    cancelFrame();
    anchorRef.current = null;
    hoveredRowRef.current = null;
    navigationOwnsPositionRef.current = false;
    bottomIntentRef.current = true;
    return pinToBottom();
  }, [cancelFrame, pinToBottom]);
  const settleAfterLayout = React.useCallback((): boolean => {
    const scroller = getScroller();
    if (
      !scroller ||
      preserveReadingPosition() ||
      navigationOwnsPositionRef.current
    )
      return false;
    if (!bottomIntentRef.current && !isNearVirtualizedBottom(scroller))
      return false;
    bottomIntentRef.current = true;
    return pinToBottom();
  }, [getScroller, pinToBottom, preserveReadingPosition]);
  const isBottomPinned = React.useCallback(() => {
    const scroller = getScroller();
    return (
      !!scroller && bottomIntentRef.current && !hasReadingInteraction(scroller)
    );
  }, [getScroller, hasReadingInteraction]);
  const correctPosition = React.useCallback(() => {
    if (!preserveReadingPosition()) pinToBottom();
  }, [pinToBottom, preserveReadingPosition]);
  const scheduleCorrection = React.useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      correctPosition();
    });
  }, [correctPosition]);
  const resumeIfIdleAtBottom = React.useCallback(() => {
    const scroller = getScroller();
    if (
      !scroller ||
      navigationOwnsPositionRef.current ||
      hasReadingInteraction(scroller)
    )
      return;
    if (!isNearVirtualizedBottom(scroller)) {
      // Once hover/edit ownership ends in history, the first visible row is
      // the continuing reading anchor, rather than a no-longer-hovered row.
      anchorRef.current = captureVirtualizedReadingAnchor(scroller);
      return;
    }
    anchorRef.current = null;
    bottomIntentRef.current = true;
    onReadingIntentChangeRef.current?.(true);
    scheduleCorrection();
  }, [getScroller, hasReadingInteraction, scheduleCorrection]);

  React.useLayoutEffect(() => {
    const scroller = getScroller();
    if (!scroller) return;
    const retireForNavigation = () => {
      bottomIntentRef.current = false;
      navigationOwnsPositionRef.current = false;
      hoveredRowRef.current = null;
      anchorRef.current = captureVirtualizedReadingAnchor(scroller);
      cancelFrame();
      onReadingIntentChangeRef.current?.(false);
    };
    const pointerDown = (event: PointerEvent) => {
      if (event.target === scroller) retireForNavigation();
    };
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) retireForNavigation();
    };
    const pointerMove = (event: PointerEvent) => {
      const row =
        event.target instanceof HTMLElement
          ? event.target.closest<HTMLElement>("[data-message-id]")
          : null;
      if (row && scroller.contains(row)) {
        if (hoveredRowRef.current !== row)
          anchorRef.current = captureVirtualizedReadingAnchor(scroller, row);
        hoveredRowRef.current = row;
        bottomIntentRef.current = false;
        cancelFrame();
        onReadingIntentChangeRef.current?.(false);
      } else {
        hoveredRowRef.current = null;
        resumeIfIdleAtBottom();
      }
    };
    const pointerLeave = () => {
      hoveredRowRef.current = null;
      resumeIfIdleAtBottom();
    };
    const readingInput = () => {
      if (hasReadingInteraction(scroller)) {
        preserveReadingPosition();
        onReadingIntentChangeRef.current?.(false);
      } else resumeIfIdleAtBottom();
    };
    const focusOut = () => queueMicrotask(readingInput);
    const keyDown = (event: KeyboardEvent) => {
      if (
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        event.target instanceof Node &&
        scroller.contains(event.target) &&
        !isEditableKeyboardTarget(event.target) &&
        SCROLL_INTENT_KEYS.has(event.key)
      )
        retireForNavigation();
    };
    const scroll = () => {
      if (correctedScrollTopRef.current === scroller.scrollTop) {
        correctedScrollTopRef.current = null;
        return;
      }
      if (!bottomIntentRef.current && !hasReadingInteraction(scroller)) {
        anchorRef.current = captureVirtualizedReadingAnchor(scroller);
        resumeIfIdleAtBottom();
      }
    };
    scroller.addEventListener("pointerdown", pointerDown, { passive: true });
    scroller.addEventListener("pointermove", pointerMove, { passive: true });
    scroller.addEventListener("pointerleave", pointerLeave, { passive: true });
    scroller.addEventListener("touchmove", retireForNavigation, {
      passive: true,
    });
    scroller.addEventListener("wheel", wheel, { passive: true });
    scroller.addEventListener("focusin", readingInput);
    scroller.addEventListener("focusout", focusOut);
    scroller.addEventListener("scroll", scroll, { passive: true });
    scroller.ownerDocument.addEventListener("selectionchange", readingInput);
    window.addEventListener("keydown", keyDown, true);
    return () => {
      scroller.removeEventListener("pointerdown", pointerDown);
      scroller.removeEventListener("pointermove", pointerMove);
      scroller.removeEventListener("pointerleave", pointerLeave);
      scroller.removeEventListener("touchmove", retireForNavigation);
      scroller.removeEventListener("wheel", wheel);
      scroller.removeEventListener("focusin", readingInput);
      scroller.removeEventListener("focusout", focusOut);
      scroller.removeEventListener("scroll", scroll);
      scroller.ownerDocument.removeEventListener(
        "selectionchange",
        readingInput,
      );
      window.removeEventListener("keydown", keyDown, true);
    };
  }, [
    cancelFrame,
    getScroller,
    hasReadingInteraction,
    preserveReadingPosition,
    resumeIfIdleAtBottom,
  ]);

  React.useLayoutEffect(() => {
    correctPosition();
  });
  React.useLayoutEffect(() => {
    const scroller = getScroller();
    const content = scroller?.firstElementChild;
    if (
      !scroller ||
      !(content instanceof HTMLElement) ||
      typeof ResizeObserver === "undefined"
    )
      return;
    // Reuse the existing measurement observer for both owners. It never writes
    // React state and coalesces physical corrections to one animation frame.
    const observer = new ResizeObserver(scheduleCorrection);
    observer.observe(content);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [getScroller, scheduleCorrection]);
  React.useEffect(() => cancelFrame, [cancelFrame]);
  return {
    cancel,
    settle,
    settleAfterLayout,
    preserveReadingPosition,
    isBottomPinned,
  };
}
