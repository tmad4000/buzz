export type ChannelMembershipScope = {
  communityId: string;
  relayUrl: string;
  identityPubkey: string;
};

// Cache timestamps also advance for local upserts. Only the completed
// authoritative list refresh may establish this admission provenance.
const hydrated = new WeakMap<object, string>();
function key(scope: ChannelMembershipScope): string | null {
  return [scope.communityId, scope.relayUrl, scope.identityPubkey].every(
    (value) => typeof value === "string" && value.length > 0,
  )
    ? JSON.stringify([
        scope.communityId,
        scope.relayUrl,
        scope.identityPubkey.toLowerCase(),
      ])
    : null;
}

export function markChannelMembershipHydrated(
  queryClient: object,
  scope: ChannelMembershipScope,
): void {
  const value = key(scope);
  if (value !== null) hydrated.set(queryClient, value);
}

/** Retains validated membership through refetch errors, never through a scope change. */
export function isChannelMembershipHydrated(
  queryClient: object,
  scope: ChannelMembershipScope,
): boolean {
  const value = key(scope);
  return value !== null && hydrated.get(queryClient) === value;
}
