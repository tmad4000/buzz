import { BusyThreadSuggestions } from "./BusyThreadSuggestions";
import type { ChannelWindowThreadSummary } from "@/features/messages/lib/channelWindowStore";
import { useOpenThreadPins } from "../lib/openThreadPinStore";
import * as React from "react";
import type { MainTimelineEntry } from "@/features/messages/lib/threadPanel";
import type { TimelineMessage } from "@/features/messages/types";
import {
  filterOpenThreadPins,
  MAX_OPEN_THREAD_PINS,
  type OpenThreadPin,
} from "../lib/openThreadPins";

type Props = {
  storageKey: string;
  threadSummaries?: ReadonlyMap<string, ChannelWindowThreadSummary>;
  entries: readonly MainTimelineEntry[];
  currentThread: TimelineMessage | null;
  onOpen: (message: TimelineMessage) => void;
};
/** Manual first slice; automatic membership awaits a trusted work adapter. */
export function OpenThreadsBar({
  storageKey,
  threadSummaries,
  entries,
  currentThread,
  onOpen,
}: Props) {
  const {
    pins,
    addPin,
    removePin,
    sessionOnly: pinsSessionOnly,
  } = useOpenThreadPins(storageKey);
  const [expanded, setExpanded] = React.useState(() => {
    try {
      return localStorage.getItem(`${storageKey}:expanded`) === "true";
    } catch {
      return false;
    }
  });
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState("");
  const [undo, setUndo] = React.useState<{
    pin: OpenThreadPin;
    index: number;
  } | null>(null);
  const [sessionOnly, setSessionOnly] = React.useState(false);
  const regionId = React.useId();
  const byId = new Map(
    entries
      .filter(
        (entry) =>
          !entry.message.parentId &&
          !entry.message.pending &&
          !entry.message.id.startsWith("optimistic-"),
      )
      .map((entry) => [entry.message.id, entry.message]),
  );
  if (
    currentThread &&
    !currentThread.pending &&
    !currentThread.id.startsWith("optimistic-") &&
    (!currentThread.rootId || currentThread.rootId === currentThread.id)
  )
    byId.set(currentThread.id, currentThread);
  const matches = filterOpenThreadPins(pins, query);
  return (
    <section
      className="relative mx-5 mb-1 rounded-lg border border-border bg-background text-xs"
      aria-label="Open threads"
    >
      <button
        type="button"
        className="w-full px-3 py-2 text-left font-medium"
        aria-expanded={expanded}
        aria-controls={regionId}
        onClick={() => {
          setExpanded(!expanded);
          try {
            localStorage.setItem(`${storageKey}:expanded`, String(!expanded));
          } catch {
            setSessionOnly(true);
          }
        }}
      >
        Open threads · {pins.length} pinned · This chat {expanded ? "▴" : "▾"}
      </button>
      {expanded ? (
        <div id={regionId} className="space-y-2 border-t border-border p-2">
          <p className="text-muted-foreground">
            Automatic tracking unavailable. Pinned references only; removing one
            does not finish work or mark it read.
          </p>
          {sessionOnly || pinsSessionOnly ? (
            <p role="status">
              Changes are session-only; storage is unavailable.
            </p>
          ) : null}
          <BusyThreadSuggestions
            storageKey={storageKey}
            entries={entries}
            threadSummaries={threadSummaries}
          />
          <div className="flex gap-2">
            <input
              aria-label="Search open threads"
              className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1"
              placeholder="Search pinned threads"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")}>
                Clear
              </button>
            ) : null}
          </div>
          {query ? (
            <p>
              {matches.length} matches of {pins.length}
            </p>
          ) : null}
          <ul className="max-h-40 space-y-1 overflow-auto">
            {matches.map((pin) => (
              <li key={pin.id} className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!byId.has(pin.id)}
                  className="min-w-0 flex-1 truncate rounded px-1 py-1 text-left disabled:opacity-60"
                  onClick={() => {
                    const message = byId.get(pin.id);
                    if (message && currentThread?.id !== message.id)
                      onOpen(message);
                  }}
                >
                  {pin.title || "Untitled thread"}
                  {!byId.has(pin.id) ? " · Outside loaded history" : ""}
                </button>
                <button
                  type="button"
                  className="px-2 py-1"
                  aria-label={`Remove ${pin.title} from bar`}
                  onClick={() => {
                    setUndo({
                      pin,
                      index: pins.findIndex((item) => item.id === pin.id),
                    });
                    removePin(pin.id);
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          {matches.length === 0 ? (
            <p className="text-muted-foreground">
              {query
                ? "No matching open threads."
                : "Pin a thread to keep it here."}
            </p>
          ) : null}
          <div className="flex gap-2">
            <select
              aria-label="Thread to pin"
              className="min-w-0 flex-1 rounded border border-border bg-background p-1"
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              <option value="">Choose a loaded thread…</option>
              {[...byId.values()]
                .filter((message) => !pins.some((pin) => pin.id === message.id))
                .map((message) => (
                  <option key={message.id} value={message.id}>
                    {message.body.split("\n")[0].slice(0, 120) ||
                      "Untitled thread"}
                  </option>
                ))}
            </select>
            <button
              type="button"
              disabled={
                !byId.has(selected) || pins.length >= MAX_OPEN_THREAD_PINS
              }
              onClick={() => {
                const message = byId.get(selected);
                if (!message) return;
                addPin({
                  id: message.id,
                  title: message.body.split("\n")[0].slice(0, 240),
                });
                setSelected("");
              }}
            >
              Pin here
            </button>
            {undo ? (
              <button
                type="button"
                onClick={() => {
                  addPin(undo.pin, undo.index);
                  setUndo(null);
                }}
              >
                Undo removal
              </button>
            ) : null}
          </div>
          {pins.length >= MAX_OPEN_THREAD_PINS ? (
            <p>100 pinned references. Remove one to add another.</p>
          ) : null}
          <p className="text-muted-foreground">
            Thread picker covers loaded history. Pins stay on this device.
          </p>
        </div>
      ) : null}
    </section>
  );
}
