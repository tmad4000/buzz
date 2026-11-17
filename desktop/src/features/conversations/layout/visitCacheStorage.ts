import { ConversationVisitCache, parseVisitCache } from "./visitCache";
import {
  layoutStorageKey,
  type LayoutScope,
  type LayoutStorage,
} from "./storage";

export const visitCacheStorageKey = (scope: LayoutScope) =>
  `${layoutStorageKey(scope)}:visits`;

export function restoreVisitCache(storage: LayoutStorage, scope: LayoutScope) {
  const cache = new ConversationVisitCache();
  try {
    const raw = storage.getItem(visitCacheStorageKey(scope));
    if (raw !== null) cache.restore(raw);
  } catch {
    // The live layout and canonical drafts remain usable without a device cache.
  }
  return cache;
}

/** Preserve an invalid prior cache before overwrite, independently of the layout tree. */
export function saveVisitCache(
  storage: LayoutStorage,
  scope: LayoutScope,
  cache: ConversationVisitCache,
) {
  const raw = cache.serialize();
  const valid = parseVisitCache(raw);
  if (!valid) return false;
  try {
    const key = visitCacheStorageKey(scope);
    const previous = storage.getItem(key);
    if (previous === raw || (previous === null && valid.views.length === 0))
      return true;
    if (previous !== null && !parseVisitCache(previous))
      storage.setItem(`${key}:recovery`, previous);
    storage.setItem(key, raw);
    return true;
  } catch {
    return false;
  }
}
