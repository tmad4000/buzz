import type { ReactNode } from "react";
import { formatRelativeTime } from "@/features/forum/lib/time";
import { Button } from "@/shared/ui/button";
import type { ResultCard as Result } from "./resultCards";

export function ResultCard({
  result,
  onOpen,
  onReply,
  onToggleExpanded,
  expanded = false,
  children,
}: {
  result: Result;
  onOpen: () => void;
  onReply?: () => void;
  onToggleExpanded?: () => void;
  expanded?: boolean;
  children?: ReactNode;
}) {
  return (
    <article className="min-w-0 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Reported done</span>
        <span className="min-w-0 wrap-anywhere">{result.agent}</span>
        <time dateTime={new Date(result.createdAt * 1000).toISOString()}>
          {formatRelativeTime(result.createdAt)}
        </time>
      </div>
      <p className="mt-1 wrap-anywhere text-sm font-semibold">{result.title}</p>
      <p className="mt-1 line-clamp-2 wrap-anywhere text-sm text-muted-foreground">
        {result.summary}
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`Open ${result.title}`}
          onClick={onOpen}
        >
          Open
        </Button>
        {onToggleExpanded ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-expanded={expanded}
            aria-label={`${expanded ? "Collapse" : "Expand"} ${result.title}`}
            onClick={onToggleExpanded}
          >
            {expanded ? "Collapse" : "Expand"}
          </Button>
        ) : null}
        {onReply ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label={`Reply to ${result.title}`}
            onClick={onReply}
          >
            Reply
          </Button>
        ) : null}
      </div>
      {expanded ? children : null}
    </article>
  );
}
