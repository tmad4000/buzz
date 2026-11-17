import { ConversationViewContext } from "@/features/conversations/ConversationViewContext";
import { loadActiveCommunityId } from "@/features/communities/communityStorage";
import * as React from "react";
import type { ThreadDisplayPolicy } from "../lib/threadDisplayPolicy";
import { useThreadDisplayPolicy } from "./useThreadDisplayPolicy";
type Candidate = {
  id: string;
  ready: boolean;
  kind: "answer" | "compact" | "expanded" | null;
  lastAt: number;
  answerId?: string;
};
type ContextValue = {
  policy: ThreadDisplayPolicy;
  scope: string;
  opened: ReadonlySet<string>;
  answerTargets: ReadonlyMap<string, string>;
  register: (candidate: Candidate) => void;
  remove: (id: string) => void;
};
const Context = React.createContext<ContextValue | null>(null);
/** Ephemeral channel-entry state survives root virtualization, never writes preferences. */
export function InlineAutoExpansionProvider({
  scope,
  currentPubkey,
  children,
}: {
  scope: string;
  currentPubkey?: string;
  children: React.ReactNode;
}) {
  const policy = useThreadDisplayPolicy(currentPubkey, scope);
  const view = React.useContext(ConversationViewContext);
  const community = React.useMemo(loadActiveCommunityId, []);
  const dataScope = React.useMemo(
    () =>
      JSON.stringify([
        community,
        currentPubkey ?? null,
        scope,
        view?.viewInstanceId ?? null,
      ]),
    [community, currentPubkey, scope, view?.viewInstanceId],
  );
  const [registry, setRegistry] = React.useState<Map<string, Candidate>>(
    () => new Map(),
  );
  const [opened, setOpened] = React.useState<Set<string>>(() => new Set());
  const [answerTargets, setAnswerTargets] = React.useState<Map<string, string>>(
    () => new Map(),
  );
  const compactGrants = React.useRef(new Set<string>());
  const register = React.useCallback(
    (candidate: Candidate) =>
      setRegistry((previous) => {
        const old = previous.get(candidate.id);
        if (
          old &&
          old.ready === candidate.ready &&
          old.kind === candidate.kind &&
          old.lastAt === candidate.lastAt &&
          old.answerId === candidate.answerId
        )
          return previous;
        const next = new Map(previous);
        next.set(candidate.id, candidate);
        return next;
      }),
    [],
  );
  const remove = React.useCallback(
    (id: string) =>
      setRegistry((previous) => {
        if (!previous.has(id)) return previous;
        const next = new Map(previous);
        next.delete(id);
        return next;
      }),
    [],
  );
  React.useEffect(() => {
    const answers = [...registry.values()]
      .filter((c) => c.ready && (c.kind === "answer" || c.kind === "expanded"))
      .map((c) => c.id);
    const nextTargets = new Map(answerTargets);
    for (const candidate of registry.values())
      if (
        candidate.ready &&
        candidate.kind === "answer" &&
        candidate.answerId &&
        !nextTargets.has(candidate.id)
      )
        nextTargets.set(candidate.id, candidate.answerId);
    if (nextTargets.size !== answerTargets.size) setAnswerTargets(nextTargets);
    const next = new Set([...opened, ...compactGrants.current]);
    for (const id of answers) next.add(id);
    if ([...registry.values()].every((c) => c.ready)) {
      const compact = [...registry.values()]
        .filter((c) => c.kind === "compact")
        .sort((a, b) => b.lastAt - a.lastAt || a.id.localeCompare(b.id));
      for (const candidate of compact) {
        if (next.has(candidate.id)) continue;
        if (compactGrants.current.size >= 3) break;
        compactGrants.current.add(candidate.id);
        next.add(candidate.id);
      }
    }
    if (next.size !== opened.size) setOpened(next);
  }, [registry, opened, answerTargets]);
  const value = React.useMemo(
    () => ({
      policy,
      scope: dataScope,
      opened,
      answerTargets,
      register,
      remove,
    }),
    [policy, dataScope, opened, answerTargets, register, remove],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useInlineAutoExpansion() {
  const value = React.useContext(Context);
  if (!value)
    throw new Error("Inline threads require a channel expansion scope");
  return value;
}
