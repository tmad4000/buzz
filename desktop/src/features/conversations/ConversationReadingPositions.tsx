import * as React from "react";
import type {
  TimelineReadingPosition,
  ReadingRestoreStop,
} from "@/features/messages/ui/timelineReadingPosition";
import { ConversationViewContext } from "./ConversationViewContext";
import { captureViewportReadingPosition } from "./viewportReadingCapture";
import {
  readPosition,
  type ViewReadingPositions,
} from "./layout/readingPositions";

export type ConversationReadingProps = {
  readingPositions?: ViewReadingPositions;
  onReadingPosition?: (
    key: string,
    position: TimelineReadingPosition,
  ) => boolean;
  registerReadingCapture?: (
    key: string,
    capture: () => TimelineReadingPosition | null,
  ) => () => void;
};
const ReadingContext = React.createContext<{
  read: (key: string) => TimelineReadingPosition | undefined;
  save: (key: string, position: TimelineReadingPosition) => boolean;
  register: (
    key: string,
    capture: () => TimelineReadingPosition | null,
  ) => () => void;
  restored: (key: string) => boolean;
  beginRestore: (key: string) => void;
  completeRestore: (key: string) => void;
  interacted: (key: string) => boolean;
  interaction: (key: string) => void;
} | null>(null);

/** Context only: preserve existing thread/composer DOM ancestry. */
export function ConversationReadingPositionsProvider({
  children,
  ...props
}: ConversationReadingProps & { children: React.ReactNode }) {
  const current = React.useRef(props);
  current.current = props;
  const [value] = React.useState(() => {
    const active = new Map<string, number>();
    const restored = new Set<string>();
    const interactions = new Set<string>();
    return {
      read: (key: string) =>
        readPosition(current.current.readingPositions, key),
      save: (key: string, position: TimelineReadingPosition) =>
        current.current.onReadingPosition?.(key, position) ?? false,
      register: (
        key: string,
        capture: () => TimelineReadingPosition | null,
      ) => {
        active.set(key, (active.get(key) ?? 0) + 1);
        const stop = current.current.registerReadingCapture?.(key, capture);
        let stopped = false;
        return () => {
          if (stopped) return;
          stopped = true;
          stop?.();
          const count = (active.get(key) ?? 1) - 1;
          if (count > 0) active.set(key, count);
          else {
            active.delete(key);
            restored.delete(key);
            interactions.delete(key);
          }
        };
      },
      restored: (key: string) => restored.has(key),
      beginRestore: (key: string) => {
        restored.delete(key);
      },
      completeRestore: (key: string) => {
        if (active.has(key)) restored.add(key);
      },
      interacted: (key: string) => interactions.has(key),
      interaction: (key: string) => {
        if (active.has(key)) interactions.add(key);
      },
    };
  });
  return (
    <ReadingContext.Provider value={value}>{children}</ReadingContext.Provider>
  );
}

/** Capture is a DOM read, not a read acknowledgement, scroll, focus or reveal. */
export function useCaptureConversationReadingPosition({
  key,
  container,
  ids,
  ready,
}: {
  key: string | null;
  container: React.RefObject<HTMLElement | null>;
  ids: string[];
  ready: boolean;
}) {
  const scope = React.useContext(ReadingContext);
  const latest = React.useRef({ ids, ready });
  React.useLayoutEffect(() => {
    latest.current = { ids, ready };
  });
  React.useLayoutEffect(() => {
    const element = container.current;
    if (!scope || !key || !element) return;
    let mounted = true;
    let interacted = false;
    // Retain a saved slot until restoration settles or the reader interacts.
    const saved = scope.read(key);
    const capture = () => {
      if (
        !mounted ||
        !latest.current.ready ||
        (saved && !interacted && !scope.restored(key))
      )
        return null;
      return captureViewportReadingPosition(element, latest.current.ids);
    };
    const stop = scope.register(key, capture);
    const gesture = () => {
      if (!mounted) return;
      interacted = true;
      scope.interaction(key);
    };
    const save = () => {
      const position = capture();
      if (position) scope.save(key, position);
    };
    element.addEventListener("wheel", gesture, { passive: true });
    element.addEventListener("touchstart", gesture, { passive: true });
    element.addEventListener("keydown", gesture);
    element.addEventListener("pointerdown", gesture);
    element.addEventListener("scrollend", save);
    return () => {
      mounted = false;
      stop();
      element.removeEventListener("wheel", gesture);
      element.removeEventListener("touchstart", gesture);
      element.removeEventListener("keydown", gesture);
      element.removeEventListener("pointerdown", gesture);
      element.removeEventListener("scrollend", save);
    };
  }, [scope, key, container]);
}

