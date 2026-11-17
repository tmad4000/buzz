/** Only explicit disclosures are durable. Smart grants and reveal state stay visit-local. */
export type ExplicitExpansionSnapshot = {
  legacySeeded: boolean;
  entries: [string, [string, boolean][]][];
};
export const MAX_EXPLICIT_EXPANSION_BYTES = 64 * 1024;
const MAX_ROOTS = 128;
const MAX_CHOICES = 1024;

export function isExplicitExpansionSnapshot(
  value: unknown,
): value is ExplicitExpansionSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const source = value as ExplicitExpansionSnapshot;
  if (
    Object.keys(source).length !== 2 ||
    !Object.hasOwn(source, "legacySeeded") ||
    !Object.hasOwn(source, "entries") ||
    typeof source.legacySeeded !== "boolean" ||
    !Array.isArray(source.entries) ||
    source.entries.length > MAX_ROOTS
  )
    return false;
  const roots = new Set<string>();
  let choices = 0;
  for (const entry of source.entries) {
    if (!Array.isArray(entry) || entry.length !== 2) return false;
    const [key, branches] = entry;
    if (
      typeof key !== "string" ||
      !key.length ||
      key.length > 1536 ||
      roots.has(key) ||
      !Array.isArray(branches)
    )
      return false;
    roots.add(key);
    choices += branches.length;
    if (choices > MAX_CHOICES) return false;
    const ids = new Set<string>();
    for (const branch of branches) {
      if (
        !Array.isArray(branch) ||
        branch.length !== 2 ||
        typeof branch[0] !== "string" ||
        !branch[0].length ||
        branch[0].length > 256 ||
        typeof branch[1] !== "boolean" ||
        ids.has(branch[0])
      )
        return false;
      ids.add(branch[0]);
    }
  }
  return (
    new TextEncoder().encode(JSON.stringify(source)).byteLength <=
    MAX_EXPLICIT_EXPANSION_BYTES
  );
}

export function copyExplicitExpansion(
  source: ExplicitExpansionSnapshot,
): ExplicitExpansionSnapshot {
  if (!isExplicitExpansionSnapshot(source))
    throw new RangeError("Invalid or oversized explicit expansion snapshot");
  return {
    legacySeeded: source.legacySeeded,
    entries: source.entries.map(([key, branches]) => [
      key,
      branches.map(([id, open]) => [id, open]),
    ]),
  };
}

/** The first view imports validated legacy true AND false choices once, including an empty import. */
export function seedExplicitExpansion(
  current: ExplicitExpansionSnapshot,
  legacy: Iterable<readonly [string, ReadonlyMap<string, boolean>]>,
): ExplicitExpansionSnapshot {
  const checked = copyExplicitExpansion(current);
  if (checked.legacySeeded) return checked;
  let count = 0,
    choices = 0;
  const entries = new Map<string, Map<string, boolean>>();
  for (const [key, branches] of legacy) {
    count += 1;
    choices += branches.size;
    if (count > MAX_ROOTS || choices > MAX_CHOICES)
      throw new RangeError("Oversized legacy expansion snapshot");
    entries.set(key, new Map(branches));
  }
  for (const [key, branches] of checked.entries) {
    const merged = entries.get(key) ?? new Map();
    for (const [id, open] of branches) merged.set(id, open);
    entries.set(key, merged);
  }
  return copyExplicitExpansion({
    legacySeeded: true,
    entries: [...entries].map(([key, branches]) => [key, [...branches]]),
  });
}

/** Return a detached map so inline/panel consumers cannot mutate the saved snapshot. */
export function explicitBranches(
  snapshot: ExplicitExpansionSnapshot,
  key: string,
): Map<string, boolean> {
  return new Map(snapshot.entries.find(([root]) => root === key)?.[1]);
}

export function updateExplicitExpansion(
  snapshot: ExplicitExpansionSnapshot,
  key: string,
  branches: ReadonlyMap<string, boolean>,
): ExplicitExpansionSnapshot {
  const next = copyExplicitExpansion(snapshot);
  const entries = new Map(next.entries);
  entries.set(key, [...branches]);
  return copyExplicitExpansion({ ...next, entries: [...entries] });
}
