import type { ReactNode } from "react";
import type { SidebarSectionGroup } from "../lib/groupSidebarChannels";
import type { ChannelSection } from "../lib/channelSectionsStorage";

/** Additive list composition inside the owning sidebar's shared drag context. */
export function SidebarSections({
  groups,
  renderSection,
  children,
}: {
  groups: SidebarSectionGroup[];
  renderSection: (section: ChannelSection, index: number) => ReactNode;
  children: ReactNode;
}) {
  // No drag provider, handlers, row IDs, or navigation state belong here.
  return (
    <>
      {groups.map(({ section }, index) => renderSection(section, index))}
      {children}
    </>
  );
}
