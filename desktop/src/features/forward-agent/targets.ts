import { loadSidebarSectionDefaults } from "@/shared/api/tauri";
import { isJacobSidebarScope } from "@/features/sidebar/lib/jacobChannelSectionDefaults";
import {
  parseChannelSectionPayload,
  storageKey,
} from "@/features/sidebar/lib/channelSectionsStorage";
import { normalizeRelayUrl } from "@/shared/lib/normalizeRelayUrl";

export function forwardScope(signer: string, relayUrl: string) {
  return `${signer}:${encodeURIComponent(normalizeRelayUrl(relayUrl))}`;
}
/** Read-only projection of the sidebar's current persisted view; no second sync writer. */
export function readForwardSections(signer: string, relayUrl: string) {
  const raw = globalThis.localStorage.getItem(storageKey(signer, relayUrl));
  if (!raw) return { version: 1 as const, sections: [], assignments: {} };
  const view = parseChannelSectionPayload(JSON.parse(raw));
  if (!view)
    throw new Error(
      "Sidebar section data is unavailable. Reopen the sidebar and try again.",
    );
  return view;
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
