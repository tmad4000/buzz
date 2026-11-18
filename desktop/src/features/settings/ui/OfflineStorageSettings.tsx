import * as React from "react";
import { toast } from "sonner";
import { useCommunities } from "@/features/communities/useCommunities";
import { getIdentity } from "@/shared/api/tauriIdentity";
import {
  prepareOfflineCache,
  clearOffline,
  offlineAdapter,
  offlineCacheEnabled,
  offlineScopeKey,
  type OfflineKind,
} from "@/shared/api/offlineCache";

/** Device-local opt-in and disposal of derived snapshots, independent of drafts/outbox. */
export function OfflineStorageSettings() {
  const { activeCommunity } = useCommunities();
  const [enabled, setEnabled] = React.useState(offlineCacheEnabled);
  const [bytes, setBytes] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);
  const scope = async () => {
    if (!activeCommunity) throw new Error("Select a community first");
    const identity = await getIdentity();
    if (identity.locked || identity.lost)
      throw new Error("Offline cache identity unavailable");
    return {
      pubkey: identity.pubkey,
      relayUrl: activeCommunity.relayUrl,
    };
  };
  React.useEffect(() => {
    if (!enabled) {
      setBytes(null);
      return;
    }
    let current = true;
    void scope()
      .then(async (value) => {
        const rows = await Promise.all(
          (["head", "thread", "sidebar", "profile"] as OfflineKind[]).map(
            (kind) => offlineAdapter().list(offlineScopeKey(value), kind),
          ),
        );
        if (current)
          setBytes(rows.flat().reduce((sum, row) => sum + row.bytes, 0));
      })
      .catch(() => {
        if (current) setBytes(0);
      });
    return () => {
      current = false;
    };
  }, [activeCommunity, enabled]);
  const toggle = async (value: boolean) => {
    setBusy(true);
    try {
      window.localStorage.setItem(
        "buzz-offline-cache-v1",
        value ? "on" : "off",
      );
      if (value) await prepareOfflineCache();
      setEnabled(value);
      toast.success("Offline cache setting saved. Restart Buzz to apply.");
    } catch {
      toast.error("Could not prepare offline cache. Restart to retry.");
    } finally {
      setBusy(false);
    }
  };
  const clear = async () => {
    setBusy(true);
    try {
      await clearOffline(await scope());
      setBytes(0);
      toast.success("Cached messages cleared");
    } catch {
      toast.error("Could not clear cached messages. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3 border-t py-4">
      <h3 className="text-sm font-medium">Storage</h3>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          disabled={busy}
          checked={enabled}
          onChange={(event) => void toggle(event.target.checked)}
        />
        Keep encrypted messages for offline reading
      </label>
      <p className="text-sm text-muted-foreground">
        Stored on this device. Requires an unlocked NIP-44 signer. Attachments
        are metadata only. Restart Buzz after changing this setting.
      </p>
      <button
        type="button"
        disabled={busy || !enabled || !activeCommunity}
        onClick={() => void clear()}
        className="text-sm underline"
      >
        Clear cached messages
        {bytes === null ? "" : ` (${(bytes / 1024).toFixed(0)} KB)`}
      </button>
    </div>
  );
}
