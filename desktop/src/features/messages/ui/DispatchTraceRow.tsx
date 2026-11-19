import { Markdown } from "@/shared/ui/markdown";
import { parseImetaTags } from "@/shared/ui/markdown/parseImeta";
import * as React from "react";
import type { TimelineMessage } from "../types";

/** This is not a MessageRow: no read observer, mention delivery, reactions or reply actions. */
export function DispatchTraceRow({
  message,
  root,
  onOpen,
}: {
  message: TimelineMessage;
  root: TimelineMessage | null;
  onOpen?: (message: TimelineMessage, sourceId: string) => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const imeta = React.useMemo(
    () => parseImetaTags(message.tags ?? []),
    [message.tags],
  );
  const title =
    root?.body.replace(/\s+/g, " ").trim().slice(0, 120) || "thread";
  return (
    <div
      className="px-4 py-1 text-2xs text-muted-foreground"
      data-testid="dispatch-trace"
      data-dispatch-source-id={message.id}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="shrink-0">
          {message.author} · {message.time}
        </span>
        <span className="min-w-0 truncate">→ sent to “{title}”</span>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="rounded px-1 py-0.5 focus-visible:ring-2"
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      </div>
      {expanded ? (
        <div
          className="mt-1 rounded-md border border-border/40 p-3 text-sm"
          data-transcluded-source-id={message.id}
        >
          <Markdown
            content={message.body || "Attachment"}
            interactive={false}
            blockCode
            imetaByUrl={imeta}
            messageId={message.id}
            linkPreviewTags={message.tags}
          />
          {root && onOpen ? (
            <button
              type="button"
              className="mt-2 rounded text-xs underline focus-visible:ring-2"
              onClick={() => onOpen(root, message.id)}
            >
              Open thread
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
