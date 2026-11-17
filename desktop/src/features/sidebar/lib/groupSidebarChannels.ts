import type { Channel } from "@/shared/api/types";
import type { ChannelSection } from "./channelSectionsStorage";
import {
  sectionSortGroupKey,
  sortChannelsForSidebar,
  type ChannelSortGroupKey,
  type ChannelSortMode,
} from "./channelSortPreference";

export type SidebarSectionGroup = {
  section: ChannelSection;
  channels: Channel[];
};

/** Projects membership without changing channel identity, metadata, or preferences. */
export function groupSidebarChannels(
  channels: readonly Channel[],
  sections: readonly ChannelSection[],
  assignments: Readonly<Record<string, string>>,
  _starredChannelIds: ReadonlySet<string> | undefined,
  sortModeFor: (group: ChannelSortGroupKey) => ChannelSortMode,
): {
  groups: SidebarSectionGroup[];
  bySection: Record<string, Channel[]>;
  unassigned: Channel[];
  directMessages: Channel[];
} {
  const bySection: Record<string, Channel[]> = Object.create(null);
  const unassigned: Channel[] = [];
  const directMessages: Channel[] = [];
  const sectionIds = new Set(sections.map((section) => section.id));
  for (const channel of channels) {
    if (channel.channelType !== "stream" && channel.channelType !== "dm")
      continue;
    const sectionId = assignments[channel.id];
    if (sectionId && sectionIds.has(sectionId)) {
      bySection[sectionId] ??= [];
      bySection[sectionId].push(channel);
    } else if (channel.channelType === "dm") directMessages.push(channel);
    else unassigned.push(channel);
  }
  const ordered = [...sections].sort(
    (a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const groups = ordered.map((section) => {
    const items = sortChannelsForSidebar(
      bySection[section.id] ?? [],
      sortModeFor(sectionSortGroupKey(section.id)),
    );
    bySection[section.id] = items;
    return { section, channels: items };
  });
  return {
    groups,
    bySection,
    unassigned: sortChannelsForSidebar(unassigned, sortModeFor("channels")),
    directMessages,
  };
}
