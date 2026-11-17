import { formatFullDateTime } from "@/features/messages/lib/dateFormatters";
import { cn } from "@/shared/lib/cn";
import { relativeUpdated } from "@/shared/lib/appBuild";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/ui/tooltip";

const TIMESTAMP_TOOLTIP_DELAY_MS = 500;

/** Relative-first message time, with exact local time available on hover. */
export function MessageTimestamp({
  className,
  createdAt,
  hideDayPeriod = false,
}: {
  className?: string;
  createdAt: number;
  hideDayPeriod?: boolean;
}) {
  const iso = new Date(createdAt * 1000).toISOString();
  const displayTime = relativeUpdated(iso);
  const exact = new Date(iso).toLocaleString(undefined, {
    dateStyle: "full",
    timeStyle: "long",
  });

  return (
    <TooltipProvider
      delayDuration={TIMESTAMP_TOOLTIP_DELAY_MS}
      skipDelayDuration={0}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <time
            dateTime={iso}
            title={exact}
            className={cn(
              "shrink-0 cursor-default whitespace-nowrap text-message-timestamp font-normal tabular-nums text-muted-foreground",
              hideDayPeriod &&
                "max-w-full whitespace-normal break-words text-right",
              className,
            )}
            data-testid="message-timestamp"
          >
            {displayTime}
          </time>
        </TooltipTrigger>
        <TooltipContent side="top">
          {formatFullDateTime(createdAt)}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
