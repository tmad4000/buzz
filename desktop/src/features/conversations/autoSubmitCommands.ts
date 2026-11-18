import {
  ConversationAutoSubmitAttempt,
  type ConversationAutoSubmitTarget,
} from "./autoSubmitAttempt.ts";

type Submission = {
  admit: (target: ConversationAutoSubmitTarget) => boolean;
  submit: (target: ConversationAutoSubmitTarget) => Promise<void>;
};
type Endpoint = Submission & {
  target: ConversationAutoSubmitTarget;
  /** Pin draft revision/media/reply context per request, never when the editor mounts. */
  capture?: (target: ConversationAutoSubmitTarget) => Submission | null;
};
type Pending = {
  endpoint: Endpoint;
  attempt: ConversationAutoSubmitAttempt;
  admit: () => boolean;
};
type Outcome =
  | Awaited<ReturnType<ConversationAutoSubmitAttempt["run"]>>
  | "already-issued"
  | "unavailable"
  | "busy"
  | "entry-limit"
  | "disposed";

/** Transient per-workspace commands. Never serializes commands or resource identity.
 * Host must offer only admitted fresh explicit entries and retire on blur/coverage
 * or scope loss. Endpoint registration alone never starts a command. */
export class ConversationAutoSubmitCommands {
  private endpoints = new Set<Endpoint>();
  private issued = new Set<string>();
  private pending = new Map<string, Pending>();
  private disposed = false;
  private retirementEpoch = 0;
  private unsubscribe: (() => void) | undefined;
  private readonly options;
  private readonly entryLimit: number;

  constructor(options: {
    scopeKey: string;
    ownerForDraft: (draftKey: string) => string | undefined;
    isCurrent: (target: ConversationAutoSubmitTarget) => boolean;
    /** Ownership/view subscriptions must notify each committed transition, not sample on timers. */
    subscribeInvalidation?: (listener: () => void) => () => void;
    entryLimit?: number;
  }) {
    this.options = { ...options };
    this.entryLimit = options.entryLimit ?? 512;
    if (
      !Number.isSafeInteger(this.entryLimit) ||
      this.entryLimit < 1 ||
      this.entryLimit > 512
    )
      throw new Error("Auto-submit ledger limit must be between 1 and 512");
    this.unsubscribe = options.subscribeInvalidation?.(() =>
      this.retireInvalid(),
    );
  }

  register(endpoint: Endpoint): () => void {
    if (this.disposed || endpoint.target.scopeKey !== this.options.scopeKey)
      return () => {};
    const record = Object.freeze({
      ...endpoint,
      target: Object.freeze({ ...endpoint.target }),
    });
    this.endpoints.add(record);
    return () => {
      if (!this.endpoints.delete(record)) return;
      this.retirementEpoch++;
      for (const pending of this.pending.values())
        if (pending.endpoint === record) pending.attempt.retire();
    };
  }

  private admit(endpoint: Endpoint) {
    return (
      !this.disposed &&
      this.endpoints.has(endpoint) &&
      this.options.ownerForDraft(endpoint.target.draftKey) ===
        endpoint.target.ownerId &&
      this.options.isCurrent(endpoint.target) &&
      endpoint.admit(endpoint.target)
    );
  }

  retireInvalid() {
    this.retirementEpoch++;
    for (const pending of [...this.pending.values()]) {
      try {
        if (!pending.admit()) pending.attempt.retire();
      } catch {
        pending.attempt.retire();
      }
    }
  }

  /** Window blur/coverage and lifetime events retire even false -> true intervals. */
  retireAll() {
    this.retirementEpoch++;
    for (const pending of this.pending.values()) pending.attempt.retire();
  }

  async request(request: {
    entryKey: string;
    viewId: string;
    channelId: string;
    visit: number;
    draftKey: string;
    clearTrigger: (
      entryKey: string,
      target: ConversationAutoSubmitTarget,
    ) => Promise<boolean>;
  }): Promise<Outcome> {
    const retirementEpoch = this.retirementEpoch;
    const { entryKey, viewId, channelId, visit, draftKey, clearTrigger } =
      request;
    if (this.disposed) return "disposed";
    if (
      !entryKey ||
      entryKey.length > 8192 ||
      !Number.isSafeInteger(visit) ||
      visit < 0
    )
      return "unavailable";
    if (this.issued.has(entryKey)) return "already-issued";
    if (this.issued.size >= this.entryLimit) return "entry-limit";
    // Reserve before getters/callbacks; never evict a tombstone and revive Back.
    this.issued.add(entryKey);
    if (retirementEpoch !== this.retirementEpoch) return "ineligible";
    if (this.pending.has(draftKey)) return "busy";
    const owner = this.options.ownerForDraft(draftKey);
    // A getter may synchronously issue another command or dispose the scope.
    if (this.disposed) return "disposed";
    if (retirementEpoch !== this.retirementEpoch) return "ineligible";
    if (this.pending.has(draftKey)) return "busy";
    if (!owner) return "unavailable";
    const matches = [...this.endpoints].filter(
      ({ target }) =>
        target.viewId === viewId &&
        target.channelId === channelId &&
        target.visit === visit &&
        target.draftKey === draftKey &&
        target.ownerId === owner,
    );
    if (matches.length !== 1 || this.disposed) return "unavailable";
    const endpoint = matches[0];
    let submission: Submission | null = null;
    const admit = () =>
      submission !== null &&
      this.admit(endpoint) &&
      (submission === endpoint || submission.admit(endpoint.target));
    const attempt = new ConversationAutoSubmitAttempt({
      target: endpoint.target,
      admit,
      clearTrigger: (target) => clearTrigger(entryKey, target),
      submit: async (target) => {
        if (submission) await submission.submit(target);
      },
    });
    const pending = { endpoint, attempt, admit };
    // Reserve before capture: it may synchronously notify, dispose or re-enter.
    this.pending.set(draftKey, pending);
    try {
      if (endpoint.capture) {
        const captured = endpoint.capture(endpoint.target);
        submission = captured
          ? Object.freeze({ admit: captured.admit, submit: captured.submit })
          : null;
      } else submission = endpoint;
      if (this.disposed) return "disposed";
      if (retirementEpoch !== this.retirementEpoch) return "ineligible";
      if (!submission) return "unavailable";
      return await attempt.run();
    } finally {
      if (this.pending.get(draftKey) === pending) this.pending.delete(draftKey);
    }
  }

  dispose() {
    this.disposed = true;
    this.retireAll();
    this.endpoints.clear();
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }
}
