import { normalizeRelayUrl } from "@/shared/lib/normalizeRelayUrl";
import { SECTIONS_LANE } from "./channelSectionsSync";
import { decodeDoc } from "./sidebarLaneStore";
import { isReg, LEGACY_DEV, DEFAULT_DEV, type Tree } from "./sidebarLwwMap";

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

/** Rename only the seed's untouched baseline, never an authored/legacy section. */
export function upgradeDirectAgentsDefault(tree: Tree, defaults: Tree): Tree {
  const sections = tree.s;
  const baseline = defaults.s;
  if (!sections || isReg(sections) || !baseline || isReg(baseline)) return tree;
  let next = sections;
  for (const [id, seed] of Object.entries(baseline)) {
    if (!seed || isReg(seed) || !isReg(seed.name) || seed.name[2] !== "Paseo")
      continue;
    const node = sections[id];
    if (!node || isReg(node) || !isReg(node.name) || node.name[2] !== "Paseo")
      continue;
    if (
      !Object.values(node).every(
        (r) => isReg(r) && r[0] === 0 && r[1] === LEGACY_DEV,
      )
    )
      continue;
    next = {
      ...next,
      // Reserved stamp-zero defaults beat the old seed without outranking
      // even a stamp-one legacy cache; the merge layer keeps them placeholders.
      [id]: { ...node, name: [0, DEFAULT_DEV, "Direct agents"] },
    };
  }
  return next === sections ? tree : { ...tree, s: next };
}
