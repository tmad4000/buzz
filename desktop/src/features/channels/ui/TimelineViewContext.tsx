import * as React from "react";
import type { TimelineInitiatorView } from "@/features/timeline-initiator/useTimelineInitiator";
import type { TimelineMessage } from "@/features/messages/types";

/** Stable per-channel order setting identities. */
export type ChannelOrderMode = "threads" | "activity" | "timeline";
export type ChannelViewMode = ChannelOrderMode;
const CHANNEL_ORDER_OPTIONS: readonly {
  value: ChannelOrderMode;
  label: string;
  available: boolean;
}[] = [
  { value: "threads", label: "Threads by post time", available: true },
  {
    value: "activity",
    label: "Latest activity",
    available: true,
  },
  { value: "timeline", label: "Timeline", available: true },
];
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
    const saved = globalThis.localStorage?.getItem(key);
    if (saved === "timeline" || saved === "activity") stored = saved;
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
  initiator?: TimelineInitiatorView;
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

/** One opt-in order setting; post-time Threads remains the default. */
export function ChannelOrderSetting() {
  const { mode, changeMode } = useTimelineView();
  return (
    <label className="flex shrink-0 items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1 text-xs">
      <span className="text-muted-foreground">Order</span>
      <select
        aria-label="Order"
        value={mode}
        onChange={(event) =>
          changeMode(
            event.target.value === "timeline"
              ? "timeline"
              : event.target.value === "activity"
                ? "activity"
                : "threads",
          )
        }
        className="min-w-0 max-w-48 bg-transparent font-medium text-foreground focus-visible:outline-2 focus-visible:outline-primary"
      >
        {CHANNEL_ORDER_OPTIONS.map(({ value, label, available }) => (
          <option key={value} value={value} disabled={!available}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
