import * as React from "react";
import type { MainTimelineEntry } from "../lib/threadPanel";
import { rankThreadDestinations } from "../lib/threadRouting";
import { Button } from "@/shared/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";

type Props = {
  entries: readonly MainTimelineEntry[];
  disabled: boolean;
  getDraft: () => string;
  onPick: (threadId: string | null) => void;
};
/** Explicit destination selection; opening and dismissal never publish. */
export function SendToThreadPicker({
  entries,
  disabled,
  getDraft,
  onPick,
}: Props) {
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const options = React.useMemo(
    () => (open ? rankThreadDestinations(entries, draft) : []),
    [open, entries, draft],
  );
  React.useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  const pick = (id: string | null) => {
    if (
      disabled ||
      (id !== null && !options.some((option) => option.id === id))
    )
      return;
    setOpen(false);
    onPick(id);
  };
  return (
    <Popover
      open={open && !disabled}
      onOpenChange={(next) => {
        if (next) setDraft(getDraft());
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          data-testid="send-to-thread"
        >
          Send to thread…
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        className="w-80 max-w-[calc(100vw-2rem)] p-2"
        aria-label="Send to thread"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          contentRef.current
            ?.querySelector<HTMLButtonElement>("button")
            ?.focus();
        }}
      >
        <div className="px-2 py-1 text-sm font-medium">
          Choose where to send
        </div>
        <p className="px-2 pb-2 text-xs text-muted-foreground">
          Top matches in loaded messages. Choose to send.
        </p>
        <div
          ref={contentRef}
          role="menu"
          aria-label="Thread destinations"
          onKeyDown={(event) => {
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            const buttons = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
            );
            const index = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? buttons.length - 1
                  : (index +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      buttons.length) %
                    buttons.length;
            buttons[next]?.focus();
          }}
        >
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitem"
              data-thread-destination={option.id}
              onClick={() => pick(option.id)}
              className="flex w-full flex-col gap-1 rounded-lg p-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
            >
              <span className="line-clamp-2 text-sm font-medium">
                {option.title}
              </span>
              <span className="text-xs text-muted-foreground">
                {option.author} · {option.replyCount}{" "}
                {option.replyCount === 1 ? "reply" : "replies"}
              </span>
              <span className="text-xs text-muted-foreground">
                {option.reason}
              </span>
            </button>
          ))}
          {!options.length && (
            <p className="p-2 text-xs text-muted-foreground">
              No existing threads loaded.
            </p>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => pick(null)}
            className="mt-1 w-full rounded-lg border-t p-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
          >
            New message
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
