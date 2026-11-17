import * as React from "react";
import type { MainTimelineEntry } from "../lib/threadPanel";
import { useArchive } from "./ArchiveProvider";

/** Projection only. Canonical events, parent/root IDs and seen markers are untouched. */
export function buildArchiveRuns(
  entries: MainTimelineEntry[],
  hidden: (entry: MainTimelineEntry) => boolean,
) {
  const runs = new Map<string, { first: boolean; ids: string[] }>();
  let ids: string[] = [];
  const flush = () => {
    ids.forEach((id, index) => {
      runs.set(id, { first: index === 0, ids });
    });
    ids = [];
  };
  for (const entry of entries) {
    if (hidden(entry)) ids.push(entry.message.id);
    else flush();
  }
  flush();
  return runs;
}
const RevealContext = React.createContext<{
  ids: ReadonlySet<string>;
  show: (ids: string[]) => void;
}>({ ids: new Set(), show: () => {} });
export function ArchiveRunProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [ids, setIds] = React.useState<ReadonlySet<string>>(new Set());
  const value = React.useMemo(
    () => ({
      ids,
      show: (added: string[]) =>
        setIds((current) => new Set([...current, ...added])),
    }),
    [ids],
  );
  return (
    <RevealContext.Provider value={value}>{children}</RevealContext.Provider>
  );
}
export function ArchiveEntry({
  run,
  id,
  children,
}: {
  run?: { first: boolean; ids: string[] };
  id: string;
  children: React.ReactNode;
}) {
  const reveal = React.useContext(RevealContext);
  if (!run) return <>{children}</>;
  const shown = reveal.ids.has(id);
  return (
    <>
      {run.first ? (
        <div
          className="mx-3 my-1 flex items-center gap-1 text-xs text-muted-foreground"
          data-testid="archived-run"
        >
          <span>{run.ids.length} archived ·</span>
          <button
            type="button"
            className="rounded px-1 py-1 text-primary hover:underline"
            onClick={() => reveal.show(run.ids)}
          >
            Show
          </button>
        </div>
      ) : null}
      {shown ? children : null}
    </>
  );
}
/** Inline replies don't share the main row stream; still hide archived bodies. */
export function ArchivedReply({
  channelId,
  message,
  children,
}: {
  channelId?: string | null;
  message: { id: string; rootId?: string | null };
  children: React.ReactNode;
}) {
  const archive = useArchive();
  const [show, setShow] = React.useState(false);
  if (
    !channelId ||
    !archive.isArchived(channelId, message.id, message.rootId) ||
    archive.showArchived(channelId) ||
    show
  )
    return <>{children}</>;
  return (
    <div className="mx-3 my-1 text-xs text-muted-foreground">
      1 archived ·{" "}
      <button
        type="button"
        className="text-primary hover:underline"
        onClick={() => setShow(true)}
      >
        Show
      </button>
    </div>
  );
}
