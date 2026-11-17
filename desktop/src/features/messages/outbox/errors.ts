/** A newer edit or explicit deletion owns this outbox row now. */
export class OutboxConflictError extends Error {}
/** Explicit removal never restores the obsolete composer draft. */
export class OutboxRemovedError extends Error {}
