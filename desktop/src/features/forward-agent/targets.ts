import * as React from "react";
import {
  SECTIONS_LANE,
  projectSections,
} from "@/features/sidebar/lib/channelSectionsSync";
import {
  readSidebarLaneView,
  subscribeSidebarLaneView,
} from "@/features/sidebar/lib/sidebarLaneReadView";
import { loadSidebarSectionDefaults } from "@/shared/api/tauri";
import { isJacobSidebarScope } from "@/features/sidebar/lib/jacobChannelSectionDefaults";
import { parseChannelSectionPayload } from "@/features/sidebar/lib/channelSectionsStorage";
import { normalizeRelayUrl } from "@/shared/lib/normalizeRelayUrl";

export function forwardScope(signer: string, relayUrl: string) {
  return `${signer}:${encodeURIComponent(normalizeRelayUrl(relayUrl))}`;
}
/** Read the actual mounted sidebar tree, including edits whose disk write failed. */
export function readForwardSections(signer: string, relayUrl: string) {
  const tree = readSidebarLaneView(SECTIONS_LANE, signer, relayUrl);
  if (!tree)
    throw new Error(
      "Live sidebar sections are unavailable. Reopen the sidebar and try again.",
    );
  return { version: 1 as const, ...projectSections(tree) };
}
export function useForwardSections(signer?: string, relayUrl?: string) {
  const tree = React.useSyncExternalStore(subscribeSidebarLaneView, () =>
    signer && relayUrl
      ? readSidebarLaneView(SECTIONS_LANE, signer, relayUrl)
      : undefined,
  );
  return React.useMemo(
    () =>
      tree ? { version: 1 as const, ...projectSections(tree) } : undefined,
    [tree],
  );
}
/** Recipient-encrypted bootstrap supplies identity only, never overrides edited membership. */
export async function loadAgentSectionIds(signer: string, relayUrl: string) {
  if (!isJacobSidebarScope(signer, relayUrl)) return [];
  const seed = parseChannelSectionPayload(
    JSON.parse(await loadSidebarSectionDefaults()),
  );
  if (!seed) throw new Error("Could not read Direct agents section identity.");
  return seed.sections
    .filter((s) => s.name === "Paseo" || s.name === "Direct agents")
    .map((s) => s.id);
}
