import type { RelayEvent } from "@/shared/api/types";
import {
  parseThreadLink,
  THREAD_LINK_MARKER,
  type ThreadLinkScope,
} from "./threadLinks";
import type { ThreadLinkSnapshot } from "./threadLinkLoader";

export type ThreadLinkUndoRecord = {
  version: 1;
  scopeKey: string;
  identity: string;
  childId: string;
  previousId: string;
  event: RelayEvent;
  state: "pending" | "verified";
};
export type ThreadLinkUndoDependencies = {
  current: () => boolean;
  load: () => Promise<ThreadLinkSnapshot>;
  member: () => Promise<boolean>;
  sign: (input: {
    kind: number;
    content: string;
    tags: string[][];
    createdAt?: number;
  }) => Promise<RelayEvent>;
  publish: (event: RelayEvent) => Promise<unknown>;
  read: () => ThreadLinkUndoRecord | null;
  save: (record: ThreadLinkUndoRecord) => boolean;
  clock?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
};
const signedFields = (event: RelayEvent) =>
  JSON.stringify([
    event.id,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
    event.sig,
  ]);

/** Undo is a new author-signed operation, never an edit/delete of originals. */
export async function undoThreadLink(
  input: {
    scope: ThreadLinkScope;
    scopeKey: string;
    identity: string;
    childId: string;
    previousId: string;
  },
  deps: ThreadLinkUndoDependencies,
): Promise<ThreadLinkUndoRecord> {
  const current = () => {
    if (!deps.current())
      throw new DOMException("Thread organization scope changed", "AbortError");
  };
  current();
  let record = deps.read();
  if (record) {
    const parsed = parseThreadLink(record.event, input.scope);
    if (
      record.version !== 1 ||
      record.scopeKey !== input.scopeKey ||
      record.identity !== input.identity ||
      record.childId !== input.childId ||
      record.previousId !== input.previousId ||
      parsed.state !== "valid" ||
      parsed.annotation.authorPubkey !== input.identity ||
      parsed.annotation.operation !== "unlink" ||
      parsed.annotation.childId !== input.childId ||
      parsed.annotation.previousId !== input.previousId
    ) {
      throw Error(
        "Saved undo does not match this thread; original receipt retained",
      );
    }
  }
  const snapshot = await deps.load();
  current();
  if (snapshot.projection.status !== "complete")
    throw Error("Verify thread organization before undoing");
  const head = snapshot.projection.heads.get(input.childId);
  if (record && head === record.event.id) {
    const readback = snapshot.annotations.find(
      (e) => e.id === record?.event.id,
    );
    if (!readback || signedFields(readback) !== signedFields(record.event))
      throw Error("Undo readback differs from its saved receipt");
    record = { ...record, state: "verified" };
    if (!deps.save(record))
      throw Error("Undo is verified but its receipt could not be saved");
    return record;
  }
  if (head !== input.previousId)
    throw Error(
      "Thread organization changed; review its current position before undoing",
    );
  const prior = snapshot.parsedAnnotations.find(
    (a) => a.id === input.previousId,
  );
  if (
    !prior ||
    prior.childId !== input.childId ||
    prior.authorPubkey !== input.identity ||
    prior.operation !== "link"
  ) {
    throw Error("Only this message's author can undo its current organization");
  }
  if (!(await deps.member())) throw Error("Channel membership is required");
  current();
  if (!record) {
    const clock = deps.clock ?? Date.now;
    const wait = (prior.createdAt + 1) * 1000 - clock();
    if (wait > 2000)
      throw Error(
        "Thread organization timestamp is ahead of this clock; inspect before undoing",
      );
    if (wait > 0)
      await (
        deps.sleep ??
        ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
      )(wait + 10);
    current();
    const createdAt = Math.floor(clock() / 1000);
    if (createdAt <= prior.createdAt) throw Error("Undo clock did not advance");
    const event = await deps.sign({
      kind: 9,
      createdAt,
      content:
        "Thread organization: restored one message to its original position. Original messages unchanged.",
      tags: [
        ["h", input.scope.channelId],
        ["t", THREAD_LINK_MARKER],
        ["buzz-thread-op", "unlink"],
        ["buzz-thread-child", input.childId],
        ["buzz-thread-previous", input.previousId],
      ],
    });
    current();
    const parsed = parseThreadLink(event, input.scope);
    if (
      parsed.state !== "valid" ||
      parsed.annotation.authorPubkey !== input.identity ||
      parsed.annotation.childId !== input.childId ||
      parsed.annotation.previousId !== input.previousId ||
      parsed.annotation.operation !== "unlink" ||
      parsed.annotation.createdAt <= prior.createdAt
    ) {
      throw Error("Undo signer or scope changed");
    }
    record = {
      version: 1,
      scopeKey: input.scopeKey,
      identity: input.identity,
      childId: input.childId,
      previousId: input.previousId,
      event,
      state: "pending",
    };
    // The exact signed bytes/id exist durably BEFORE the first network write.
    if (!deps.save(record))
      throw Error(
        "Save the undo receipt before publishing; no change was sent",
      );
  }
  current();
  await deps.publish(record.event);
  current();
  const after = await deps.load();
  current();
  const stored = after.annotations.find((e) => e.id === record?.event.id);
  if (
    after.projection.status !== "complete" ||
    after.projection.heads.get(input.childId) !== record.event.id ||
    !stored ||
    signedFields(stored) !== signedFields(record.event)
  ) {
    throw Error(
      "Undo is pending verification; retry uses the same saved event",
    );
  }
  record = { ...record, state: "verified" };
  if (!deps.save(record))
    throw Error("Undo is verified but its receipt could not be saved");
  return record;
}
