import * as React from "react";
import type { TimelineReadingPosition } from "@/features/messages/ui/timelineReadingPosition";
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
} | null>(null);

/** Context only: preserve existing thread/composer DOM ancestry. */
export function ConversationReadingPositionsProvider({
  children,
  ...props
}: ConversationReadingProps & { children: React.ReactNode }) {
  const current = React.useRef(props);
  current.current = props;
  const [value] = React.useState(() => ({
    read: (key: string) => readPosition(current.current.readingPositions, key),
    save: (key: string, position: TimelineReadingPosition) =>
      current.current.onReadingPosition?.(key, position) ?? false,
    register: (key: string, capture: () => TimelineReadingPosition | null) =>
      current.current.registerReadingCapture?.(key, capture) ?? (() => {}),
  }));
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
    // Until restoration is wired, retain an existing saved slot rather than
    // overwrite it with a fresh mount's default position before user interaction.
    const saved = scope.read(key);
    const capture = () => {
      if (!mounted || !latest.current.ready || (saved && !interacted))
        return null;
      return captureViewportReadingPosition(element, latest.current.ids);
    };
    const stop = scope.register(key, capture);
    const gesture = () => {
      interacted = true;
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
