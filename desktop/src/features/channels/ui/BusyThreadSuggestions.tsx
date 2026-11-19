import * as React from "react";
import type { MainTimelineEntry } from "@/features/messages/lib/threadPanel";
import type { ChannelWindowThreadSummary } from "@/features/messages/lib/channelWindowStore";
import { useOpenThreadPins } from "../lib/openThreadPinStore";
import { MAX_OPEN_THREAD_PINS } from "../lib/openThreadPins";
import {
  BUSY_REPLY_THRESHOLDS,
  parseBusyReplyThreshold,
  selectBusyThreadSuggestions,
} from "../lib/busyThreadSuggestions";

type Props = {
  storageKey: string;
  entries: readonly MainTimelineEntry[];
  threadSummaries?: ReadonlyMap<string, ChannelWindowThreadSummary>;
};

/** Suggestions never create pins until the reader explicitly clicks Pin. */
export function BusyThreadSuggestions({
  storageKey,
  entries,
  threadSummaries,
}: Props) {
  const { pins, addPin, dismissedSuggestions, dismissSuggestion } =
    useOpenThreadPins(storageKey);
  const preferencesKey = `${storageKey}:busySuggestions.v1`;
  const [preferences, setPreferences] = React.useState(() => {
    try {
      const value = JSON.parse(localStorage.getItem(preferencesKey) ?? "null");
      return {
        enabled: value?.enabled === true,
        threshold: parseBusyReplyThreshold(value?.threshold),
      };
    } catch {
      return { enabled: false, threshold: 20 };
    }
  });
  const [sessionOnly, setSessionOnly] = React.useState(false);
  const checkboxId = React.useId();
  const thresholdId = React.useId();
  const update = (next: typeof preferences) => {
    setPreferences(next);
    try {
      localStorage.setItem(preferencesKey, JSON.stringify(next));
    } catch {
      setSessionOnly(true);
    }
  };
  const suggestions = preferences.enabled
    ? selectBusyThreadSuggestions(
        entries,
        pins,
        dismissedSuggestions,
        preferences.threshold,
        threadSummaries,
      )
    : [];
  return (
    <div className="space-y-1 rounded border border-border/60 p-2 text-muted-foreground">
      <label className="flex items-center gap-2" htmlFor={checkboxId}>
        <input
          id={checkboxId}
          type="checkbox"
          checked={preferences.enabled}
          onChange={(event) =>
            update({ ...preferences, enabled: event.target.checked })
          }
        />
        Suggest busy threads
      </label>
      {preferences.enabled ? (
        <>
          <label className="flex items-center gap-2" htmlFor={thresholdId}>
            At least
            <select
              id={thresholdId}
              aria-label="Busy thread reply threshold"
              className="rounded border border-border bg-background p-1"
              value={preferences.threshold}
              onChange={(event) =>
                update({
                  ...preferences,
                  threshold: parseBusyReplyThreshold(event.target.value),
                })
              }
            >
              {BUSY_REPLY_THRESHOLDS.map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>{" "}
            replies · loaded threads
          </label>
          {suggestions.map(({ message, replyCount }) => (
            <div
              key={message.id}
              className="flex min-w-0 flex-wrap items-center gap-2"
            >
              <span
                className="min-w-0 flex-1 truncate"
                title={message.body.split("\n")[0]}
              >
                {message.body.split("\n")[0].slice(0, 120) || "Untitled thread"}{" "}
                · {replyCount} replies
              </span>
              <button
                type="button"
                disabled={pins.length >= MAX_OPEN_THREAD_PINS}
                className="rounded border border-border px-2 py-1 text-foreground"
                onClick={() =>
                  addPin({
                    id: message.id,
                    title: message.body.split("\n")[0].slice(0, 240),
                  })
                }
              >
                Pin this busy thread?
              </button>
              <button
                type="button"
                aria-label={`Dismiss busy-thread suggestion: ${message.body.split("\n")[0].slice(0, 120) || "Untitled thread"}`}
                onClick={() => dismissSuggestion(message.id)}
              >
                Dismiss
              </button>
            </div>
          ))}
          {suggestions.length === 0 ? (
            <p>No busy-thread suggestions in loaded history.</p>
          ) : null}
          <p>Suggestions only. Nothing is pinned automatically.</p>
        </>
      ) : null}
      {sessionOnly ? (
        <p role="status">
          Suggestion settings are session-only; storage is unavailable.
        </p>
      ) : null}
    </div>
  );
}
