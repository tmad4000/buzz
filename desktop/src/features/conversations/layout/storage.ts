import type { ConversationLayout } from "./model";
import { MAX_LAYOUT_BYTES, parseLayout, validateLayout } from "./schema";

export type LayoutScope = {
  communityId: string;
  identityPubkey: string;
  windowSlot: string;
};
export type LayoutStorage = Pick<Storage, "getItem" | "setItem">;
export const SESSION_ONLY_MESSAGE = "Layout saved for this session only.";

/** Call only after canonical community and identity are resolved and authorized. */
export function layoutStorageKey(scope: LayoutScope): string {
  if (Object.values(scope).some((value) => !value || value.length > 256))
    throw new Error("Invalid layout scope");
  return `buzz:conversation-layout:v1:${JSON.stringify([scope.communityId, scope.identityPubkey, scope.windowSlot])}`;
}

export type RestoredLayout = {
  layout: ConversationLayout | null;
  status: "empty" | "restored" | "recoverable" | "unavailable";
};

export function restoreLayout(
  storage: LayoutStorage,
  scope: LayoutScope,
): RestoredLayout {
  try {
    const raw = storage.getItem(layoutStorageKey(scope));
    if (raw === null) return { layout: null, status: "empty" };
    const layout = parseLayout(raw);
    return { layout, status: layout ? "restored" : "recoverable" };
  } catch {
    return { layout: null, status: "unavailable" };
  }
}

/** Preserve corrupt/older source before replacing it. No draft or cache eviction. */
export function saveLayout(
  storage: LayoutStorage,
  scope: LayoutScope,
  layout: ConversationLayout,
): { saved: boolean; message: string | null } {
  const valid = validateLayout(layout);
  if (!valid) return { saved: false, message: SESSION_ONLY_MESSAGE };
  const serialized = JSON.stringify(valid);
  if (serialized.length > MAX_LAYOUT_BYTES)
    return { saved: false, message: SESSION_ONLY_MESSAGE };
  try {
    const key = layoutStorageKey(scope);
    const previous = storage.getItem(key);
    if (previous !== null && !parseLayout(previous)) {
      // Recovery must succeed before the only original copy can be overwritten.
      storage.setItem(`${key}:recovery`, previous);
    }
    storage.setItem(key, serialized);
    return { saved: true, message: null };
  } catch {
    return { saved: false, message: SESSION_ONLY_MESSAGE };
  }
}
