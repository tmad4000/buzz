import { verifyEvent } from "nostr-tools/pure";
import type { RelayEvent } from "@/shared/api/types";
import { parseThreadLink, type ThreadLinkScope } from "./threadLinks";
import { projectThreadLinks } from "./threadLinkProjection";

export type ThreadLinkWorkerRequest =
  | { type: "parse"; scope: ThreadLinkScope; annotations: RelayEvent[] }
  | {
      type: "project";
      scope: ThreadLinkScope;
      messages: RelayEvent[];
      annotations: RelayEvent[];
      auxiliary: RelayEvent[];
      unavailableEventIds: Set<string>;
    };

/** Fresh verification prevents cached-symbol or shared mutable-cache bypass. */
export function verifyThreadLinkAuxiliary(events: RelayEvent[]) {
  if (events.length > 10000)
    throw Error("Thread organization overlay bound exceeded");
  for (const event of events) {
    if (
      ![5, 7, 9005, 40003].includes(event.kind) ||
      typeof event.content !== "string" ||
      event.content.length > 262144 ||
      !Array.isArray(event.tags) ||
      event.tags.length > 128 ||
      !event.tags.every(
        (t) =>
          Array.isArray(t) &&
          t.length <= 16 &&
          t.every((v) => typeof v === "string" && v.length <= 4096),
      )
    ) {
      throw Error("Invalid thread organization overlay");
    }
    const copy = {
      id: event.id,
      pubkey: event.pubkey,
      sig: event.sig,
      kind: event.kind,
      created_at: event.created_at,
      tags: event.tags.map((t) => [...t]),
      content: event.content,
    };
    if (!verifyEvent(copy))
      throw Error("Thread organization overlay signature failed");
  }
}

/** Shared production worker entry, also exercised by signed-module tests. */
export function runThreadLinkWork(request: ThreadLinkWorkerRequest) {
  if (request.type === "parse") {
    return request.annotations.flatMap((event) => {
      const parsed = parseThreadLink(event, request.scope);
      return parsed.state === "valid" ? [parsed.annotation] : [];
    });
  }
  verifyThreadLinkAuxiliary(request.auxiliary);
  // Aux carries no mandatory h tag. Require signed target closure into this
  // channel's originals (including deletions of edits/reactions) before merge.
  const targets = new Set(request.messages.map((event) => event.id));
  const remaining = new Map(
    request.auxiliary.map((event) => [event.id, event]),
  );
  for (let depth = 0; depth < 3 && remaining.size; depth++) {
    for (const [id, event] of remaining) {
      const channels = event.tags.filter((tag) => tag[0] === "h");
      if (
        channels.length &&
        (channels.length !== 1 || channels[0][1] !== request.scope.channelId)
      )
        throw Error("Thread overlay escaped channel");
      if (!event.tags.some((tag) => tag[0] === "e" && targets.has(tag[1])))
        continue;
      targets.add(id);
      remaining.delete(id);
    }
  }
  if (remaining.size)
    throw Error("Thread overlay target closure is incomplete");
  return projectThreadLinks({ ...request, historyComplete: true });
}

// This module is imported by production-module tests as well as the Vite worker.
const runtime = globalThis as unknown as {
  document?: unknown;
  postMessage?: (data: unknown) => void;
  onmessage?: (event: MessageEvent<ThreadLinkWorkerRequest>) => void;
};
if (runtime.postMessage && runtime.document === undefined) {
  runtime.onmessage = (event) => {
    try {
      runtime.postMessage?.({ ok: true, value: runThreadLinkWork(event.data) });
    } catch {
      runtime.postMessage?.({
        ok: false,
        error: "Thread organization could not be verified",
      });
    }
  };
}
