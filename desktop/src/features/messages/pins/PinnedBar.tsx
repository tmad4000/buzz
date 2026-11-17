import * as React from "react";
import { toast } from "sonner";
import { relayClient } from "@/shared/api/relayClient";
import type { RelayEvent } from "@/shared/api/types";
import { activePins, PIN_KIND, targetId } from "./model";
import { fetchPinHistory, setMessagePin } from "./service";

export function PinnedBar({
  channel,
  pubkey,
  onOpen,
}: {
  channel: string;
  pubkey: string;
  onOpen: (id: string) => void;
}) {
  const [events, setEvents] = React.useState<RelayEvent[]>([]);
  const [messages, setMessages] = React.useState<RelayEvent[]>([]);
  const [error, setError] = React.useState("");
  React.useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    setEvents([]);
    setMessages([]);
    setError("");
    const controller = new AbortController();
    relayClient
      .subscribeLive(
        { kinds: [PIN_KIND], limit: 500, "#h": [channel] },
        (event) => {
          if (!disposed)
            setEvents((old) => [
              ...old.filter((e) => e.id !== event.id),
              event,
            ]);
        },
        undefined,
        undefined,
        controller.signal,
      )
      .then((stop) => {
        if (disposed) stop();
        else unsubscribe = stop;
      })
      .catch((e) => {
        if (!disposed) setError(String(e));
      });
    void fetchPinHistory(channel)
      .then((history) => {
        if (!disposed) setEvents((old) => [...history, ...old]);
      })
      .catch((e) => {
        if (!disposed) setError(String(e));
      });
    return () => {
      disposed = true;
      controller.abort();
      unsubscribe?.();
    };
  }, [channel]);
  const pins = activePins(events, channel);
  const ids = [...new Set(pins.map((e) => targetId(e)!))].sort().join(",");
  React.useEffect(() => {
    let disposed = false;
    let inFlight = false;
    async function load() {
      if (inFlight) return;
      inFlight = true;
      try {
        if (!ids) {
          setMessages([]);
          return;
        }
        const roots = await relayClient.fetchEvents({
          ids: ids.split(","),
          kinds: [9, 40002, 40008, 45001, 45003],
          limit: 500,
          "#h": [channel],
        });
        const edits = (
          await Promise.all(
            roots.map((root) =>
              relayClient.fetchEvents({
                kinds: [40003],
                authors: [root.pubkey],
                "#h": [channel],
                "#e": [root.id],
                limit: 1,
              }),
            ),
          )
        ).flat();
        const deleted = await relayClient.fetchEvents({
          kinds: [5, 9005],
          "#h": [channel],
          "#e": ids.split(","),
          limit: 500,
        });
        const visible = roots.filter(
          (root) =>
            !deleted.some(
              (d) =>
                targetId(d) === root.id &&
                (d.kind === 9005 || d.pubkey === root.pubkey),
            ),
        );
        const projected = visible.map((root) => {
          const edit = edits
            .filter((e) => e.pubkey === root.pubkey && targetId(e) === root.id)
            .sort(
              (a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id),
            )[0];
          return { ...root, content: edit?.content ?? root.content };
        });
        if (!disposed) {
          setMessages(projected);
          setError("");
        }
      } finally {
        inFlight = false;
      }
    }
    void load().catch((e) => {
      if (!disposed) setError(String(e));
    });
    const timer = setInterval(() => {
      void load().catch((e) => {
        if (!disposed) setError(String(e));
      });
    }, 5000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [channel, ids]);
  if (!messages.length && !error) return null;
  return (
    <aside aria-label="Pinned messages" className="border-b px-5 py-2 text-sm">
      {error ? <p role="status">Pins unavailable: {error}</p> : null}
      {messages.map((message) => (
        <div key={message.id} className="flex items-center gap-3">
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left"
            onClick={() => onOpen(message.id)}
            title={message.content}
          >
            📌 {message.content}
          </button>
          {pins.some(
            (p) => targetId(p) === message.id && p.pubkey === pubkey,
          ) ? (
            <button
              type="button"
              onClick={() => {
                void setMessagePin(channel, message.id, false).catch((e) =>
                  toast.error(String(e)),
                );
              }}
            >
              Unpin
            </button>
          ) : null}
        </div>
      ))}
    </aside>
  );
}
