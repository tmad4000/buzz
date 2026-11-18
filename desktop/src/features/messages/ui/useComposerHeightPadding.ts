import * as React from "react";
import type { ScrollPositionLayout } from "./scrollPositionOwnership";

import { observeElementBlockSize } from "@/shared/layout/observeElementBlockSize";

export function shouldUseComposerPaddingFallback({
  nextPadding,
  previousPadding,
}: {
  nextPadding: number;
  previousPadding: number | null;
}): boolean {
  return previousPadding === null || nextPadding > previousPadding;
}

/**
 * Observes the height of the composer overlay and sets the scroll
 * container's `paddingBottom` to match, so content is never hidden
 * behind the absolutely-positioned composer.
 *
 * If the reader is already near the bottom, the legacy fallback follows only
 * initial measurement and growth. Consumers with semantic bottom ownership may
 * provide `settleAtBottom` to handle both growth and shrink safely.
 */
export function useComposerHeightPadding(
  scrollContainerRef: React.RefObject<HTMLElement | null>,
  composerRef: React.RefObject<HTMLElement | null>,
  resetKey?: unknown,
  mode: "padding" | "css-variable" = "padding",
  settleAtBottom?: () => boolean,
  layoutOwner?: ScrollPositionLayout,
) {
  const settleAtBottomRef = React.useRef(settleAtBottom);
  settleAtBottomRef.current = settleAtBottom;

  React.useEffect(() => {
    void resetKey;
    const scrollEl = scrollContainerRef.current;
    const composerEl = composerRef.current;

    if (!scrollEl || !composerEl) {
      return;
    }

    // In CSS-variable mode the timeline controls are siblings of the scroll
    // element. Set the measurement on their shared parent so both the virtual
    // trailing spacer and floating controls inherit the same live height.
    const cssVariableTarget = scrollEl.parentElement ?? scrollEl;

    const getScrollElement = (): HTMLElement =>
      mode === "css-variable"
        ? (scrollEl.querySelector<HTMLElement>(
            '[data-testid="message-timeline"]',
          ) ?? scrollEl)
        : scrollEl;

    let mounted = true;
    let deferredHeight: number | null = null;
    let lastPadding: number | null = null;
    let followBottomFrame: number | null = null;

    const isNearBottom = (): boolean => {
      const target = getScrollElement();
      const threshold = 32;
      const trailingClearance =
        mode === "css-variable" ? (lastPadding ?? 0) : 0;
      return (
        target.scrollHeight -
          target.scrollTop -
          target.clientHeight -
          trailingClearance <
        threshold
      );
    };

    const followBottom = () => {
      if (!mounted || layoutOwner?.blocked()) return;
      const target = getScrollElement();
      target.scrollTop = target.scrollHeight;
    };

    const applyPadding = (height: number) => {
      if (!mounted) return;
      if (layoutOwner?.blocked()) {
        deferredHeight = height;
        return;
      }
      deferredHeight = null;
      const padding = Math.ceil(height);
      if (lastPadding !== null && Math.abs(padding - lastPadding) <= 1) {
        return;
      }

      const previousPadding = lastPadding;
      const wasAtBottom = isNearBottom();

      if (mode === "css-variable") {
        cssVariableTarget.style.setProperty(
          "--composer-overlay-height",
          `${padding}px`,
        );
      } else {
        scrollEl.style.paddingBottom = `${padding}px`;
      }
      lastPadding = padding;

      if (wasAtBottom && previousPadding !== padding) {
        if (settleAtBottomRef.current?.()) {
          return;
        }
        if (
          !shouldUseComposerPaddingFallback({
            nextPadding: padding,
            previousPadding,
          })
        ) {
          return;
        }
        followBottom();
        if (followBottomFrame !== null) {
          cancelAnimationFrame(followBottomFrame);
        }
        followBottomFrame = requestAnimationFrame(() => {
          followBottomFrame = null;
          followBottom();
        });
      }
    };

    const unsubscribe = layoutOwner?.subscribe(() => {
      if (
        mounted &&
        layoutOwner &&
        !layoutOwner.blocked() &&
        deferredHeight !== null
      )
        applyPadding(deferredHeight);
    });
    const disconnect = observeElementBlockSize(composerEl, applyPadding);

    return () => {
      mounted = false;
      unsubscribe?.();
      disconnect();
      if (followBottomFrame !== null) {
        cancelAnimationFrame(followBottomFrame);
      }
      if (layoutOwner?.blocked()) return;
      if (mode === "css-variable") {
        cssVariableTarget.style.removeProperty("--composer-overlay-height");
      } else {
        scrollEl.style.paddingBottom = "";
      }
    };
  }, [scrollContainerRef, composerRef, mode, resetKey, layoutOwner]);
}
