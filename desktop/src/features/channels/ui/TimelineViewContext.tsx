import * as React from "react";
import type { TimelineMessage } from "@/features/messages/types";

export type ChannelViewMode = "threads" | "timeline";
export const timelinePreferenceKey = (scope: string, channelId: string) =>
  `buzz.channelView.v1:${encodeURIComponent(scope)}:${channelId}`;

/** A local view preference; never changes signed message or thread data. */
export function useChannelViewMode(scope: string, channelId: string | null) {
  const key = timelinePreferenceKey(scope, channelId ?? "none");
  const [preferences, setPreferences] = React.useState<
    Record<string, ChannelViewMode>
  >({});
  let stored: ChannelViewMode = "threads";
  try {
    if (globalThis.localStorage?.getItem(key) === "timeline")
      stored = "timeline";
  } catch {
    /* In-memory switching still works when storage is unavailable. */
  }
  const mode = preferences[key] ?? stored;
  const changeMode = React.useCallback(
    (next: ChannelViewMode) => {
      setPreferences((previous) => ({ ...previous, [key]: next }));
      try {
        globalThis.localStorage?.setItem(key, next);
      } catch {
        /* Best effort. */
      }
    },
    [key],
  );
  return { mode, changeMode };
}

type TimelineView = {
  mode: ChannelViewMode;
  changeMode: (mode: ChannelViewMode) => void;
  messagesById?: ReadonlyMap<string, TimelineMessage>;
  openReply?: (message: TimelineMessage) => void;
  loadingReplies?: boolean;
  onRepliesRevealed?: (messages: TimelineMessage[], rootId?: string) => void;
};
export const TimelineViewContext = React.createContext<TimelineView>({
  mode: "threads",
  changeMode: () => {},
});
export const useTimelineView = () => React.useContext(TimelineViewContext);

export function ChannelViewToggle() {
  const { mode, changeMode } = useTimelineView();
  return (
    <fieldset
      aria-label="Channel view"
      className="flex shrink-0 rounded-lg border border-border bg-muted/40 p-0.5"
    >
      {(["threads", "timeline"] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={mode === value}
          onClick={() => changeMode(value)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-primary ${mode === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          {value === "threads" ? "Threads" : "Timeline"}
        </button>
      ))}
    </fieldset>
  );
}
