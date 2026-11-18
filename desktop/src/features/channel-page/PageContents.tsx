import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import * as React from "react";

import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";

import type { PageHeading } from "./sandbox";

type ContentsProps = {
  headings: PageHeading[];
  onSelect: (id: string) => void;
};

function ContentsList({
  headings,
  onSelect,
  id,
  hidden,
}: ContentsProps & { id?: string; hidden?: boolean }) {
  return (
    <nav aria-label="Page contents" id={id} hidden={hidden}>
      <ul className="space-y-0.5">
        {headings.map(({ id, level, text }) => (
          <li key={id}>
            <button
              type="button"
              className={cn(
                "w-full break-words rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
                level === 2 && "pl-5",
                level === 3 && "pl-8",
              )}
              onClick={() => onSelect(id)}
            >
              {text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function PageContentsPopover({ headings, onSelect }: ContentsProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          Contents
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label="Page contents"
        className="max-h-(--radix-popover-content-available-height) overflow-auto p-2"
      >
        <ContentsList
          headings={headings}
          onSelect={(id) => {
            onSelect(id);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export function PageContentsRail({
  channelId,
  ...list
}: ContentsProps & { channelId: string }) {
  const storageKey = `buzz.page.toc.${channelId}`;
  const listId = React.useId();
  const [collapsed, setCollapsed] = React.useState(() => {
    try {
      return localStorage.getItem(storageKey) === "collapsed";
    } catch {
      return false;
    }
  });
  const action = collapsed ? "Show contents" : "Hide contents";
  return (
    <div
      className={cn(
        "min-h-0 shrink-0 overflow-y-auto border-r pr-2",
        !collapsed && "w-[220px]",
      )}
    >
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={action}
        title={action}
        aria-expanded={!collapsed}
        aria-controls={listId}
        onClick={() => {
          const next = !collapsed;
          setCollapsed(next);
          try {
            if (next) localStorage.setItem(storageKey, "collapsed");
            else localStorage.removeItem(storageKey);
          } catch {
            // The in-view preference still works when storage is unavailable.
          }
        }}
      >
        {collapsed ? (
          <PanelLeftOpen aria-hidden />
        ) : (
          <PanelLeftClose aria-hidden />
        )}
      </Button>
      <ContentsList {...list} id={listId} hidden={collapsed} />
    </div>
  );
}
