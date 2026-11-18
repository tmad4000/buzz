import type { ConversationAutoSubmitTarget } from "./autoSubmitAttempt";
import type { ConversationView } from "./layout/model";
import type { ConversationProjectionEchoes } from "./projectionEchoes.ts";
import {
  conversationProjectionId,
  conversationRouteProjection,
} from "./routeProjection.ts";

type Location = {
  href: string;
  hash: string;
  search: Record<string, unknown>;
  state: Record<string, unknown> & { __TSR_key?: string };
};
type HistoryLocation = Pick<Location, "href" | "state">;
type ClearProjection = Omit<
  ReturnType<typeof conversationRouteProjection>,
  "search"
> & {
  hash: string;
  search: Record<string, unknown>;
};

function sameSearch(a: Record<string, unknown>, b: Record<string, unknown>) {
  const keys = (value: Record<string, unknown>) =>
    Object.keys(value).filter((key) => value[key] !== undefined);
  const left = keys(a),
    right = keys(b);
  return (
    left.length === right.length &&
    left.every(
      (key) =>
        right.includes(key) &&
        JSON.stringify(a[key]) === JSON.stringify(b[key]),
    )
  );
}

/** Clear one captured trigger before normal submission. Caller owns the live
 * command admission and cancels echoOwner on workspace teardown. Success keeps
 * the expected echo alive until the incoming-route hook consumes it. */
export async function clearCapturedAutoSendTrigger({
  entryKey,
  target,
  view,
  admitted,
  readLocation,
  readHistory,
  subscribe,
  navigate,
  echoes,
  echoOwner,
  projectionId,
  signal,
}: {
  entryKey: string;
  target: ConversationAutoSubmitTarget;
  view: Pick<ConversationView, "id" | "channelId" | "panelState">;
  admitted: () => boolean;
  readLocation: () => Location;
  readHistory: () => HistoryLocation;
  subscribe: (
    listener: (location: HistoryLocation, action: string) => void,
  ) => () => void;
  navigate: (projection: ClearProjection) => Promise<void>;
  echoes: ConversationProjectionEchoes;
  echoOwner: object;
  projectionId: string;
  signal?: AbortSignal;
}): Promise<boolean> {
  if (signal?.aborted) return false;
  const captured = readLocation();
  const sameChannel = (href: string) => {
    try {
      return (
        new URL(href, "https://buzz.invalid").pathname.replace(/\/$/, "") ===
        `/channels/${encodeURIComponent(target.channelId)}`
      );
    } catch {
      return false;
    }
  };
  const stillCaptured = () => {
    if (!admitted()) return false;
    const route = readLocation(),
      history = readHistory();
    return (
      JSON.stringify([route.state.__TSR_key, route.href]) === entryKey &&
      sameChannel(route.href) &&
      history.state.__TSR_key === route.state.__TSR_key &&
      history.href === route.href
    );
  };
  if (
    !projectionId ||
    !stillCaptured() ||
    view.id !== target.viewId ||
    view.channelId !== target.channelId ||
    captured.search.autoSend !== target.draftKey
  )
    return false;
  const search = { ...captured.search };
  delete search.autoSend;
  const base = conversationRouteProjection(
    view,
    target.scopeKey,
    true,
    projectionId,
  );
  const projection = {
    ...base,
    search,
    hash: captured.hash,
    state: (previous: Record<string, unknown>) => ({
      ...base.state(previous),
      searchHighlight: previous.searchHighlight,
    }),
  };
  let boundEntry: string | undefined;
  echoes.expect(
    projectionId,
    {
      scopeKey: target.scopeKey,
      viewId: target.viewId,
      channelId: target.channelId,
      panelState: search,
    },
    echoOwner,
  );
  let stop: (() => void) | undefined;
  let success = false;
  let aborted = false;
  let resolveAbort: () => void = () => {};
  const interrupted = new Promise<void>((resolve) => {
    resolveAbort = resolve;
  });
  const abort = () => {
    aborted = true;
    stop?.();
    stop = undefined;
    echoes.cancel(projectionId);
    resolveAbort();
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    if (signal?.aborted) {
      abort();
      return false;
    }
    stop = subscribe((location, action) => {
      if (
        action !== "REPLACE" ||
        boundEntry ||
        conversationProjectionId(location.state) !== projectionId
      )
        return;
      const key = location.state.__TSR_key;
      if (!key) return;
      boundEntry = key;
      echoes.bindHistoryEntry(projectionId, key);
    });
    // Subscription is an external port too; it cannot retarget this command.
    if (aborted || !stillCaptured() || aborted) return false;
    await Promise.race([navigate(projection), interrupted]);
    if (aborted || !admitted() || aborted) return false;
    const actual = readLocation(),
      history = readHistory();
    success = Boolean(
      boundEntry &&
        actual.state.__TSR_key === boundEntry &&
        history.state.__TSR_key === boundEntry &&
        history.href === actual.href &&
        sameChannel(actual.href) &&
        conversationProjectionId(actual.state) === projectionId &&
        actual.search.autoSend === undefined &&
        actual.hash === captured.hash &&
        sameSearch(search, actual.search) &&
        !aborted,
    );
    return success;
  } catch {
    return false;
  } finally {
    signal?.removeEventListener("abort", abort);
    stop?.();
    if (!success) echoes.cancel(projectionId);
  }
}
