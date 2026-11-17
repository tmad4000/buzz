import type { PageLeaveGuard, PageLeaveGuardRegistrar } from "./pageLeaveGuard";
import * as React from "react";
import { ConversationViewContext } from "@/features/conversations/ConversationViewContext";
import { ConversationViewGuardsContext } from "@/features/conversations/ConversationViewGuards";
import type { Channel } from "@/shared/api/types";
import { Button } from "@/shared/ui/button";
import { ChannelPage } from "./ChannelPage";

/** Keep panel presentation local to the owning conversation view instance. */
export function useChannelPageSurface(
  channel: Channel | null,
  endActions: React.ReactNode,
  registerTargetLeaveGuard?: PageLeaveGuardRegistrar,
) {
  const [pageChannel, setPageChannel] = React.useState<string | null>(null);
  const pageOpen = Boolean(channel && pageChannel === channel.id);
  const guard = React.useRef<PageLeaveGuard>(() => true);
  const requirePageEditResolution = React.useCallback(
    () => guard.current(),
    [],
  );
  const registerLeaveGuard = React.useCallback<PageLeaveGuardRegistrar>(
    (next) => {
      guard.current = next;
      return () => {
        if (guard.current === next) guard.current = () => true;
      };
    },
    [],
  );
  React.useLayoutEffect(
    () => registerTargetLeaveGuard?.(requirePageEditResolution),
    [registerTargetLeaveGuard, requirePageEditResolution],
  );
  const guards = React.useContext(ConversationViewGuardsContext);
  const viewId = React.useContext(ConversationViewContext)?.viewInstanceId;
  const canChange = React.useCallback(
    () =>
      guards && viewId ? guards.allow(viewId) : requirePageEditResolution(),
    [guards, viewId, requirePageEditResolution],
  );
  const closePage = React.useCallback(() => {
    if (canChange()) setPageChannel(null);
  }, [canChange]);
  const pageHeaderActions = React.useMemo(
    () => (
      <>
        {channel?.isMember ? (
          <Button
            size="sm"
            variant={pageOpen ? "secondary" : "outline"}
            onClick={() => {
              if (pageOpen) closePage();
              else if (canChange()) setPageChannel(channel.id);
            }}
          >
            Page
          </Button>
        ) : null}
        {endActions}
      </>
    ),
    [channel, pageOpen, endActions, closePage, canChange],
  );
  const pagePanel =
    pageOpen && channel ? (
      <ChannelPage
        key={channel.id}
        channelId={channel.id}
        canEdit={channel.isMember}
        registerLeaveGuard={registerLeaveGuard}
      />
    ) : null;
  return {
    pageOpen,
    closePage,
    pageHeaderActions,
    pagePanel,
    requirePageEditResolution,
  };
}
