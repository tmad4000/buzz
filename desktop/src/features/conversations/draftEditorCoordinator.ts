type EditorRegistration = { canYield: () => boolean };

/** Transient editor ownership for one identity/community/window, never persisted. */
export class DraftEditorCoordinator {
  private members = new Map<string, Map<string, EditorRegistration>>();
  private owners = new Map<string, string>();
  private previews = new Map<string, string>();
  private listeners = new Set<() => void>();
  private version = 0;

  /** Observe transient owner/preview/lock changes. */
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  /** Stable primitive snapshot for React external-store subscriptions. */
  getSnapshot = () => this.version;
  private notify() {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }

  /** Each mounted composer registers separately, including inline/panel duplicates in one view. */
  register(key: string, editorId: string, canYield: () => boolean): () => void {
    const members =
      this.members.get(key) ?? new Map<string, EditorRegistration>();
    const registration = { canYield };
    members.set(editorId, registration);
    this.members.set(key, members);
    if (!this.owners.has(key)) this.owners.set(key, editorId);
    this.notify();
    return () => {
      if (members.get(editorId) !== registration) return;
      members.delete(editorId);
      if (this.owners.get(key) === editorId) {
        const successor = members.keys().next().value;
        if (successor) this.owners.set(key, successor);
        else this.owners.delete(key);
      }
      if (members.size === 0) {
        this.members.delete(key);
        this.previews.delete(key);
      }
      this.notify();
    };
  }

  /** Current live editor token for a canonical draft key. */
  owner(key: string): string | undefined {
    return this.owners.get(key);
  }
  /** Latest in-memory preview from that draft's current owner. */
  preview(key: string): string | undefined {
    return this.previews.get(key);
  }
  /** A send, upload, voice recording or edit can temporarily retain ownership. */
  canTakeOver(key: string): boolean {
    const owner = this.owners.get(key);
    return !owner || (this.members.get(key)?.get(owner)?.canYield() ?? false);
  }

  /** Commit the ownership change; React unmount cleanups flush before the replacement's layout restore. */
  takeOver(key: string, editorId: string): boolean {
    if (!this.members.get(key)?.has(editorId) || !this.canTakeOver(key))
      return false;
    if (this.owners.get(key) === editorId) return true;
    this.owners.set(key, editorId);
    this.notify();
    return true;
  }

  /** Background previews follow the live owner without persisting presentation ownership. */
  publishPreview(key: string, editorId: string, text: string): void {
    if (this.owners.get(key) !== editorId || this.previews.get(key) === text)
      return;
    this.previews.set(key, text);
    this.notify();
  }

  /** A changed send/edit/upload lock updates the takeover affordance. */
  invalidateLocks(): void {
    this.notify();
  }
}
