type Scope = { key: string; current: () => boolean };
type Permit = {
  scope: Scope;
  channelId: string;
  draftKey: string;
  entryKey: string | null;
};
export type AdmittedAutoSendPermit = Readonly<{
  scopeKey: string;
  channelId: string;
  draftKey: string;
  entryKey: string;
}>;

/** Transient confirmation provenance, separate from URL/persisted layout state.
 * The host arms only from the existing confirmed Drafts send action, binds the
 * actual first PUSH/REPLACE entry, and consumes after target navigation guards.
 * This class neither chooses an editor nor issues a send. */
export class ConversationAutoSendPermits {
  private scope: Scope | null = null;
  private pending = new Map<string, Permit>();
  private used = new Set<string>();
  private readonly nonce: () => string;
  constructor(nonce: () => string = () => crypto.randomUUID()) {
    this.nonce = nonce;
  }

  bindScope(key: string, current: () => boolean): () => void {
    const scope = { key, current };
    this.scope = scope;
    this.pending.clear();
    this.used.clear();
    return () => {
      if (this.scope !== scope) return;
      this.scope = null;
      this.pending.clear();
      this.used.clear();
    };
  }

  private isCurrent(scope: Scope) {
    if (this.scope !== scope) return false;
    try {
      return scope.current() && this.scope === scope;
    } catch {
      return false;
    }
  }

  arm(channelId: string, draftKey: string): string | null {
    const scope = this.scope;
    if (
      !scope ||
      !this.isCurrent(scope) ||
      !channelId ||
      channelId.length > 256 ||
      !draftKey ||
      draftKey.length > 1024 ||
      this.pending.size >= 128 ||
      this.used.size >= 512
    )
      return null;
    const token = this.nonce();
    if (
      !this.isCurrent(scope) ||
      this.pending.size >= 128 ||
      this.used.size >= 512 ||
      !token ||
      token.length > 256 ||
      this.used.has(token)
    )
      return null;
    this.used.add(token);
    this.pending.set(token, { scope, channelId, draftKey, entryKey: null });
    return token;
  }

  /** Navigation veto/failure must cancel the arm; cancellation never authorizes retry. */
  cancel(token: string) {
    this.pending.delete(token);
  }

  bindEntry(
    token: string,
    entry: {
      action: string;
      key: string;
      channelId: string;
      draftKey: string;
    },
  ): boolean {
    const permit = this.pending.get(token);
    if (!permit) return false;
    const { action, key, channelId, draftKey } = entry;
    if (
      !this.isCurrent(permit.scope) ||
      this.pending.get(token) !== permit ||
      permit.entryKey !== null ||
      (action !== "PUSH" && action !== "REPLACE") ||
      !key ||
      key.length > 8192 ||
      channelId !== permit.channelId ||
      draftKey !== permit.draftKey
    ) {
      this.pending.delete(token);
      return false;
    }
    permit.entryKey = key;
    return true;
  }

  consume(
    token: string,
    entry: {
      scopeKey: string;
      key: string;
      channelId: string;
      draftKey: string;
      fresh: boolean;
      projectionEcho: boolean;
    },
  ): AdmittedAutoSendPermit | null {
    const permit = this.pending.get(token);
    // Claim before calling the scope port; reentrant reads cannot duplicate it.
    this.pending.delete(token);
    const { scopeKey, key, channelId, draftKey, fresh, projectionEcho } = entry;
    if (
      !permit ||
      !fresh ||
      projectionEcho ||
      scopeKey !== permit.scope.key ||
      !permit.entryKey ||
      key !== permit.entryKey ||
      channelId !== permit.channelId ||
      draftKey !== permit.draftKey ||
      !this.isCurrent(permit.scope)
    )
      return null;
    return Object.freeze({
      scopeKey: permit.scope.key,
      channelId: permit.channelId,
      draftKey: permit.draftKey,
      entryKey: permit.entryKey,
    });
  }
}
