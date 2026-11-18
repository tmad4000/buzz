import * as React from "react";
import { ChevronRight, CornerUpRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
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
  type AgentLane,
} from "./model";
import {
  forwardScope,
  loadAgentSectionIds,
  readForwardSections,
} from "./targets";
import { useForwardAgentSend } from "./useForwardAgentSend";
import { ForwardAudienceConfirm } from "./ForwardAudienceConfirm";
import { Input } from "@/shared/ui/input";
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
  const [open, setOpen] = React.useState(false);
  const noteInputId = React.useId();
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
  const { busy, note, setNote, pending, forward, confirm, cancel } =
    useForwardAgentSend({
      channelId,
      message,
      signer,
      relayUrl,
      scope,
      channels,
      known,
      sectionIds: query.data?.ids,
      send: mutation.mutateAsync,
      closeMenu: () => {
        setOpen(false);
        onOpenChange?.(false);
      },
    });
  if (!source || !signer || !relayUrl || identity?.locked) return null;
  return (
    <>
      <ForwardAudienceConfirm
        audiences={pending?.audiences ?? null}
        targetLabel={pending?.intent.label}
        note={pending?.intent.note ?? ""}
        busy={busy}
        onCancel={cancel}
        onConfirm={() => void confirm()}
      />
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
              Forward quoted reference material. Only your optional note is a
              new instruction.
            </p>
            <label htmlFor={noteInputId} className="block px-2 py-1 text-xs">
              Your optional instruction (one line)
              <Input
                id={noteInputId}
                value={note}
                maxLength={500}
                onChange={(event) =>
                  setNote(event.target.value.replace(/[\r\n]/g, " "))
                }
                onKeyDown={(event) => {
                  if (!["Escape", "Tab"].includes(event.key))
                    event.stopPropagation();
                }}
              />
            </label>
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
    </>
  );
}
