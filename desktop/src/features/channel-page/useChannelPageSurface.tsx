import type { PageLeaveGuard, PageLeaveGuardRegistrar } from "./pageLeaveGuard";
import * as React from "react";
import type { Channel } from "@/shared/api/types";
import { Button } from "@/shared/ui/button";
import { ChannelPage } from "./ChannelPage";

type PageSection = {
  channelId: string;
  messageId: string;
  sectionId: string;
  title: string;
};

/** Keep panel presentation local to the owning conversation view instance. */
export function useChannelPageSurface(
  channel: Channel | null,
  endActions: React.ReactNode,
  registerTargetLeaveGuard?: PageLeaveGuardRegistrar,
  resolvePageSection?: (messageId: string) => PageSection | undefined,
) {
  const [selection, setSelection] = React.useState<{
    channelId: string;
    section?: PageSection;
  } | null>(null);
  const selectedSection = selection?.section;
  const currentSection =
    selectedSection && resolvePageSection?.(selectedSection.messageId);
  const sectionAvailable = Boolean(
    channel?.isMember &&
      currentSection?.channelId === channel.id &&
      currentSection?.sectionId === selectedSection?.sectionId,
  );
  const activePage =
    channel?.id === selection?.channelId &&
    (!selectedSection || sectionAvailable)
      ? selection
      : null;
  React.useEffect(() => {
    if (!selectedSection || (activePage && currentSection)) return;
    setSelection((prior) =>
      prior?.section === selectedSection ? null : prior,
    );
  }, [activePage, currentSection, selectedSection]);
  const pageOpen = activePage !== null;
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
    if (requirePageEditResolution()) setSelection(null);
  }, [requirePageEditResolution]);
  const openPageSection = React.useCallback(
    (section: PageSection) => {
      if (
        channel?.isMember &&
        section.channelId === channel.id &&
        resolvePageSection?.(section.messageId)?.sectionId ===
          section.sectionId &&
        requirePageEditResolution()
      ) {
        setSelection({ channelId: channel.id, section });
      }
    },
    [
      resolvePageSection,
      channel?.id,
      channel?.isMember,
      requirePageEditResolution,
    ],
  );
  const fullPageOpen = pageOpen && !activePage?.section;
  const pageHeaderActions = React.useMemo(
    () => (
      <>
        {channel?.isMember ? (
          <Button
            size="sm"
            variant={fullPageOpen ? "secondary" : "outline"}
            onClick={() => {
              if (fullPageOpen) closePage();
              else setSelection({ channelId: channel.id });
            }}
          >
            Page
          </Button>
        ) : null}
        {endActions}
      </>
    ),
    [channel, fullPageOpen, endActions, closePage],
  );
  const pagePanel =
    activePage && channel ? (
      <ChannelPage
        key={JSON.stringify([channel.id, activePage.section?.sectionId])}
        channelId={channel.id}
        canEdit={channel.isMember}
        sectionId={activePage.section?.sectionId}
        sectionTitle={activePage.section ? currentSection?.title : undefined}
        registerLeaveGuard={registerLeaveGuard}
      />
    ) : null;
  return {
    pageOpen,
    pageTitle: activePage?.section ? (currentSection?.title ?? "Page") : "Page",
    openPageSection,
    closePage,
    pageHeaderActions,
    pagePanel,
    requirePageEditResolution,
  };
}
