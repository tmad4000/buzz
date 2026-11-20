import { type ReactNode, useState } from "react";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/cn";
import { ResultCard } from "./ResultCard";
import type { ResultCard as Result } from "./resultCards";

export function ResultsBoard({
  cards,
  loading,
  error,
  hasOlder,
  loadingOlder,
  onLoadOlder,
  onRetry,
  onOpen,
  onReply,
  renderPage,
}: {
  cards: readonly Result[];
  loading: boolean;
  error: boolean;
  hasOlder: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  onRetry: () => void;
  onOpen: (card: Result) => void;
  onReply?: (card: Result) => void;
  renderPage: (card: Result) => ReactNode;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  return (
    <section
      aria-label="Results"
      className="@container min-h-0 min-w-0 flex-1 overflow-y-auto p-3 sm:p-4"
    >
      {error ? (
        <div
          role="status"
          className="mb-4 flex flex-wrap items-center gap-2 text-sm"
        >
          {cards.length
            ? "Some results may be missing."
            : "Could not load channel messages."}
          <Button size="sm" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : loading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading results…
        </p>
      ) : cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No results in loaded messages.
        </p>
      ) : null}
      <ul className="grid grid-cols-1 @xl:grid-cols-2 gap-3">
        {cards.map((card) => (
          <li
            key={card.sectionId}
            className={cn(
              "min-w-0",
              expandedId === card.sectionId && "col-span-full",
            )}
          >
            <ResultCard
              result={card}
              expanded={expandedId === card.sectionId}
              onOpen={() => onOpen(card)}
              onReply={onReply ? () => onReply(card) : undefined}
              onToggleExpanded={() =>
                setExpandedId((id) =>
                  id === card.sectionId ? null : card.sectionId,
                )
              }
            >
              {expandedId === card.sectionId ? (
                <div className="mt-3 flex h-105 min-w-0 overflow-auto">
                  {renderPage(card)}
                </div>
              ) : null}
            </ResultCard>
          </li>
        ))}
      </ul>
      {hasOlder ? (
        <Button
          className="mt-4"
          size="sm"
          variant="outline"
          disabled={loadingOlder}
          onClick={onLoadOlder}
        >
          {loadingOlder ? "Loading older messages…" : "Load older messages"}
        </Button>
      ) : null}
    </section>
  );
}
