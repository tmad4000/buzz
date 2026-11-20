import { createContext, useContext } from "react";
import type { TimelineMessage } from "@/features/messages/types";
import { ResultCard } from "./ResultCard";
import type { ResultCard as Result } from "./resultCards";

export const ResultActionsContext = createContext<{
  channelId: string;
  resolve: (messageId: string) => Result | undefined;
  open: (result: Result) => void;
} | null>(null);

/** Return an opener only inside a channel surface that owns the Page panel. */
export function useResultAction(message: TimelineMessage, channelId?: string) {
  const actions = useContext(ResultActionsContext);
  const result =
    actions && channelId === actions.channelId
      ? actions.resolve(message.id)
      : undefined;
  return actions && result ? (
    <ResultCard result={result} onOpen={() => actions.open(result)} />
  ) : null;
}
