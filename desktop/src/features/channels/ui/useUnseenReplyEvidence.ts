import { replyEvidenceComplete } from "../lib/replyEvidenceComplete";
import { createReplyEvidenceQueue } from "../lib/replyEvidenceQueue";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { loadThreadReplies } from "@/features/messages/useThreadReplies";
import { getThreadReference } from "@/features/messages/lib/threading";
import type { TimelineMessage } from "@/features/messages/types";
import type { ThreadSummary } from "@/shared/api/types";

/** Resolve cold summary rows without treating a fetch as evidence of seeing. */
export function useUnseenReplyEvidence(
  channelId: string | null,
  reader: string | undefined,
  summaries: ReadonlyMap<string, ThreadSummary> | undefined,
) {
  const client = useQueryClient();
  // biome-ignore lint/correctness/useExhaustiveDependencies: each scope owns its own cancellation queue.
  const queue = React.useMemo(createReplyEvidenceQueue, [channelId, reader]);
  // The channel window bounds this set. Queries share the existing paged,
  // deadline-bound thread loader, and are cancelled when the scope retires.
  const roots = [...(summaries ?? [])].filter(
    ([, summary]) => summary.descendantCount > 0,
  );
  const results = useQueries({
    queries: roots.map(([rootId, summary]) => ({
      queryKey: [
        "unseen-reply-evidence",
        channelId,
        reader,
        rootId,
        summary.descendantCount,
        summary.lastReplyAt,
      ],
      enabled: Boolean(channelId && reader),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        queue(signal, async () => {
          if (!channelId) throw new Error("Channel is unavailable");
          const events = await loadThreadReplies(
            client,
            channelId,
            rootId,
            undefined,
            undefined,
            undefined,
            signal,
          );
          if (!replyEvidenceComplete(events, rootId, summary))
            throw new Error("Some replies are still becoming available");
          return events;
        }),
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: 1,
    })),
  });
  const messages: TimelineMessage[] = [];
  const pending = new Set<string>();
  for (let index = 0; index < roots.length; index++) {
    const [rootId] = roots[index];
    const result = results[index];
    if (!result.data) pending.add(rootId);
    for (const event of result.data ?? []) {
      const thread = getThreadReference(event.tags);
      if (!thread.parentId) continue;
      messages.push({
        id: event.id,
        createdAt: event.created_at,
        pubkey: event.pubkey,
        rootId: thread.rootId ?? rootId,
        parentId: thread.parentId,
        kind: event.kind,
        author: "",
        body: "",
        time: "",
        depth: 1,
      });
    }
  }
  // Stabilize projected evidence across observer-only rerenders.
  const signature = messages
    .map((message) => `${message.id}:${message.createdAt}`)
    .join(",");
  const stable = React.useRef({ signature, messages });
  if (stable.current.signature !== signature)
    stable.current = { signature, messages };
  const retry = React.useCallback(
    () =>
      client.invalidateQueries({
        queryKey: ["unseen-reply-evidence", channelId, reader],
      }),
    [client, channelId, reader],
  );
  return {
    messages: stable.current.messages,
    pending,
    failed: results.some((result) => result.isError),
    retry,
  };
}
