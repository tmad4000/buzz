export type ConversationAutoSubmitTarget = Readonly<{
  scopeKey: string;
  viewId: string;
  channelId: string;
  visit: number;
  draftKey: string;
  ownerId: string;
}>;
type Result = "submitted" | "ineligible" | "clear-failed" | "already-attempted";

/** One explicit command, never layout state. The host must retire it on any
 * owner/admission/scope interruption, including intervals without a timer tick.
 * This primitive never takes over an editor, restores a draft or retries. */
export class ConversationAutoSubmitAttempt {
  private attempted = false;
  private retired = false;
  private readonly target: ConversationAutoSubmitTarget;
  private readonly admit: (target: ConversationAutoSubmitTarget) => boolean;
  private readonly clearTrigger: (
    target: ConversationAutoSubmitTarget,
  ) => Promise<boolean>;
  private readonly submit: (
    target: ConversationAutoSubmitTarget,
  ) => Promise<void>;

  constructor(options: {
    target: ConversationAutoSubmitTarget;
    admit: (target: ConversationAutoSubmitTarget) => boolean;
    /** Resolve true only after the captured entry's trigger is actually cleared. */
    clearTrigger: (target: ConversationAutoSubmitTarget) => Promise<boolean>;
    /** Delegate to normal submit, retaining its first ownership check and synchronous lock. */
    submit: (target: ConversationAutoSubmitTarget) => Promise<void>;
  }) {
    this.target = Object.freeze({ ...options.target });
    this.admit = options.admit;
    this.clearTrigger = options.clearTrigger;
    this.submit = options.submit;
  }

  retire() {
    this.retired = true;
  }

  private admitted() {
    if (this.retired) return false;
    const allowed = this.admit(this.target);
    // Admission can synchronously retire this command through a scope/owner
    // subscriber. Its returned boolean cannot revive the retired attempt.
    return allowed && !this.retired;
  }

  async run(): Promise<Result> {
    // Claim before any callback or await: reentrant/parallel calls cannot retry.
    if (this.attempted) return "already-attempted";
    this.attempted = true;
    if (!this.admitted()) return "ineligible";
    try {
      if (!(await this.clearTrigger(this.target))) return "clear-failed";
    } catch {
      return "clear-failed";
    }
    if (!this.admitted()) return "ineligible";
    await this.submit(this.target);
    return "submitted";
  }
}
