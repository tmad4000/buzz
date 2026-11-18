import * as React from "react";
import type { LocalSendIntent } from "@/shared/api/types";
import type { TimelineMessage } from "../types";
import { completeThreadAncestors } from "../lib/unreadSidebar";

/** These tokens are local to the originating thread view; restored rows cannot mint them. */
export function useLocalOwnSendIntent(
  scope: string | null,
  root: string | null,
  own: TimelineMessage[],
  messages: ReadonlyMap<string, TimelineMessage>,
) {
  const visit = React.useMemo(
    () => ({
      scope,
      id: crypto.randomUUID(),
      active: false,
      revision: 0,
      order: 0,
      origins: new Map<string, { revision: number; order: number }>(),
      choices: new Map<string, { revision: number; open: boolean }>(),
      consumed: new Set<string>(),
      latest: null as { order: number; id: string; key: string } | null,
    }),
    [scope],
  );
  React.useLayoutEffect(() => {
    visit.active = true;
    return () => {
      visit.active = false;
    };
  }, [visit]);
  const captureOrigin = React.useCallback(():
    | Omit<LocalSendIntent, "id">
    | undefined => {
    if (!visit.active || !scope || !root) return undefined;
    const token = `${visit.id}:${crypto.randomUUID()}`;
    visit.origins.set(token, {
      revision: visit.revision,
      order: ++visit.order,
    });
    return { viewInstanceId: token, threadRootId: root };
  }, [visit, scope, root]);
  const noteManual = React.useCallback(
    (id: string, open: boolean) => {
      visit.choices.set(id, { revision: ++visit.revision, open });
    },
    [visit],
  );
  const paths = new Set<string>();
  const consumed: string[] = [];
  let latest = visit.latest;
  for (const message of own) {
    const intent = message.localSendIntent;
    if (
      !intent ||
      intent.threadRootId !== root ||
      visit.consumed.has(intent.id)
    )
      continue;
    const origin = visit.origins.get(intent.viewInstanceId);
    if (!origin) continue;
    const ancestors = completeThreadAncestors(messages, root, message.id);
    if (!ancestors) continue;
    consumed.push(intent.id);
    const blocked = [...ancestors, message.id].some((id) => {
      const choice = visit.choices.get(id);
      return choice && !choice.open && choice.revision > origin.revision;
    });
    if (blocked) continue;
    for (const id of ancestors) paths.add(id);
    if (!latest || origin.order > latest.order)
      latest = {
        order: origin.order,
        id: intent.id,
        key: message.renderKey ?? message.id,
      };
  }
  // Consume only committed renders. A suspended/rendered-away view must not spend an intent.
  React.useLayoutEffect(() => {
    for (const id of consumed) visit.consumed.add(id);
    visit.latest = latest;
  });
  const target = latest;
  const targetId = target
    ? own.find(
        (message) =>
          message.localSendIntent?.id === target.id ||
          (message.renderKey ?? message.id) === target.key,
      )?.id
    : undefined;
  return { paths, targetId, captureOrigin, noteManual };
}
export function isDurableOutboxRow(message: TimelineMessage) {
  return Boolean(
    message.localSendIntent ||
      message.renderKey?.startsWith("outbox-local:") ||
      message.renderKey?.startsWith("outbox:"),
  );
}
