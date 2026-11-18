import type { UserProfileSummary } from "@/shared/api/types";

/** Offline kind-0 labels never establish onboarding, owner or agent authority. */
export function offlineProfileLabels(
  value: unknown,
): UserProfileSummary | null {
  if (!value || typeof value !== "object") return null;
  const profile = value as Record<string, unknown>;
  const text = (key: string, max: number) =>
    typeof profile[key] === "string" && (profile[key] as string).length <= max
      ? (profile[key] as string)
      : null;
  return {
    displayName: text("displayName", 512),
    name: text("name", 256),
    avatarUrl: text("avatarUrl", 8192),
    nip05Handle: text("nip05Handle", 1024),
    ownerPubkey: null,
    isAgent: false,
  };
}
