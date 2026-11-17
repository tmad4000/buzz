import type * as React from "react";
import { Archive, ArchiveRestore } from "lucide-react";
import type { TimelineMessage } from "../types";
import { Button } from "@/shared/ui/button";
import { DropdownMenuItem } from "@/shared/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from "@/shared/ui/context-menu";
import { useArchive } from "./ArchiveProvider";
import { archiveKey } from "./model";

type Props = { channelId?: string | null; message: TimelineMessage };
export function ArchiveMenuItems({ channelId, message }: Props) {
  const archive = useArchive();
  if (!channelId || !archive.canArchive(channelId) || message.pending)
    return null;
  return (
    <>
      {(["message", "thread"] as const).map((kind) => {
        const id =
          kind === "thread" ? (message.rootId ?? message.id) : message.id;
        const archived = archive.records.has(archiveKey(kind, id));
        const Icon = archived ? ArchiveRestore : Archive;
        return (
          <DropdownMenuItem
            key={kind}
            onSelect={() => archive.toggle(channelId, message, kind)}
          >
            <Icon className="size-4" />
            {archived ? "Unarchive" : "Archive"} {kind} for me
          </DropdownMenuItem>
        );
      })}
    </>
  );
}
export function ArchiveHoverAction({ channelId, message }: Props) {
  const archive = useArchive();
  if (!channelId || !archive.canArchive(channelId) || message.pending)
    return null;
  const archived = archive.records.has(archiveKey("message", message.id));
  const Icon = archived ? ArchiveRestore : Archive;
  return (
    <Button
      aria-label={
        archived ? "Unarchive message for me" : "Archive message for me"
      }
      title={`${archived ? "Unarchive" : "Archive"} message (E)`}
      className="h-8 w-8 rounded-full p-0"
      size="sm"
      variant="ghost"
      onClick={() => archive.toggle(channelId, message)}
    >
      <Icon className="!size-4" />
    </Button>
  );
}
export function ArchiveRowActions({
  channelId,
  message,
  children,
}: Props & { children: React.ReactNode }) {
  const archive = useArchive();
  if (!channelId || !archive.canArchive(channelId) || message.pending)
    return <>{children}</>;
  return (
    <ContextMenu modal={false}>
      <ContextMenuTrigger asChild>
        {/* biome-ignore lint/a11y: Focusable message region owns E/context menu; child controls retain their bindings. */}
        <div
          role="group"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: Message region is an explicit keyboard archive target.
          tabIndex={0}
          className="outline-offset-2 focus-visible:outline-2 focus-visible:outline-primary"
          aria-label="Message actions"
          onKeyDown={(event) => {
            if (
              event.defaultPrevented ||
              event.key.toLowerCase() !== "e" ||
              event.ctrlKey ||
              event.metaKey ||
              event.altKey ||
              event.shiftKey ||
              event.nativeEvent.isComposing ||
              event.repeat
            )
              return;
            const target = event.target as HTMLElement;
            // Only this focused row owns E. Never intercept composer/child controls.
            if (target !== event.currentTarget) return;
            event.preventDefault();
            event.stopPropagation();
            archive.toggle(channelId, message);
          }}
        >
          {children}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent onCloseAutoFocus={(event) => event.preventDefault()}>
        {(["message", "thread"] as const).map((kind) => {
          const id =
            kind === "thread" ? (message.rootId ?? message.id) : message.id;
          const archived = archive.records.has(archiveKey(kind, id));
          return (
            <ContextMenuItem
              key={kind}
              onSelect={() => archive.toggle(channelId, message, kind)}
            >
              {archived ? "Unarchive" : "Archive"} {kind} for me
            </ContextMenuItem>
          );
        })}
      </ContextMenuContent>
    </ContextMenu>
  );
}
export function ArchiveChannelToggle({ channelId }: { channelId: string }) {
  const archive = useArchive();
  if (!archive.canArchive(channelId)) return null;
  const shown = archive.showArchived(channelId);
  return (
    <Button
      size="sm"
      variant={shown ? "secondary" : "ghost"}
      aria-pressed={shown}
      onClick={() => archive.setShowArchived(channelId, !shown)}
    >
      <Archive className="size-4" />
      Show archived
    </Button>
  );
}
