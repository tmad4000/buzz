import * as React from "react";
import { ConversationViewGuards } from "./ConversationViewGuards";
import {
  ConversationLayoutController,
  type LayoutControllerSnapshot,
} from "./layout/controller";
import type { LayoutScope, LayoutStorage } from "./layout/storage";
import { WorkspaceLifetime } from "./workspaceLifetime";

type WorkspaceConfig = {
  scope: LayoutScope;
  storage: LayoutStorage;
  initialChannelId: string | null;
  canOpen: (channelId: string) => boolean;
};
export type ConversationWorkspaceSession = {
  scopeKey: string;
  controller: ConversationLayoutController;
  guards: ConversationViewGuards;
  flush: () => void;
  dispose: () => void;
};
const browserStorage: LayoutStorage = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
};
const emptySnapshot = () => null;
const noSubscription = (_listener: () => void) => () => {};

/** Caller readiness means canonical identity/community and membership hydration, not refetch activity. */
export function useConversationWorkspace({
  scope,
  relayUrl,
  scopeEpoch,
  ready,
  initialChannelId,
  canOpen,
  storage = browserStorage,
}: {
  scope: LayoutScope | null;
  relayUrl: string | null;
  scopeEpoch: string | number;
  ready: boolean;
  initialChannelId: string | null;
  canOpen: (channelId: string) => boolean;
  storage?: LayoutStorage;
}) {
  const [owner] = React.useState(
    () =>
      new WorkspaceLifetime<WorkspaceConfig, ConversationWorkspaceSession>(),
  );
  const [installed, setInstalled] =
    React.useState<ConversationWorkspaceSession | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const validScope =
    scope &&
    [scope.communityId, scope.identityPubkey, scope.windowSlot].every(
      (value) =>
        typeof value === "string" && value.length > 0 && value.length <= 256,
    );
  const scopeKey =
    ready && validScope && relayUrl
      ? JSON.stringify([
          scope.communityId,
          scope.identityPubkey,
          scope.windowSlot,
          relayUrl,
          scopeEpoch,
        ])
      : null;
  const initial =
    scopeKey && initialChannelId && canOpen(initialChannelId)
      ? initialChannelId
      : installed?.scopeKey === scopeKey
        ? (Object.values(installed.controller.getSnapshot().layout.views).find(
            (view) => canOpen(view.channelId),
          )?.channelId ?? null)
        : null;
  // Keep inaccessible restored resources as placeholders after the workspace has started.
  const wantedKey =
    scopeKey && (initial || installed?.scopeKey === scopeKey) ? scopeKey : null;

  React.useLayoutEffect(() => {
    try {
      const config =
        wantedKey && scope
          ? {
              scope: {
                communityId: scope.communityId,
                identityPubkey: scope.identityPubkey,
                windowSlot: scope.windowSlot,
              },
              storage,
              initialChannelId: initial,
              canOpen,
            }
          : null;
      const next = owner.commit(wantedKey, config, (lease) => {
        const current = lease.config();
        if (!current?.initialChannelId)
          throw new Error("No authorized conversation is ready");
        const guards = new ConversationViewGuards();
        const controller = new ConversationLayoutController({
          scope: current.scope,
          storage: current.storage,
          initialChannelId: current.initialChannelId,
          isCurrentScope: lease.isCurrent,
          canOpen: (channelId) => lease.config()?.canOpen(channelId) ?? false,
          canLeave: (view) => guards.allow(view.id),
        });
        return {
          scopeKey: wantedKey as string,
          controller,
          guards,
          flush: controller.flush,
          dispose: () => controller.dispose(),
        };
      });
      if (next !== installed) setInstalled(next);
      if (error !== null) setError(null);
    } catch (cause) {
      if (installed !== null) setInstalled(null);
      const message =
        cause instanceof Error
          ? cause.message
          : "Conversation panes are unavailable";
      if (error !== message) setError(message);
    }
  });
  React.useLayoutEffect(() => () => owner.clear(), [owner]);

  // A pending identity/resource commit must never expose the prior session to rendering.
  const session = installed?.scopeKey === wantedKey ? installed : null;
  const snapshot = React.useSyncExternalStore<LayoutControllerSnapshot | null>(
    session?.controller.subscribe ?? noSubscription,
    session?.controller.getSnapshot ?? emptySnapshot,
    emptySnapshot,
  );
  return { session, snapshot, error };
}
