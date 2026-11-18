import { normalizeRelayUrl } from "@/shared/lib/normalizeRelayUrl";
import {
  SECTIONS_LANE,
  projectSections,
  type SectionsView,
} from "./channelSectionsSync";
import { decodeDoc } from "./sidebarLaneStore";
import { isReg, canonical, type Tree } from "./sidebarLwwMap";

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

/** View-only label for the exact untouched seed; never changes a stored register. */
export function projectDirectAgentSections(
  tree: Tree,
  defaults?: Tree,
): SectionsView {
  const view = projectSections(tree);
  const stored = tree.s;
  const baseline = defaults?.s;
  if (!stored || isReg(stored) || !baseline || isReg(baseline)) return view;
  return {
    ...view,
    sections: view.sections.map((section) => {
      const seed = baseline[section.id];
      const node = stored[section.id];
      if (
        section.name !== "Paseo" ||
        !seed ||
        isReg(seed) ||
        !isReg(seed.name) ||
        seed.name[2] !== "Paseo" ||
        !node ||
        isReg(node) ||
        canonical(node) !== canonical(seed)
      )
        return section;
      return { ...section, name: "Direct agents" };
    }),
  };
}
