import * as React from "react";
import type { Channel } from "@/shared/api/types";
import { SidebarProvider } from "@/shared/ui/sidebar";
import {
  SidebarDndContext,
  DroppableUngroupedBody,
} from "@/features/sidebar/ui/SidebarDnd";
import { SidebarSection } from "@/features/sidebar/ui/SidebarSection";
import { CustomChannelSection } from "@/features/sidebar/ui/CustomChannelSection";
import { groupSidebarChannels } from "@/features/sidebar/lib/groupSidebarChannels";

const sections = [
  { id: "work", name: "Work", order: 0 },
  { id: "other", name: "Other", order: 1 },
];
const noop = () => {};
const empty = new Set<string>();

/** Production section/menu/row components under the same canvas gesture owner. */
export function FixtureSectionDragSidebar({
  channels,
  onEvent,
}: {
  channels: Channel[];
  onEvent: (event: Record<string, unknown>) => void;
}) {
  const [assignments, setAssignments] = React.useState<Record<string, string>>(
    {},
  );
  const [collapsed, setCollapsed] = React.useState(new Set<string>());
  const dm = channels.find((channel) => channel.channelType === "dm");
  if (!dm) throw new Error("Missing synthetic existing DM");
  const projection = groupSidebarChannels(
    channels,
    sections,
    assignments,
    undefined,
    () => "alpha",
  );
  const channelLabels = { [dm.id]: "Section DM participant" };
  const dmParticipantsByChannelId = {
    [dm.id]: [
      {
        label: "Section DM participant",
        pubkey: dm.participantPubkeys[0],
        avatarUrl: null,
      },
    ],
  };
  const common = {
    channelLabels,
    dmParticipantsByChannelId,
    presenceByChannelId: { [dm.id]: "online" as const },
    isActiveChannel: false,
    selectedChannelId: null,
    unreadChannelIds: empty,
    sections,
    assignments,
    onSelectChannel: (channelId: string) =>
      onEvent({ type: "navigate", channelId }),
    onMarkChannelRead: noop,
    onMarkChannelUnread: noop,
    onAssignChannel: (channelId: string, sectionId: string) => {
      onEvent({ type: "assign", channelId, sectionId });
      setAssignments((previous) => ({ ...previous, [channelId]: sectionId }));
    },
    onUnassignChannel: (channelId: string) => {
      onEvent({ type: "unassign", channelId });
      setAssignments((previous) => {
        const next = { ...previous };
        delete next[channelId];
        return next;
      });
    },
    onCreateSectionForChannel: noop,
  };
  return (
    <aside
      className="w-72 shrink-0 overflow-y-auto border-r bg-sidebar"
      aria-label="Section integration sidebar"
    >
      <SidebarProvider className="min-h-0">
        <div className="w-full p-2">
          <SidebarDndContext
            channels={channels}
            sectionIds={sections.map((section) => section.id)}
            sections={sections}
            onAssignChannel={common.onAssignChannel}
            onUnassignChannel={common.onUnassignChannel}
            onReorderSections={(ids) => onEvent({ type: "reorder", ids })}
          >
            {projection.groups.map(({ section, channels: grouped }, index) => (
              <div key={section.id} data-section-integration={section.id}>
                <CustomChannelSection
                  {...common}
                  section={section}
                  channels={grouped}
                  hasUnread={false}
                  isCollapsed={collapsed.has(section.id)}
                  isFirst={index === 0}
                  isLast={index === sections.length - 1}
                  onToggleCollapsed={() =>
                    setCollapsed((previous) => {
                      const next = new Set(previous);
                      if (next.has(section.id)) next.delete(section.id);
                      else next.add(section.id);
                      return next;
                    })
                  }
                  onMarkSectionRead={noop}
                  onCreateChannel={noop}
                  onRenameSection={noop}
                  onDeleteSection={noop}
                  onMoveSectionUp={noop}
                  onMoveSectionDown={noop}
                />
              </div>
            ))}
            <SidebarSection
              {...common}
              title="Direct Messages"
              testId="section-integration-dms"
              items={projection.directMessages}
              unreadChannelCounts={new Map()}
              emptyState={<span>No ungrouped DMs</span>}
            />
            <DroppableUngroupedBody>
              <div className="h-20 p-2" data-section-integration-ungrouped>
                Drop to remove section membership
              </div>
            </DroppableUngroupedBody>
          </SidebarDndContext>
        </div>
      </SidebarProvider>
    </aside>
  );
}
