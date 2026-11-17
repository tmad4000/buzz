import { normalizeRelayUrl } from "@/shared/lib/normalizeRelayUrl";
import { SECTIONS_LANE } from "./channelSectionsSync";
import { decodeDoc } from "./sidebarLaneStore";
import type { Tree } from "./sidebarLwwMap";

const JACOB =
  "3eb6491e9fecd5e2c0221f76b79685a1478b591bf90ea155f5352ebe12672e1f";
const RELAY = "jprojects.communities.buzz.xyz";

/** Only Jacob's own community imports the private, recipient-encrypted seed. */
export function isJacobSidebarScope(
  pubkey: string | undefined,
  relayUrl: string | undefined,
): boolean {
  if (pubkey !== JACOB || !relayUrl) return false;
  const relay = normalizeRelayUrl(relayUrl);
  return relay === `wss://${RELAY}` || relay === `https://${RELAY}`;
}

/** Baseline registers lose to every authored edit, including tombstones. */
export function decodeSidebarDefaults(plaintext: string): Tree {
  const doc = decodeDoc(SECTIONS_LANE, JSON.parse(plaintext), 0);
  if (!doc || !SECTIONS_LANE.withinLimits(SECTIONS_LANE.project(doc.tree))) {
    throw new Error("Invalid sidebar defaults");
  }
  return doc.tree;
}
