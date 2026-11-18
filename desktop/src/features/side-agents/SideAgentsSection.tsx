import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import type { Channel } from "@/shared/api/types";
import { cn } from "@/shared/lib/cn";
import { useNow } from "@/shared/lib/useNow";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
} from "@/shared/ui/sidebar";
import { presentSideAgents, type SideAgent } from "./model";
import { useSideAgentReports } from "./useSideAgentReports";

const STATUS = {
  waiting: { label: "Waiting", color: "bg-amber-500" },
  working: { label: "Working", color: "bg-blue-500" },
  seen: { label: "Seen", color: "bg-muted-foreground" },
  stale: { label: "Stale", color: "bg-muted-foreground" },
  done: { label: "Done", color: "bg-emerald-500" },
  noted: { label: "Noted", color: "bg-muted-foreground" },
} as const;

function reportAge(age: number) {
  if (age < 60) return "just now";
  if (age < 3600) return `${Math.floor(age / 60)}m ago`;
  if (age < 86400) return `${Math.floor(age / 3600)}h ago`;
  return `${Math.floor(age / 86400)}d ago`;
}

type CollapseProps = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

/** Reports from already-loaded conversations, rendered as sidebar navigation. */
export function SideAgentsSection({
  reports,
  now,
  collapsed,
  onToggleCollapsed,
  onOpenThread,
  onOpenPaseo,
}: CollapseProps & {
  reports: SideAgent[];
  now: number;
  onOpenThread: (agent: SideAgent) => void;
  onOpenPaseo: (link: string) => void;
}) {
  const contentId = React.useId();
  const [showOlder, setShowOlder] = React.useState(false);
  const { visible, hasOlder } = presentSideAgents(reports, now, showOlder);
  if (!visible.length && !hasOlder) return null;
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel asChild>
        <button
          aria-controls={contentId}
          aria-expanded={!collapsed}
          className="w-fit cursor-pointer gap-1 hover:text-sidebar-foreground"
          type="button"
          onClick={onToggleCollapsed}
        >
          <span data-sidebar-section-title>Side agents</span>
          <ChevronDown
            aria-hidden
            className={cn("size-3", collapsed && "-rotate-90")}
          />
        </button>
      </SidebarGroupLabel>
      <SidebarGroupContent id={contentId} hidden={collapsed}>
        <SidebarMenu>
          {visible.map((agent) => {
            const status = STATUS[agent.state];
            const report = `Reported by ${agent.source} · ${reportAge(now - agent.reportedAt)}`;
            const thread = [agent.channelName, agent.threadTitle]
              .filter(Boolean)
              .join(" · ");
            const link = agent.paseoLink;
            return (
              <SidebarMenuItem
                className="flex items-center gap-0.5"
                key={agent.agentId}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-start gap-2 rounded-md px-2 py-1.5 text-left text-sidebar-foreground hover:bg-sidebar-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                  title={thread}
                  onClick={() => onOpenThread(agent)}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      status.color,
                    )}
                  />
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate text-sm font-medium">
                      {agent.title}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {thread}
                    </span>
                    <span
                      className="truncate text-xs text-muted-foreground"
                      title={report}
                    >
                      {status.label} · {report}
                    </span>
                  </span>
                  {agent.host ? (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {agent.host}
                    </span>
                  ) : null}
                </button>
                {link ? (
                  <button
                    aria-label={`Open ${agent.title} in Paseo`}
                    className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-sidebar-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sidebar-ring md:opacity-0 md:group-focus-within/menu-item:opacity-100 md:group-hover/menu-item:opacity-100"
                    title="Open in Paseo"
                    type="button"
                    onClick={() => onOpenPaseo(link)}
                  >
                    <ArrowUpRight aria-hidden className="size-4" />
                  </button>
                ) : null}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
        {hasOlder ? (
          <button
            type="button"
            className="rounded px-2 py-1 text-xs text-muted-foreground hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            onClick={() => setShowOlder((previous) => !previous)}
          >
            {showOlder ? "Hide older" : "Show older"}
          </button>
        ) : null}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/** Bind report actions to the normal guarded app routes and PR81 opener. */
export function SideAgentsSidebar({
  channels,
  ...collapse
}: CollapseProps & { channels: Channel[] }) {
  const reports = useSideAgentReports(channels);
  const now = useNow(30_000) / 1000;
  const { goChannel, goForumPost } = useAppNavigation();
  return (
    <SideAgentsSection
      reports={reports}
      now={now}
      {...collapse}
      onOpenThread={(agent) => {
        const task =
          agent.channelType === "forum"
            ? goForumPost(agent.channelId, agent.rootId, {
                replyId: agent.cardId,
                revealThread: true,
              })
            : goChannel(agent.channelId, {
                thread: agent.rootId,
                threadRootId: agent.rootId,
                messageId: agent.cardId,
                revealThread: true,
              });
        void task.catch(() => toast.error("Failed to open the thread"));
      }}
      onOpenPaseo={(link) => {
        void openUrl(link).catch(() => toast.error("Failed to open Paseo"));
      }}
    />
  );
}
