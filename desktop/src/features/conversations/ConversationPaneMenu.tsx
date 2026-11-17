import { MoreHorizontal } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

export type ConversationPaneCommand =
  | "splitRight"
  | "splitBottom"
  | "horizontal"
  | "vertical"
  | "swap"
  | "close"
  | "closeSplit"
  | "restore";
export function ConversationPaneMenu({
  split,
  rightFeasible,
  bottomFeasible,
  canRestore,
  onCommand,
}: {
  split: boolean;
  rightFeasible: boolean;
  bottomFeasible: boolean;
  canRestore: boolean;
  onCommand: (command: ConversationPaneCommand) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Conversation pane options"
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {!split ? (
          <>
            <DropdownMenuItem
              disabled={!rightFeasible}
              onSelect={() => onCommand("splitRight")}
            >
              Open conversation to the right
              {!rightFeasible ? " · More space needed" : ""}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!bottomFeasible}
              onSelect={() => onCommand("splitBottom")}
            >
              Open conversation below
              {!bottomFeasible ? " · More space needed" : ""}
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem
              disabled={!rightFeasible}
              onSelect={() => onCommand("horizontal")}
            >
              Place side by side
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!bottomFeasible}
              onSelect={() => onCommand("vertical")}
            >
              Stack conversations
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onCommand("swap")}>
              Swap panes
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onCommand("close")}>
              Close pane
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onCommand("closeSplit")}>
              Close split
            </DropdownMenuItem>
          </>
        )}
        {canRestore && (
          <DropdownMenuItem onSelect={() => onCommand("restore")}>
            Restore split
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
