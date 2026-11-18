import type { PageLeaveGuard, PageLeaveGuardRegistrar } from "./pageLeaveGuard";
import * as React from "react";
import type { Channel } from "@/shared/api/types";
import { Button } from "@/shared/ui/button";
import { ChannelPage } from "./ChannelPage";

/** Keep panel presentation local to the owning conversation view instance. */
export function useChannelPageSurface(
  channel: Channel | null,
  endActions: React.ReactNode,
  registerTargetLeaveGuard?: PageLeaveGuardRegistrar,
  canExpand = false,
) {
  const [pageChannel, setPageChannel] = React.useState<string | null>(null);
  const pageOpen = Boolean(channel && pageChannel === channel.id);
  const [expanded, setExpanded] = React.useState(false);
  const pageExpanded = pageOpen && canExpand && expanded;
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
  const closePage = React.useCallback(() => {
    if (requirePageEditResolution()) {
      setPageChannel(null);
      setExpanded(false);
    }
  }, [requirePageEditResolution]);
  const pageHeaderActions = React.useMemo(
    () => (
      <>
        {channel?.isMember ? (
          <Button
            size="sm"
            variant={pageOpen ? "secondary" : "outline"}
            onClick={() => {
              if (pageOpen) closePage();
              else {
                setPageChannel(channel.id);
                setExpanded(false);
              }
            }}
          >
            Page
          </Button>
        ) : null}
        {endActions}
      </>
    ),
    [channel, pageOpen, endActions, closePage],
  );
  const onShortcut = React.useCallback(
    (action: "toggle" | "restore") => {
      if (pageOpen && canExpand)
        setExpanded((previous) => action === "toggle" && !previous);
    },
    [pageOpen, canExpand],
  );
  const onPageKeyDown = (event: React.KeyboardEvent) => {
    if (pageExpanded && event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault();
      event.stopPropagation();
      onShortcut("restore");
    }
  };
  const pagePanel =
    pageOpen && channel ? (
      <ChannelPage
        key={channel.id}
        channelId={channel.id}
        canEdit={channel.isMember}
        registerLeaveGuard={registerLeaveGuard}
        expanded={pageExpanded}
        onShortcut={canExpand ? onShortcut : undefined}
      />
    ) : null;
  return {
    pageOpen,
    pageExpanded,
    onPageKeyDown,
    closePage,
    pageHeaderActions,
    pagePanel,
    requirePageEditResolution,
  };
}
