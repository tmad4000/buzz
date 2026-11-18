/** Find a saved anchor or one of its eight neighbors within loaded projected rows. */
export function loadedThreadWindowAnchor(
  indexById: ReadonlyMap<string, number>,
  length: number,
  candidates: readonly string[],
): { index: number; start: number } | null {
  for (const id of candidates.slice(0, 9)) {
    const index = indexById.get(id);
    if (index === undefined || index < 0 || index >= length) continue;
    return {
      index,
      start: Math.min(Math.max(0, index - 8), Math.max(0, length - 40)),
    };
  }
  return null;
}
