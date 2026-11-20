import * as React from "react";
import type { RouterHistory } from "@tanstack/react-router";
import { traverseHistory } from "@/app/navigation/navigationGuard";
import type { OutboxSubmission } from "../outbox/types";
import { Button } from "@/shared/ui/button";
import { createSendScrollHistory } from "./sendScrollHistory";
import { getStayWhenSending } from "./sendScrollPreference";
import type { TimelineReadingPosition } from "./timelineReadingPosition";

const PILL_MS = 30_000;
const SCROLL_KEYS = new Set([
  "PageUp",
  "PageDown",
  "Home",
  "End",
  "ArrowUp",
  "ArrowDown",
  " ",
]);

export function isMoreThanViewportFromBottom(
  container: Pick<HTMLElement, "clientHeight" | "scrollHeight" | "scrollTop">,
): boolean {
  return (
    container.clientHeight > 0 &&
    container.scrollHeight - container.clientHeight - container.scrollTop >
      container.clientHeight
  );
}

type ReadingView = {
  container: HTMLElement | null;
  capture: () => TimelineReadingPosition | null;
  prepare: (id: string | null) => void;
  jump: (id: string) => boolean;
  restore: (position: TimelineReadingPosition) => (() => void) | undefined;
};

type Notice = { kind: "return" } | { kind: "sent"; id: string };
type Attempt = {
  published: (id?: string) => void;
  cancel: () => void;
  bindOutbox: (submission?: OutboxSubmission) => OutboxSubmission | undefined;
};

function observeManualScroll(container: HTMLElement, notify: () => void) {
  let intendedAt: number | null = null;
  let previousTop = container.scrollTop;
  const intent = () => {
    intendedAt = performance.now();
    previousTop = container.scrollTop;
  };
  const onScroll = () => {
    if (
      intendedAt === null ||
      performance.now() - intendedAt > 500 ||
      container.scrollTop === previousTop
    )
      return;
    intendedAt = null;
    notify();
  };
  const key = (event: KeyboardEvent) => {
    if (
      !event.altKey &&
      !event.metaKey &&
      !event.ctrlKey &&
      SCROLL_KEYS.has(event.key) &&
      !(
        event.target instanceof Element &&
        event.target.closest(
          "input, textarea, select, button, [contenteditable=true]",
        )
      )
    )
      intent();
  };
  const pointer = (event: PointerEvent) => {
    if (event.target === container && event.pointerType === "mouse") {
      const bounds = container.getBoundingClientRect();
      if (event.clientX >= bounds.left + container.clientWidth - 14) intent();
    }
  };
  container.addEventListener("wheel", intent, { passive: true });
  container.addEventListener("touchmove", intent, { passive: true });
  container.addEventListener("pointerdown", pointer);
  container.addEventListener("keydown", key);
  container.addEventListener("scroll", onScroll);
  return () => {
    container.removeEventListener("wheel", intent);
    container.removeEventListener("touchmove", intent);
    container.removeEventListener("pointerdown", pointer);
    container.removeEventListener("keydown", key);
    container.removeEventListener("scroll", onScroll);
  };
}

