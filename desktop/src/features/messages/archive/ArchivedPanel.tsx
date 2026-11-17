import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { getEventsByIds } from "@/shared/api/tauriEvents";
import { Button } from "@/shared/ui/button";
import { getChannelIdFromTags } from "../lib/threading";
import { useArchive } from "./ArchiveProvider";
import { archiveKey } from "./model";

export function ArchivedPanel({
  availableChannelIds,
  onOpen,
}: {
  availableChannelIds: ReadonlySet<string>;
  onOpen: (
    channelId: string,
    messageId: string,
    rootId?: string | null,
  ) => void;
}) {
  const archive = useArchive();
  const entries = React.useMemo(
    () =>
      [...archive.records.values()]
        .filter((entry) => availableChannelIds.has(entry.channelId))
        .sort(
          (a, b) =>
            b.archivedAt - a.archivedAt || a.targetId.localeCompare(b.targetId),
        ),
    [archive.records, availableChannelIds],
  );
  const ids = entries.map((entry) => entry.targetId);
  const sources = useQuery({
    queryKey: ["personal-archive-sources", ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const result = [];
      for (let index = 0; index < ids.length; index += 100)
        result.push(...(await getEventsByIds(ids.slice(index, index + 100))));
      return result;
    },
  });
  const events = new Map(sources.data?.map((event) => [event.id, event]));
  return (
    <section
      aria-label="Archived"
      className="min-h-0 flex-1 overflow-auto px-3 py-3"
      data-testid="archived-panel"
    >
      <p className="mb-3 text-xs text-muted-foreground">
        Archived just for you. New replies restore archived threads.
      </p>
      {!archive.ready ? (
        <p className="text-sm text-muted-foreground">Syncing archive…</p>
      ) : null}
      {archive.ready && !entries.length ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No archived messages
        </p>
      ) : null}
      {sources.isError ? (
        <div className="text-sm text-muted-foreground">
          Message previews could not load.{" "}
          <button
            type="button"
            className="text-primary"
            onClick={() => {
              void sources.refetch();
            }}
          >
            Retry
          </button>
        </div>
      ) : null}
      {entries.map((entry) => {
        const event = events.get(entry.targetId);
        const valid =
          event && getChannelIdFromTags(event.tags) === entry.channelId;
        return (
          <div
            key={archiveKey(entry.kind, entry.targetId)}
            className="group flex items-start gap-2 border-b border-border/40 py-3"
          >
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => {
                archive.setShowArchived(entry.channelId, true);
                onOpen(
                  entry.channelId,
                  entry.targetId,
                  entry.kind === "thread" || entry.rootId !== entry.targetId
                    ? entry.rootId
                    : null,
                );
              }}
            >
              <span className="block text-xs font-medium text-muted-foreground">
                {entry.kind === "thread" ? "Thread" : "Message"} ·{" "}
                {new Date(entry.archivedAt).toLocaleDateString()}
              </span>
              <span className="mt-1 line-clamp-3 block break-words text-sm">
                {valid
                  ? event.content
                  : sources.isPending
                    ? "Loading message…"
                    : "Open archived message"}
              </span>
            </button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => archive.restore(entry)}
            >
              Unarchive
            </Button>
          </div>
        );
      })}
    </section>
  );
}
