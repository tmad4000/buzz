import * as React from "react";
import {
  applyThreadLinkPresentation,
  mergeThreadLinkEvents,
  threadLinkSubtree,
} from "./lib/applyThreadLinkPresentation";
import type { ThreadLinkSnapshot } from "./lib/threadLinkLoader";
import { buildThreadPanelData } from "./lib/threadPanel";

import { buildIndependentThreadPanel } from "@/features/messages/lib/independentThreadPanel";
import type { UserProfileLookup } from "@/features/profile/lib/identity";
import type {
  Channel,
  ChannelMember,
  RelayEvent,
  RespondToMode,
} from "@/shared/api/types";

export function useIndependentThreadPanel(args: {
  activeChannel: Channel | null;
  channelEvents: RelayEvent[];
  threadReplyEvents: RelayEvent[];
  rootId: string | null;
  organization?: ThreadLinkSnapshot | null;
  replyTargetId: string | null;
  expandedReplyIds: ReadonlySet<string>;
  currentPubkey: string | undefined;
  currentAvatarUrl: string | null;
  profiles: UserProfileLookup | undefined;
  ownerProfiles: UserProfileLookup | undefined;
  members: ChannelMember[] | undefined;
  personaLookup: Map<string, string>;
  respondToLookup: Map<string, RespondToMode>;
  relaySelfPubkey: string | null | undefined;
}) {
  // Depend on the individual fields, NOT the `args` object — callers pass a
  // fresh object literal every render, so `[args]` never memoizes and the
  // full O(replies) formatTimelineMessages + buildThreadPanelData rebuild
  // runs on every ChannelScreen render. In a long thread with agents
  // streaming (an event or typing tick per ~150ms, each re-rendering the
  // screen) that saturates the main thread and starves keystrokes — see
  // typing-latency.perf.ts scenario "thread68+". Mirrors the main timeline's
  // memoization of the same formatter (ChannelScreen `timelineMessages`).
  return React.useMemo(() => {
    const union =
      args.organization?.projection.status === "complete"
        ? mergeThreadLinkEvents(
            args.organization.events,
            args.threadReplyEvents,
          ).filter((event) => event.id !== args.rootId)
        : args.threadReplyEvents;
    const panel = buildIndependentThreadPanel(
      args.channelEvents,
      union,
      args.rootId,
      args.replyTargetId,
      args.expandedReplyIds,
      args.activeChannel,
      args.currentPubkey,
      args.currentAvatarUrl,
      args.profiles,
      args.members,
      args.personaLookup,
      args.respondToLookup,
      args.relaySelfPubkey,
      args.ownerProfiles,
    );
    const messages = threadLinkSubtree(
      applyThreadLinkPresentation(panel.messages, args.organization ?? null),
      args.rootId,
    );
    return {
      ...buildThreadPanelData(
        messages,
        args.rootId,
        args.replyTargetId,
        args.expandedReplyIds,
      ),
      messages,
    };
  }, [
    args.channelEvents,
    args.organization,
    args.threadReplyEvents,
    args.rootId,
    args.replyTargetId,
    args.expandedReplyIds,
    args.activeChannel,
    args.currentPubkey,
    args.currentAvatarUrl,
    args.profiles,
    args.ownerProfiles,
    args.members,
    args.personaLookup,
    args.respondToLookup,
    args.relaySelfPubkey,
  ]);
}
