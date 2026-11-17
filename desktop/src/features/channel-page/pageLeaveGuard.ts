/** A synchronous veto for the exact owning Page/view; the caller retries after resolution. */
export type PageLeaveGuard = () => boolean;
/** Register against an immutable view ID; cleanup removes only this registration. */
export type PageLeaveGuardRegistrar = (guard: PageLeaveGuard) => () => void;
