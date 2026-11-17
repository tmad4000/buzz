export type AppBuild = {
  version: string;
  commit: string;
  commitTime: string;
  buildTime: string;
  event: string;
};
declare const __BUZZ_BUILD_INFO__: AppBuild;
export const appBuild: AppBuild =
  typeof __BUZZ_BUILD_INFO__ === "undefined"
    ? { version: "", commit: "", commitTime: "", buildTime: "", event: "build" }
    : __BUZZ_BUILD_INFO__;

/** Shared relative-first convention; exact local details remain available. */
export function relativeUpdated(iso: string, now = Date.now()): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const seconds = Math.max(0, (now - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== new Date(now).getFullYear()
      ? { year: "numeric" }
      : {}),
  });
}
