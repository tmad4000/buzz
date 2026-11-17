import { getChannelIdFromTags } from "@/features/messages/lib/threading";
import type { RelayEvent } from "@/shared/api/types";
import { MSG_PREFIX, THREAD_PREFIX } from "./readStateFormat";

/** Resource graph shared by all mounted views within one read-state owner. */
export class ContextParentRegistry {
  private registrations = new Map<symbol, ReadonlyMap<string, string>>();

  /** Register known event parents; releasing one view preserves every sibling. */
  register(parents: ReadonlyMap<string, string>): () => void {
    const owner = Symbol();
    this.registrations.set(owner, new Map(parents));
    return () => {
      this.registrations.delete(owner);
    };
  }

  /** Unknown contexts never inherit the currently focused channel. */
  resolve = (contextId: string): string | null => {
    const prefix = [MSG_PREFIX, THREAD_PREFIX].find((value) =>
      contextId.startsWith(value),
    );
    if (!prefix) return null;
    const eventId = contextId.slice(prefix.length);
    let parent: string | null = null;
    for (const registration of this.registrations.values()) {
      const candidate = registration.get(eventId);
      if (!candidate) continue;
      // Conflicting evidence must not fold through an unrelated channel.
      if (parent !== null && parent !== candidate) return null;
      parent = candidate;
    }
    return parent;
  };
}

/** Use event evidence, never the selected route or an unverified e-tag parent. */
export function buildContextParents(
  channelId: string,
  events: readonly RelayEvent[],
): ReadonlyMap<string, string> {
  return new Map(
    events
      .filter((event) => getChannelIdFromTags(event.tags) === channelId)
      .map((event) => [event.id, channelId]),
  );
}
