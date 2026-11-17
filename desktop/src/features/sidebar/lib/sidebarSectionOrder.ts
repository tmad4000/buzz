import type { ChannelSection } from "./channelSectionsStorage";
import { isReg, setRegs, type Tree } from "./sidebarLwwMap";

export const BUILTIN_SECTIONS = [
  { id: "builtin:starred", name: "Starred" },
  { id: "builtin:channels", name: "Channels" },
  { id: "builtin:forums", name: "Forums" },
  { id: "builtin:dms", name: "Direct messages" },
] as const;

/** Complete layout, filling new sections without overwriting authored ranks. */
export function projectSectionOrder(
  tree: Tree,
  sections: ChannelSection[],
): string[] {
  const defaults = [
    "builtin:starred",
    ...sections.map((s) => s.id),
    "builtin:channels",
    "builtin:forums",
    "builtin:dms",
  ];
  const node = tree.o;
  const ranks = node && !isReg(node) ? node : {};
  const rank = (id: string) => {
    const reg = ranks[id];
    return isReg(reg) && typeof reg[2] === "number" ? reg[2] : undefined;
  };
  const maximum = Math.max(-1, ...defaults.map((id) => rank(id) ?? -1));
  const fallback = new Map(
    defaults.map((id, index) => [id, maximum + 1 + index]),
  );
  return defaults.sort(
    (a, b) =>
      (rank(a) ?? fallback.get(a) ?? 0) - (rank(b) ?? fallback.get(b) ?? 0),
  );
}

/** One atomic order edit; missing live IDs retain their previous relative order. */
export function writeSectionOrder(
  tree: Tree,
  current: string[],
  requested: string[],
): Tree {
  const wanted = [...new Set(requested.filter((id) => current.includes(id)))];
  const ids = [...wanted, ...current.filter((id) => !wanted.includes(id))];
  return setRegs(
    tree,
    ids.map((id, index) => [["o", id], index]),
    true,
  );
}

/** Pin migration is offered until explicitly converted or dismissed, never deleted. */
export function pinSectionOffers(
  sections: ChannelSection[],
  handled: Record<string, boolean>,
): ChannelSection[] {
  return sections.filter(
    (s) => /^(pin|pinned)$/i.test(s.name.trim()) && !handled[s.id],
  );
}
