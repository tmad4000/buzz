import { sameConversationPanelRoute } from "./routeProjection.ts";

type Expected = {
  scopeKey: string;
  viewId: string;
  channelId: string;
  panelState: Record<string, unknown>;
};

/** Outstanding local projections only. Persistent history metadata is never proof of origin. */
export class ConversationProjectionEchoes {
  private pending = new Map<
    string,
    Expected & { owner: object; entryKey?: string }
  >();
  expect(id: string, expected: Expected, owner: object) {
    this.pending.set(id, {
      ...expected,
      panelState: { ...expected.panelState },
      owner,
    });
    // Fail closed for older delayed navigation if a router stops settling.
    while (this.pending.size > 32) {
      const oldest = this.pending.keys().next().value;
      if (oldest !== undefined) this.pending.delete(oldest);
    }
  }
  bindHistoryEntry(id: string, entryKey: string) {
    const entry = this.pending.get(id);
    if (entry && entry.entryKey === undefined) entry.entryKey = entryKey;
  }
  consume(
    id: string | null,
    entryKey: string | undefined,
    actual: Expected,
  ): boolean {
    if (!id) return false;
    const expected = this.pending.get(id);
    this.pending.delete(id);
    return Boolean(
      expected &&
        entryKey &&
        expected.entryKey === entryKey &&
        expected.scopeKey === actual.scopeKey &&
        expected.viewId === actual.viewId &&
        expected.channelId === actual.channelId &&
        sameConversationPanelRoute(expected.panelState, actual.panelState),
    );
  }
  cancel(id: string) {
    this.pending.delete(id);
  }
  cancelOwner(owner: object) {
    for (const [id, entry] of this.pending)
      if (entry.owner === owner) this.pending.delete(id);
  }
}

const registries = new WeakMap<object, ConversationProjectionEchoes>();
export function projectionEchoesFor(
  controller: object,
): ConversationProjectionEchoes {
  let registry = registries.get(controller);
  if (!registry) {
    registry = new ConversationProjectionEchoes();
    registries.set(controller, registry);
  }
  return registry;
}
