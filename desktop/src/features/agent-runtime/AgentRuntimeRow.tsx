import { useProfilePanel } from "@/shared/context/ProfilePanelContext";
import { useAgentRuntime } from "./useAgentRuntime";
import { OpenRuntimeSession } from "./AgentRuntimeCard";

/** Only callers holding a verified agent participant pass its key here. */
export function AgentRuntimeHost({ pubkey }: { pubkey?: string }) {
  const { data } = useAgentRuntime(pubkey);
  return data ? (
    <span
      className="rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground"
      title="Self-reported runtime host"
    >
      {data.card.host.toUpperCase()}
    </span>
  ) : null;
}
export function AgentRuntimeRowAction({ pubkey }: { pubkey?: string }) {
  const { data } = useAgentRuntime(pubkey);
  const { openProfilePanel } = useProfilePanel();
  if (
    data &&
    !data.card.session &&
    data.card.resume?.length &&
    pubkey &&
    openProfilePanel
  )
    return (
      <span className="absolute right-7 top-1/2 -translate-y-1/2 rounded bg-sidebar px-1 opacity-0 focus-within:opacity-100 group-hover/menu-item:opacity-100 group-focus-within/menu-item:opacity-100">
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          className="text-xs text-primary underline"
          onClick={() => openProfilePanel(pubkey)}
        >
          Resume
        </button>
      </span>
    );
  return data?.card.session ? (
    <span className="absolute right-7 top-1/2 -translate-y-1/2 rounded bg-sidebar px-1 opacity-0 focus-within:opacity-100 group-hover/menu-item:opacity-100 group-focus-within/menu-item:opacity-100">
      <OpenRuntimeSession session={data.card.session} />
    </span>
  ) : null;
}
