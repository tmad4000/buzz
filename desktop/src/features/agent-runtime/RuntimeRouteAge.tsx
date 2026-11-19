import { useNow } from "@/shared/lib/useNow";

export function routeAge(attestedAt: number, nowMs: number) {
  const elapsed = Math.max(0, nowMs / 1000 - attestedAt);
  const seconds = Math.floor(elapsed);
  const relative =
    seconds < 60
      ? `${seconds}s ago`
      : seconds < 3600
        ? `${Math.floor(seconds / 60)}m ago`
        : seconds < 86400
          ? `${Math.floor(seconds / 3600)}h ago`
          : `${Math.floor(seconds / 86400)}d ago`;
  return { relative, stale: elapsed > 300, old: elapsed > 86400 };
}

/** Signed route metadata describes an advertisement, never process presence. */
export function RuntimeRouteAge({ attestedAt }: { attestedAt: number }) {
  const age = routeAge(attestedAt, useNow(60_000));
  return (
    <span className="text-badge font-normal text-muted-foreground">
      Last advertised route · {age.relative}
      {age.stale ? " · STALE · stale, may be offline" : ""}
      {age.old ? " · Stale (over 24 h)" : ""}
    </span>
  );
}
