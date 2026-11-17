import * as React from "react";
import { loadActiveCommunityId } from "@/features/communities/communityStorage";
import {
  loadThreadDisplayPolicy,
  threadDisplayKey,
} from "../lib/threadDisplayPolicy";
/** Defaults are captured on entry, never broadcast into a view being read. */
export function useThreadDisplayPolicy(
  currentPubkey: string | undefined,
  entry: string,
) {
  const community = React.useMemo(loadActiveCommunityId, []);
  const key = threadDisplayKey(community, currentPubkey);
  return React.useMemo(
    () => ({ entry, policy: loadThreadDisplayPolicy(key) }),
    [key, entry],
  ).policy;
}
