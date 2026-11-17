import { formatFullDateTime } from "../lib/dateFormatters";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

/** The timestamp belongs to the latest authorized edit, not the original post. */
export function MessageEditStamp({ editedAt }: { editedAt?: number }) {
  const date = editedAt === undefined ? null : new Date(editedAt * 1000);
  const valid =
    editedAt !== undefined && date !== null && Number.isFinite(date.getTime());
  const label = valid
    ? `Edited ${formatFullDateTime(editedAt)}`
    : "This message has been edited";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time
          className="text-muted-foreground/70"
          data-testid="message-edited"
          dateTime={valid ? date?.toISOString() : undefined}
          title={label}
        >
          (edited)
        </time>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