/** One restore opportunity per context/DOM visit. Focus return cannot replay a
 * retired attempt; explicit mode/target changes create a new context visit. */
export function useRestoreConversationReadingPosition({
  key,
  container,
  ready,
  explicitTarget,
  restore,
}: {
  key: string;
  container: React.RefObject<HTMLElement | null>;
  ready: boolean;
  explicitTarget: boolean;
  restore: (
    position: TimelineReadingPosition,
    onStop: (reason: ReadingRestoreStop) => void,
  ) => (() => void) | undefined;
}) {
  const scope = React.useContext(ReadingContext);
  const view = React.useContext(ConversationViewContext);
  const latest = React.useRef(restore);
  React.useLayoutEffect(() => {
    latest.current = restore;
  });
  const [coverage, recheck] = React.useReducer((n: number) => n + 1, 0);
  const currentCoverage = React.useRef(coverage);
  currentCoverage.current = coverage;
  const attempted = React.useRef<{
    key: string;
    element: HTMLElement;
    started: boolean;
  } | null>(null);
  React.useLayoutEffect(() => {
    const element = container.current;
    if (!scope || !element) return;
    let mounted = true;
    const changed = () => {
      if (mounted) recheck();
    };
    const observer = new MutationObserver(changed);
    for (
      let node: HTMLElement | null = element;
      node;
      node = node.parentElement
    )
      observer.observe(node, {
        attributes: true,
        attributeFilter: ["hidden", "inert", "aria-hidden", "class", "style"],
      });
    window.addEventListener("focus", changed);
    window.addEventListener("blur", changed);
    document.addEventListener("visibilitychange", changed);
    return () => {
      mounted = false;
      observer.disconnect();
      window.removeEventListener("focus", changed);
      window.removeEventListener("blur", changed);
      document.removeEventListener("visibilitychange", changed);
    };
  }, [scope, container]);
  React.useLayoutEffect(() => {
    const element = container.current;
    if (!scope || !view || !element) return;
    if (attempted.current?.key !== key || attempted.current.element !== element)
      attempted.current = { key, element, started: false };
    const attempt = attempted.current;
    if (explicitTarget) {
      attempt.started = true;
      scope.completeRestore(key);
      return;
    }
    if (attempt.started) return;
    if (scope.interacted(key)) {
      attempt.started = true;
      scope.completeRestore(key);
      return;
    }
    if (!ready) return;
    const snapshot = scope.read(key);
    if (!snapshot) {
      attempt.started = true;
      scope.completeRestore(key);
      return;
    }
    if (
      !view.focused ||
      !view.visible ||
      view.interactive === false ||
      !element.isConnected ||
      view.rootRef?.current?.dataset.focusedConversation !== "true" ||
      document.visibilityState !== "visible" ||
      !document.hasFocus() ||
      element.closest('[hidden], [inert], [aria-hidden="true"]') ||
      element.getClientRects().length === 0
    )
      return;
    attempt.started = true;
    scope.beginRestore(key);
    let active = true;
    const stop = latest.current(snapshot, (reason) => {
      if (
        active &&
        currentCoverage.current === coverage &&
        (reason === "complete" || reason === "gesture")
      )
        scope.completeRestore(key);
    });
    return () => {
      active = false;
      stop?.();
    };
  }, [scope, key, container, ready, explicitTarget, view, coverage]);
}
