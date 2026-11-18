import * as React from "react";
import { loadActiveCommunityId } from "@/features/communities/communityStorage";
import {
  loadThreadExpansion,
  saveThreadExpansion,
  THREAD_EXPANSION_CHANGED,
  type ThreadExpansion,
} from "../lib/threadExpansionStorage";
import {
  copyExplicitExpansion,
  canonicalExplicitExpansionKey,
  explicitBranches,
  seedExplicitExpansion,
  updateExplicitExpansion,
  type ExplicitExpansionSnapshot,
} from "@/features/conversations/layout/explicitExpansion";

type ExpansionStorage = {
  /** Only explicit interaction deltas persist when automatic reveals are visit-local. */
  persistManualInVisits?: true;
  load: (key: string | null) => ThreadExpansion;
  save: (key: string, branches: ThreadExpansion) => boolean;
};
const legacyStorage: ExpansionStorage = {
  load: loadThreadExpansion,
  save: saveThreadExpansion,
};
const Context = React.createContext<ExpansionStorage>(legacyStorage);
export const useThreadExpansionStorage = () => React.useContext(Context);

function legacyChoices(
  community: string | null,
  identity: string | undefined,
  channel: string,
) {
  const choices: [string, ThreadExpansion][] = [];
  let branchCount = 0;
  // Bound the migration scan independently of unrelated device storage contents.
  if (window.localStorage.length > 4096)
    throw new Error("Legacy thread choices exceed migration scan bound");
  for (let index = 0; index < window.localStorage.length; index++) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith("buzz-thread-expansion.v1:")) continue;
    const raw = key.endsWith(":inline") ? key.slice(0, -7) : key;
    let tuple: unknown;
    try {
      tuple = JSON.parse(raw.slice("buzz-thread-expansion.v1:".length));
    } catch {
      continue;
    }
    if (
      !Array.isArray(tuple) ||
      tuple.length !== 4 ||
      tuple[0] !== community ||
      tuple[1] !== (identity ?? null) ||
      tuple[2] !== channel
    )
      continue;
    const rawValue = window.localStorage.getItem(key);
    if (rawValue && rawValue.length > 64 * 1024)
      throw new Error("Legacy thread choices exceed snapshot byte bound");
    const branches = loadThreadExpansion(key);
    branchCount += branches.size;
    if (branchCount > 1024)
      throw new Error("Legacy thread choices exceed branch bound");
    choices.push([key, branches]);
    if (choices.length > 128)
      throw new Error("Legacy thread choices exceed snapshot bound");
  }
  return choices;
}

type ScopeProps = {
  children: React.ReactNode;
  viewId: string;
  channelId: string | null;
  currentPubkey?: string;
  initialSnapshot?: ExplicitExpansionSnapshot;
  seedLegacy?: boolean;
  onChange?: (snapshot: ExplicitExpansionSnapshot) => boolean;
};

/** A ready identity/resource gets a fresh store even after an unavailable placeholder. */
export function ThreadExpansionScopeProvider(props: ScopeProps) {
  return (
    <ThreadExpansionVisit
      key={JSON.stringify([
        props.viewId,
        props.channelId,
        props.currentPubkey ?? null,
      ])}
      {...props}
    />
  );
}

/** One mounted owning visit; durable explicit choices, ephemeral Smart state elsewhere. */
function ThreadExpansionVisit({
  children,
  viewId,
  channelId,
  currentPubkey,
  initialSnapshot,
  seedLegacy,
  onChange,
}: ScopeProps) {
  const [initial] = React.useState(() => {
    let snapshot = initialSnapshot
      ? copyExplicitExpansion(initialSnapshot)
      : ({
          legacySeeded: !seedLegacy,
          entries: [],
        } as ExplicitExpansionSnapshot);
    let migrated = false,
      failed = false;
    if (seedLegacy && channelId && currentPubkey && !snapshot.legacySeeded) {
      try {
        snapshot = seedExplicitExpansion(
          snapshot,
          legacyChoices(loadActiveCommunityId(), currentPubkey, channelId),
        );
        migrated = true;
      } catch {
        failed = true;
      }
    }
    return { snapshot, migrated, failed };
  });
  const snapshot = React.useRef(initial.snapshot);
  const callback = React.useRef(onChange);
  callback.current = onChange;
  const mounted = React.useRef(true);
  const announced = React.useRef(false);
  const [failed, setFailed] = React.useState(initial.failed);
  React.useLayoutEffect(() => {
    mounted.current = true;
    if (initial.migrated && !announced.current) {
      announced.current = true;
      if (callback.current?.(copyExplicitExpansion(snapshot.current)) === false)
        setFailed(true);
    }
    return () => {
      mounted.current = false;
    };
  }, [initial.migrated]);
  const storage = React.useMemo<ExpansionStorage>(
    () => ({
      persistManualInVisits: true,
      load: (key) => {
        const canonical = key
          ? canonicalExplicitExpansionKey(key, viewId)
          : null;
        return canonical
          ? explicitBranches(snapshot.current, canonical)
          : new Map();
      },
      save: (key, branches) => {
        const canonical = canonicalExplicitExpansionKey(key, viewId);
        if (!mounted.current || !canonical) return false;
        const previous = snapshot.current;
        try {
          const next = updateExplicitExpansion(previous, canonical, branches);
          snapshot.current = next;
          const accepted =
            callback.current?.(copyExplicitExpansion(next)) !== false;
          if (!accepted) {
            if (snapshot.current === next) snapshot.current = previous;
            setFailed(true);
            return false;
          }
          window.dispatchEvent(
            new CustomEvent(THREAD_EXPANSION_CHANGED, {
              detail: { key, branches: new Map(branches), persisted: true },
            }),
          );
          return true;
        } catch {
          snapshot.current = previous;
          setFailed(true);
          return false;
        }
      },
    }),
    [viewId],
  );
  return (
    <Context.Provider value={storage}>
      {children}
      {failed ? (
        <p role="status" className="px-3 text-xs text-muted-foreground">
          Some saved thread choices could not be restored or retained.
        </p>
      ) : null}
    </Context.Provider>
  );
}
