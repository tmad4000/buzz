import * as React from "react";
import type { Channel } from "@/shared/api/types";
import { Button } from "@/shared/ui/button";
import { ChannelPage } from "./ChannelPage";

/** Keep panel presentation local to the owning conversation view instance. */
export function useChannelPageSurface(
  channel: Channel | null,
  endActions: React.ReactNode,
) {
  const [pageChannel, setPageChannel] = React.useState<string | null>(null);
  const pageOpen = Boolean(channel && pageChannel === channel.id);
  const closePage = React.useCallback(() => setPageChannel(null), []);
  const pageHeaderActions = React.useMemo(
    () => (
      <>
        {channel?.isMember ? (
          <Button
            size="sm"
            variant={pageOpen ? "secondary" : "outline"}
            onClick={() => setPageChannel(pageOpen ? null : channel.id)}
          >
            Page
          </Button>
        ) : null}
        {endActions}
      </>
    ),
    [channel, pageOpen, endActions],
  );
  const pagePanel =
    pageOpen && channel ? (
      <ChannelPage
        key={channel.id}
        channelId={channel.id}
        canEdit={channel.isMember}
      />
    ) : null;
  return { pageOpen, closePage, pageHeaderActions, pagePanel };
}
