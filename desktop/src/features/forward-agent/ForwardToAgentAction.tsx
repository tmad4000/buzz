import * as React from "react";
import { ChevronRight, CornerUpRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useIdentityQuery } from "@/shared/api/hooks";
import { useCommunities } from "@/features/communities/useCommunities";
import { useChannelNavigation } from "@/shared/context/ChannelNavigationContext";
import { useKnownAgentPubkeys } from "@/features/agents/useKnownAgentPubkeys";
import { useSendMessageMutation } from "@/features/messages/hooks";
import { useAgentRuntime } from "@/features/agent-runtime/useAgentRuntime";
import type { TimelineMessage } from "@/features/messages/types";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import {
  canForwardSource,
  defaultAgentLane,
  directAgentLanes,
  linkedForward,
  type AgentLane,
} from "./model";
import {
  forwardScope,
  loadAgentSectionIds,
  readForwardSections,
} from "./targets";
import { forwardOnce, forwardRevision } from "./receipts";
import { useForwardAgentEnabled } from "./preference";

function RuntimeTargetLabel({ lane }: { lane: AgentLane }) {
  const { data } = useAgentRuntime(
    lane.agentPubkeys.length === 1 ? lane.agentPubkeys[0] : undefined,
  );
  return (
    <>
      {lane.label}
      {data ? (
        <span className="ml-2 font-mono text-xs text-muted-foreground">
          {data.card.host.toUpperCase()}
        </span>
      ) : null}
    </>
  );
}
export function ForwardToAgentAction(props: {
  channelId?: string | null;
  message: TimelineMessage;
  onOpenChange?: (open: boolean) => void;
}) {
  const enabled = useForwardAgentEnabled();
  return enabled && canForwardSource(props.message, props.channelId) ? (
    <EnabledForwardAction {...props} />
  ) : null;
}
function EnabledForwardAction({
  channelId,
  message,
  onOpenChange,
}: {
  channelId?: string | null;
  message: TimelineMessage;
  onOpenChange?: (open: boolean) => void;
}) {
  const identity = useIdentityQuery().data;
  const { activeCommunity } = useCommunities();
  const { channels } = useChannelNavigation();
  const known = useKnownAgentPubkeys();
  const source = channels.find((c) => c.id === channelId) ?? null;
  const mutation = useSendMessageMutation(source, identity);
  const signer = identity?.pubkey;
  const relayUrl = activeCommunity?.relayUrl;
  const scope = signer && relayUrl ? forwardScope(signer, relayUrl) : "";
  const [busy, setBusy] = React.useState(false);
  const lock = React.useRef(false);
  const [open, setOpen] = React.useState(false);
  const activeOwner = `${scope}:${message.id}`;
  const ownerRef = React.useRef(activeOwner);
  ownerRef.current = activeOwner;
  const mounted = React.useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: A new source/scope releases only its own UI state.
  React.useEffect(() => {
    lock.current = false;
    setBusy(false);
    setOpen(false);
  }, [activeOwner]);
  const ownsUi = () => mounted.current && ownerRef.current === activeOwner;
  const query = useQuery({
    queryKey: ["forward-agent-targets", scope],
    enabled: Boolean(scope),
    staleTime: Infinity,
    queryFn: async () => {
      if (!signer || !relayUrl) throw new Error("No forwarding identity.");
      return {
        ids: await loadAgentSectionIds(signer, relayUrl),
        sections: readForwardSections(signer, relayUrl),
      };
    },
  });
  const lanes =
    query.data && signer
      ? directAgentLanes(
          channels,
          query.data.sections,
          query.data.ids,
          signer,
          known,
        )
      : [];
  const targetDefault = channelId ? defaultAgentLane(channelId, lanes) : null;
  const forward = async (
    targetId: string,
    label: string,
    isDefault = false,
  ) => {
    if (lock.current || !signer || !relayUrl || !channelId || !query.data)
      return;
    lock.current = true;
    setBusy(true);
    setOpen(false);
    onOpenChange?.(false);
    try {
      const current = directAgentLanes(
        channels,
        readForwardSections(signer, relayUrl),
        query.data.ids,
        signer,
        known,
      );
      const lane = current.find(
        (l) => l.channel.id === targetId && l.channel.id !== channelId,
      );
      if (!lane || lane.agentPubkeys.length !== 1)
        throw new Error(
          "Destination changed or has no single agent. Reopen the picker.",
        );
      if (
        isDefault &&
        defaultAgentLane(channelId, current)?.lane.channel.id !== targetId
      )
        throw new Error("Default destination changed. Reopen the picker.");
      const content = linkedForward(channelId, message);
      const revision = await forwardRevision(content);
      const receipt = await forwardOnce(
        scope,
        channelId,
        message.id,
        targetId,
        isDefault
          ? lane.channel.channelType === "stream"
            ? "P2"
            : "Paseo DM"
          : label,
        () =>
          mutation.mutateAsync({
            targetChannel: lane.channel,
            channelId: targetId,
            content,
            mentionPubkeys: lane.agentPubkeys,
            parentEventId: null,
            transport: "http",
            expectedScope: { relayUrl, signerPubkey: signer },
          }),
        signer,
        revision,
      );
      if (ownsUi()) toast.success(`Forwarded to ${receipt.label}`);
    } catch (error) {
      if (ownsUi()) {
        const detail =
          error instanceof Error ? error.message : "Could not confirm forward.";
        toast.error(
          /timed out|timeout|network|connection|uncertain/i.test(detail)
            ? `${detail} Check the target before retrying.`
            : detail,
        );
      }
    } finally {
      if (ownsUi()) {
        lock.current = false;
        setBusy(false);
      }
    }
  };
  if (!source || !signer || !relayUrl || identity?.locked) return null;
  return (
    <div
      className="flex items-center gap-1"
      data-testid={`forward-agent-${message.id}`}
    >
      {targetDefault ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 w-8 rounded-full p-0"
          aria-label={`Forward to ${targetDefault.label}`}
          title={`Forward to ${targetDefault.label}`}
          disabled={
            busy ||
            query.isError ||
            targetDefault.lane.agentPubkeys.length !== 1
          }
          onClick={() =>
            void forward(
              targetDefault.lane.channel.id,
              targetDefault.label,
              true,
            )
          }
        >
          <CornerUpRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      ) : null}
      <DropdownMenu
        modal={false}
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          onOpenChange?.(next);
          if (next) void query.refetch();
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 w-8 rounded-full p-0"
            aria-label="Forward to agent ▸"
            title="Forward to agent ▸"
            disabled={busy}
          >
            {targetDefault ? (
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            ) : (
              <CornerUpRight className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="end"
          aria-label="Forward to agent"
        >
          <p className="max-w-72 px-2 py-1 text-xs text-muted-foreground">
            Sends this quote and its source link as you. Choose a destination.
          </p>
          {query.isError ? (
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                void query.refetch();
              }}
            >
              Could not load targets — Retry
            </DropdownMenuItem>
          ) : null}
          {lanes
            .filter((l) => l.channel.id !== channelId)
            .map((lane) => (
              <DropdownMenuItem
                key={lane.channel.id}
                disabled={
                  busy || query.isError || lane.agentPubkeys.length !== 1
                }
                onSelect={() => void forward(lane.channel.id, lane.label)}
              >
                <RuntimeTargetLabel lane={lane} />
                {lane.agentPubkeys.length !== 1 ? " · needs one agent" : null}
              </DropdownMenuItem>
            ))}
          {!lanes.length && !query.isError ? (
            <p className="max-w-72 px-2 py-2 text-xs text-muted-foreground">
              {query.isPending
                ? "Loading Direct agents…"
                : "Add agent conversations to your Direct agents section to choose them here."}
            </p>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
