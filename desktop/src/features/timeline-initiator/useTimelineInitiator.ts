import { useCallback, useEffect, useMemo, useState } from "react";
import type { TimelineMessage } from "@/features/messages/types";
import type { RelayEvent } from "@/shared/api/types";
import { collectTimelineInitiators, type InitiatorFilter } from "./model";

export function useTimelineInitiator(
  scope: string | null,
  channelId: string | null,
  reader: string | undefined,
  knownAgents: ReadonlySet<string>,
  events: readonly RelayEvent[],
  visibleMessages: readonly TimelineMessage[],
) {
  const [selection, setSelection] = useState<{
    scope: string | null;
    filter: InitiatorFilter;
  }>({ scope, filter: "all" });
  const filter = selection.scope === scope ? selection.filter : "all";
  useEffect(() => {
    setSelection((previous) =>
      previous.scope === scope ? previous : { scope, filter: "all" },
    );
  }, [scope]);
  const setFilter = useCallback(
    (next: InitiatorFilter) => {
      if (scope) setSelection({ scope, filter: next });
    },
    [scope],
  );
  const evidence = useMemo(() => {
    if (!scope || !channelId || !reader) return undefined;
    return collectTimelineInitiators(
      events,
      new Set(visibleMessages.map(({ id }) => id)),
      channelId,
      reader,
      knownAgents,
    );
  }, [scope, channelId, reader, knownAgents, events, visibleMessages]);

  return useMemo(
    () => evidence && { filter, setFilter, evidence },
    [filter, setFilter, evidence],
  );
}

export type TimelineInitiatorView = NonNullable<
  ReturnType<typeof useTimelineInitiator>
>;