/** One confirmation and optional Back entry for a mounted reading view. */
export function useSendScrollReturn({
  getView,
  history,
  scope,
}: {
  getView: () => ReadingView;
  history: RouterHistory | undefined;
  scope: string | null;
}) {
  const view = React.useRef(getView);
  view.current = getView;
  const [notice, setNotice] = React.useState<Notice | null>(null);
  const owner = React.useMemo(
    () => ({
      history,
      scope,
      active: false,
      effects: undefined as (() => void) | undefined,
      restore: undefined as (() => void) | undefined,
      entry: history ? createSendScrollHistory(history) : undefined,
    }),
    [history, scope],
  );

  React.useLayoutEffect(() => {
    owner.active = true;
    setNotice(null);
    const unsubscribe = owner.entry?.subscribe(() => {
      owner.effects?.();
      setNotice(null);
    });
    return () => {
      owner.active = false;
      unsubscribe?.();
      owner.effects?.();
      owner.entry?.clear();
      owner.restore?.();
    };
  }, [owner]);

  const reveal = (
    id: string,
    position: TimelineReadingPosition,
    container: HTMLElement,
  ) => {
    const history = owner.history;
    if (!history || !owner.entry) return;
    owner.effects?.();
    setNotice(null);
    view.current().prepare(id);
    const before = history.location;
    const focused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    let frame = 0;
    let timer = 0;
    const stopManual = observeManualScroll(container, () => {
      owner.effects?.();
      setNotice(null);
    });
    owner.effects = () => {
      cancelAnimationFrame(frame);
      view.current().prepare(null);
      window.clearTimeout(timer);
      stopManual();
    };
    let frames = 0;
    const jump = () => {
      if (
        !owner.active ||
        history.location !== before ||
        view.current().container !== container
      ) {
        owner.effects?.();
        return;
      }
      if (++frames > 90) {
        owner.effects?.();
        setNotice({ kind: "sent", id });
        return;
      }
      if (!view.current().jump(id)) {
        frame = requestAnimationFrame(jump);
        return;
      }

      view.current().prepare(null);
      const armed = owner.entry?.push(() => {
        owner.effects?.();
        owner.restore?.();
        owner.restore = view.current().restore(position);
        if (focused?.isConnected) focused.focus({ preventScroll: true });
      });
      if (armed) {
        setNotice({ kind: "return" });
        timer = window.setTimeout(() => {
          setNotice(null);
          stopManual();
        }, PILL_MS);
      }
    };
    frame = requestAnimationFrame(jump);
  };

  const capture = (): Attempt | undefined => {
    const { container, capture } = view.current();
    if (
      !owner.active ||
      !owner.scope ||
      !owner.history ||
      !container ||
      !isMoreThanViewportFromBottom(container)
    )
      return;
    const position = capture();
    if (!position?.id) return;
    const history = owner.history;
    const origin = history.location;
    const stay = getStayWhenSending();
    owner.effects?.();
    owner.restore?.();
    setNotice(null);
    let manuallyMoved = false;
    let cancelled = false;
    const stop = observeManualScroll(container, () => {
      manuallyMoved = true;
    });
    const cancel = () => {
      cancelled = true;
      stop();
    };
    owner.effects = cancel;

    return {
      cancel,
      bindOutbox: (submission) =>
        submission && {
          ...submission,
          onSuperseded: () => {
            cancel();
            submission.onSuperseded?.();
          },
        },
      published: (id) => {
        stop();
        if (
          cancelled ||
          !id ||
          !owner.active ||
          owner.effects !== cancel ||
          history.location !== origin ||
          view.current().container !== container
        )
          return;
        if (stay || manuallyMoved) setNotice({ kind: "sent", id });
        else reveal(id, position, container);
      },
    };
  };

  const noticeNode = notice ? (
    <Button
      className="absolute right-5 bottom-full z-20 mb-2 h-auto min-h-7 max-w-[calc(100%_-_2.5rem)] rounded-full bg-background px-3 py-1 text-xs shadow-sm"
      data-testid={
        notice.kind === "return" ? "send-scroll-back" : "send-scroll-sent"
      }
      type="button"
      variant="outline"
      onClick={() => {
        if (notice.kind === "return") {
          if (owner.history && owner.entry?.ownsCurrent())
            traverseHistory(owner.history, "back");
          return;
        }
        const current = view.current();
        const position = current.capture();
        if (position?.id && current.container)
          reveal(notice.id, position, current.container);
      }}
    >
      {notice.kind === "return" ? "↩ Back to where you were" : "Sent ↓"}
    </Button>
  ) : null;

  return { capture, notice: noticeNode };
}
