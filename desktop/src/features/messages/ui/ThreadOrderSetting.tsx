import * as React from "react";
import { ChannelOrderSelect } from "@/features/channels/ui/ChannelOrderSelect";
import { loadActiveCommunityId } from "@/features/communities/communityStorage";
import { setLocalStorageItemWithRecovery } from "@/shared/lib/localStorageQuota";
import { flatThreadViewKey } from "../lib/flatThreadView";

const FLAT_THREAD_VIEW_CHANGED = "buzz-thread-flat-changed";

function load(key: string | null): boolean {
  try {
    return key !== null && window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/** A remembered, local-only view choice for one thread; nested is the default. */
export function useFlatThreadView(
  currentPubkey: string | undefined,
  channelId: string | null,
  root: string | null,
) {
  const community = React.useMemo(loadActiveCommunityId, []);
  const key = flatThreadViewKey(community, currentPubkey, channelId, root);
  const [saved, setSaved] = React.useState(() => ({ key, flat: load(key) }));
  const stored = React.useMemo(() => load(key), [key]);
  const flat = saved.key === key ? saved.flat : stored;
  React.useEffect(() => {
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ key: string; flat: boolean }>)
        .detail;
      if (detail?.key === key) setSaved(detail);
    };
    window.addEventListener(FLAT_THREAD_VIEW_CHANGED, changed);
    return () => window.removeEventListener(FLAT_THREAD_VIEW_CHANGED, changed);
  }, [key]);
  const setFlat = React.useCallback(
    (next: boolean) => {
      if (!key) return;
      // Nested is the default, so only a flat choice occupies storage. When
      // storage is unavailable the choice still applies to mounted views.
      try {
        if (next) setLocalStorageItemWithRecovery(key, "1");
        else window.localStorage.removeItem(key);
      } catch {
        /* Session-only. */
      }
      window.dispatchEvent(
        new CustomEvent(FLAT_THREAD_VIEW_CHANGED, {
          detail: { key, flat: next },
        }),
      );
    },
    [key],
  );
  return { flat, setFlat };
}

const OPTIONS = [
  { value: "nested", label: "Nested" },
  { value: "flat", label: "Flat" },
] as const;

/** The channel Order control, scoped to one thread. */
export function ThreadOrderSetting({
  flat,
  onChange,
}: {
  flat: boolean;
  onChange: (flat: boolean) => void;
}) {
  return (
    <ChannelOrderSelect
      label="Thread order"
      onChange={(value) => onChange(value === "flat")}
      options={OPTIONS}
      value={flat ? "flat" : "nested"}
    />
  );
}
