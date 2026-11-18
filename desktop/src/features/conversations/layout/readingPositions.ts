import type { TimelineReadingPosition } from "@/features/messages/ui/timelineReadingPosition";

export const MAX_READING_POSITIONS = 8;
export const MAX_READING_POSITION_BYTES = 24 * 1024;
export type ViewReadingPositions = {
  key: string;
  position: TimelineReadingPosition;
}[];
const identifier = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 256;

export function readingPositionKey(
  role: "main",
  mode: "threads" | "timeline",
): string;
export function readingPositionKey(
  role: "thread",
  mode: "focus" | "split",
  rootId: string,
): string;
export function readingPositionKey(
  role: string,
  mode: string,
  rootId?: string,
): string {
  const key = JSON.stringify(
    rootId === undefined ? [role, mode] : [role, mode, rootId],
  );
  if (!validKey(key)) throw new Error("Invalid conversation reading context");
  return key;
}
function validKey(key: unknown): key is string {
  if (typeof key !== "string" || key.length > 1024) return false;
  try {
    const parts = JSON.parse(key);
    return (
      Array.isArray(parts) &&
      ((parts.length === 2 &&
        parts[0] === "main" &&
        ["threads", "timeline"].includes(parts[1])) ||
        (parts.length === 3 &&
          parts[0] === "thread" &&
          ["focus", "split"].includes(parts[1]) &&
          identifier(parts[2]))) &&
      JSON.stringify(parts) === key
    );
  } catch {
    return false;
  }
}
function exactKeys(value: object, keys: string[]) {
  const actual = Object.keys(value);
  return (
    actual.length === keys.length && actual.every((key) => keys.includes(key))
  );
}
function validPosition(value: unknown): value is TimelineReadingPosition {
  if (
    !value ||
    typeof value !== "object" ||
    !exactKeys(value, ["id", "offset", "pixel", "neighbors"])
  )
    return false;
  const p = value as TimelineReadingPosition;
  return (
    (p.id === null || identifier(p.id)) &&
    typeof p.offset === "number" &&
    Number.isFinite(p.offset) &&
    Math.abs(p.offset) <= 10_000_000 &&
    typeof p.pixel === "number" &&
    Number.isFinite(p.pixel) &&
    p.pixel >= 0 &&
    p.pixel <= 1_000_000_000 &&
    Array.isArray(p.neighbors) &&
    p.neighbors.length <= 8 &&
    p.neighbors.every(identifier) &&
    new Set(p.neighbors).size === p.neighbors.length
  );
}
export function isViewReadingPositions(
  value: unknown,
): value is ViewReadingPositions {
  try {
    if (!Array.isArray(value) || value.length > MAX_READING_POSITIONS)
      return false;
    const keys = new Set<string>();
    for (const entry of value) {
      if (
        !entry ||
        typeof entry !== "object" ||
        !exactKeys(entry, ["key", "position"]) ||
        !validKey(entry.key) ||
        keys.has(entry.key) ||
        !validPosition(entry.position)
      )
        return false;
      keys.add(entry.key);
    }
    return (
      new TextEncoder().encode(JSON.stringify(value)).length <=
      MAX_READING_POSITION_BYTES
    );
  } catch {
    return false;
  }
}
export function copyReadingPositions(
  value: ViewReadingPositions,
): ViewReadingPositions {
  return value.map(({ key, position }) => ({
    key,
    position: { ...position, neighbors: [...position.neighbors] },
  }));
}
export function readPosition(
  value: ViewReadingPositions | undefined,
  key: string,
): TimelineReadingPosition | undefined {
  const position = value?.find((entry) => entry.key === key)?.position;
  return position
    ? { ...position, neighbors: [...position.neighbors] }
    : undefined;
}
/** Merge against live owning-view state; never replace another timeline's slot. */
export function updateReadingPosition(
  value: ViewReadingPositions | undefined,
  key: string,
  position: TimelineReadingPosition,
): ViewReadingPositions | null {
  if (
    !validKey(key) ||
    !validPosition(position) ||
    (value !== undefined && !isViewReadingPositions(value))
  )
    return null;
  const existing = value?.find((entry) => entry.key === key);
  if (
    existing &&
    JSON.stringify(existing.position) === JSON.stringify(position)
  )
    return value ?? [];
  const next = copyReadingPositions(
    [
      ...(value ?? []).filter((entry) => entry.key !== key),
      { key, position },
    ].slice(-MAX_READING_POSITIONS),
  );
  return isViewReadingPositions(next) ? next : null;
}
