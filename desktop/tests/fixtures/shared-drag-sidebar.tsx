import * as React from "react";
import type { Channel } from "@/shared/api/types";
import {
  SidebarDndContext,
  DraggableChannelRow,
  DroppableSectionBody,
  DroppableUngroupedBody,
  SortableSectionShell,
} from "@/features/sidebar/ui/SidebarDnd";

/** Test shell around production sidebar gesture primitives, with no durable grouping writes. */
export function FixtureDragSidebar({
  channels,
  onEvent,
}: {
  channels: Channel[];
  onEvent: (event: Record<string, unknown>) => void;
}) {
  const [order, setOrder] = React.useState(["first", "second"]);
  const general = channels.find((channel) => channel.name === "general");
  const dm = channels.find((channel) => channel.channelType === "dm");
  const forum = channels.find((channel) => channel.channelType === "forum");
  if (!general || !dm)
    throw new Error("Missing existing synthetic drag conversations");
  const row = (channel: Channel, label: string) => (
    <DraggableChannelRow
      channelId={channel.id}
      label={label}
      allowGrouping={channel.channelType !== "dm"}
    >
      <button
        type="button"
        className="w-full rounded px-2 py-3 text-left hover:bg-sidebar-accent"
        onClick={() => onEvent({ type: "navigate", channelId: channel.id })}
      >
        {label}
      </button>
    </DraggableChannelRow>
  );
  return (
    <aside
      className="w-56 shrink-0 overflow-y-auto border-r bg-sidebar p-3"
      aria-label="Drag fixture sidebar"
    >
      <SidebarDndContext
        channels={channels}
        sectionIds={order}
        sections={order.map((id) => ({ id, name: id }))}
        onAssignChannel={(channelId, sectionId) =>
          onEvent({ type: "assign", channelId, sectionId })
        }
        onUnassignChannel={(channelId) =>
          onEvent({ type: "unassign", channelId })
        }
        onReorderSections={(ids) => {
          onEvent({ type: "reorder", ids });
          setOrder(ids);
        }}
      >
        {row(general, "Drag General")}
        {row(general, "Drag General duplicate row")}
        {row(dm, "Drag existing DM")}
        {forum ? row(forum, "Drag unsupported forum") : null}
        {order.map((id) => (
          <SortableSectionShell key={id} sectionId={id}>
            {({ dragHandleProps }) => (
              <div
                className="my-3 rounded border p-2"
                data-fixture-section={id}
              >
                <button
                  type="button"
                  className="w-full p-2 text-left"
                  {...dragHandleProps}
                >
                  Move {id} group
                </button>
                <DroppableSectionBody sectionId={id}>
                  <div className="h-16 p-2" data-fixture-section-drop={id}>
                    Drop into {id}
                  </div>
                </DroppableSectionBody>
              </div>
            )}
          </SortableSectionShell>
        ))}
        <DroppableUngroupedBody>
          <div className="h-16 border p-2" data-fixture-ungrouped>
            Ungrouped
          </div>
        </DroppableUngroupedBody>
      </SidebarDndContext>
    </aside>
  );
}
