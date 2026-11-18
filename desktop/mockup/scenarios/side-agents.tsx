import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  Maximize2,
  Minimize2,
  PanelLeftClose,
} from "lucide-react";
import {
  PAGE_ANCHOR,
  PAGE_KIND,
  PAGE_SLOT,
} from "@/features/channel-page/model";
import { Button } from "@/shared/ui/button";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/shared/ui/sidebar";
import { JACOB, SIDE, SOL, channels, eventId, message } from "../fixtures";
import { openThread, waitFor } from "../presentation";
import type { Scenario } from "../runtime";

const thread = eventId(31);
const roster = [
  {
    title: "Astra: Inbox decisions",
    topic: "Review the options for the Inbox",
    age: "4m",
    host: "GCP",
    status: "Needs you",
    color: "bg-destructive",
  },
  {
    title: "Sol: PR90 takeover evidence",
    topic: "Finish the offline review",
    age: "6m",
    host: "M4",
    status: "Blocked",
    color: "bg-amber-500",
  },
  {
    title: "Fable: Side agents + Page v2 design",
    topic: "Side agents + Page v2",
    age: "3m",
    host: "GCP",
    status: "Running",
    color: "bg-blue-500",
  },
  {
    title: "Fable: Orchestrator chat skill",
    topic: "Distill an orchestrator chat skill",
    age: "41m",
    host: "GCP",
    status: "Idle",
    color: "bg-muted-foreground",
  },
  {
    title: "Sol: PR88 rebase + publish",
    topic: "Rebase PR88 on the .9 base",
    age: "2h",
    host: "GCP",
    status: "Done",
    color: "text-green-600",
  },
];

function SideAgents() {
  const [open, setOpen] = useState(true);
  return (
    <SidebarGroup data-testid="mockup-side-agents">
      <SidebarGroupLabel asChild>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="gap-1.5"
        >
          {open ? <ChevronDown /> : <ChevronRight />} Side agents
          <span className="ml-auto text-xs text-muted-foreground">
            1 needs you
          </span>
        </button>
      </SidebarGroupLabel>
      {open && (
        <SidebarGroupContent>
          <ul className="space-y-1">
            {roster.map((item, index) => (
              <li key={item.title}>
                <button
                  type="button"
                  className="w-full rounded-md px-2 py-1.5 text-left hover:bg-sidebar-accent"
                  onClick={() =>
                    void openThread(
                      SIDE,
                      index === 2 ? thread : eventId(35 + index),
                    )
                  }
                >
                  <span className="flex items-center gap-1.5 text-xs">
                    {item.status === "Done" ? (
                      <Check className={`size-3 shrink-0 ${item.color}`} />
                    ) : (
                      <span
                        title={item.status}
                        className={`size-1.5 shrink-0 rounded-full ${item.color}`}
                      />
                    )}
                    <span className="truncate" title={item.title}>
                      {item.title}
                    </span>
                    <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                      {item.age}
                    </span>
                  </span>
                  <span className="mt-1 flex min-w-0 items-center gap-1 pl-3 text-xs text-muted-foreground">
                    <span className="min-w-0 truncate">
                      ↳ #paseo-later · {item.topic}
                    </span>
                    <span className="ml-auto shrink-0 rounded border px-1 text-2xs">
                      {item.host}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  );
}

const headings = [
  ["start", "Side agents + Page v2", 1],
  ["quick", "0. Quick wins", 2],
  ["agents", "A. Side agents", 2],
  ["name", "A1 Name", 3],
  ["rows", "A3 Row anatomy", 3],
  ["pages", "B. Page view v2", 2],
  ["height", "B1 Half-height fix", 3],
  ["browser", "B3 Open in browser", 3],
  ["thread-page", "B4 Thread pages", 3],
  ["effort", "C. Effort", 2],
  ["decisions", "D. Decisions", 2],
] as const;

const dark = new URLSearchParams(location.search).get("theme") === "dark";
const html = `<!doctype html><html><body><style>
  :root{color-scheme:${dark ? "dark" : "light"};font:15px/1.65 system-ui,sans-serif;color:${dark ? "#e8e8ea" : "#232327"};background:${dark ? "#171719" : "#fff"}}
  body{margin:0}main{max-width:820px;padding:28px 36px 50px;margin:0 auto}h1{font-size:28px;line-height:1.2;margin:0}h2{font-size:19px;margin-top:32px}h3{font-size:15px;margin-bottom:4px}p{margin:8px 0 14px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid ${dark ? "#39393e" : "#e2e2e7"};padding:7px 12px;text-align:left}
</style><main>
<h1 id="start">Side agents + Page v2</h1><p>Design and rollout plan · Fable · Nov 18, 2026</p>
<h2 id="quick">0. Quick wins</h2><table><thead><tr><th>#</th><th>Item</th><th>Effort</th></tr></thead><tbody>
<tr><td>Q1</td><td>Page half-height fix</td><td>0.5 h</td></tr>
<tr><td>Q2</td><td>Expand toggle</td><td>2 h</td></tr>
<tr><td>Q3</td><td>Side agents v0 from status cards</td><td>4 h</td></tr>
<tr><td>Q4</td><td>Collapsible table of contents</td><td>3 h</td></tr>
</tbody></table>
<h2 id="agents">A. Side agents</h2>
<h3 id="name">A1 Name</h3><p>Side agents parallels Direct agents and describes temporary workers attached to a thread.</p>
<h3 id="rows">A3 Row anatomy</h3><p>Status dot, title, parent thread, last update, host and thread actions.</p>
<h2 id="pages">B. Page view v2</h2>
<h3 id="height">B1 Half-height fix</h3><p>The Page document fills the available height in the conversation pane.</p>
<h3 id="browser">B3 Open in browser</h3><p>Export a sanitized snapshot to the app cache and open the local file.</p>
<h3 id="thread-page">B4 Thread pages</h3><p>Give each thread its own Page with a breadcrumb back to the channel Page.</p>
<h2 id="effort">C. Effort</h2><p>Start with the layout fix, expand toggle, sidebar rows, and contents rail.</p>
<h2 id="decisions">D. Decisions</h2><p>Expand in the conversation area and keep the sidebar visible.</p>
</main></body></html>`;
const publication = "10000000-0000-4000-8000-000000000033";
const chunk = eventId(301);
const channel = SIDE;
const page = [
  message(
    300,
    JACOB,
    JSON.stringify({
      type: "buzz.page",
      version: 1,
      page: "page",
      publication,
      chunks: [chunk],
      bytes: new TextEncoder().encode(html).length,
    }),
    3,
    {
      channel,
      kind: PAGE_KIND,
      tags: [
        ["d", PAGE_SLOT],
        ["e", PAGE_ANCHOR],
      ],
    },
  ),
  message(
    301,
    JACOB,
    JSON.stringify({
      type: "buzz.page.chunk",
      version: 1,
      page: "page",
      publication,
      index: 0,
      html,
    }),
    3,
    {
      channel,
      kind: PAGE_KIND,
      tags: [["d", `buzz-page:chunk:${publication}:0`]],
    },
  ),
];

function PageActions() {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && expanded) setExpanded(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [expanded]);
  return (
    <>
      <span data-mockup-page-expanded={expanded} />
      <span className="order-first text-xs text-muted-foreground">
        #paseo-later › Side agents + Page v2 › Page
      </span>
      <Button
        data-testid="mockup-expand-page"
        size="sm"
        variant="outline"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <Minimize2 /> : <Maximize2 />}{" "}
        {expanded ? "Restore" : "Expand"}
      </Button>
    </>
  );
}

function Contents({ scroll }: { scroll: (id: string) => void }) {
  const [open, setOpen] = useState(true);
  const [selected, setSelected] = useState("start");
  return (
    <nav
      aria-label="Page table of contents"
      className="min-h-0 shrink-0 overflow-y-auto border-r p-2"
    >
      <Button
        aria-expanded={open}
        variant="ghost"
        size="sm"
        onClick={() => setOpen(!open)}
        aria-label={open ? "Collapse contents" : "Show contents"}
      >
        <PanelLeftClose /> {open && "Contents"}
      </Button>
      {open && (
        <ul className="w-40 xl:w-48">
          {headings.map(([id, label, level]) => (
            <li key={id}>
              <button
                type="button"
                aria-current={selected === id ? "location" : undefined}
                className={`block w-full rounded-md py-1.5 pr-2 text-left text-xs hover:bg-accent aria-[current=location]:bg-accent ${level === 3 ? "pl-6 text-muted-foreground" : "pl-2"}`}
                onClick={() => {
                  setSelected(id);
                  scroll(id);
                }}
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}

function Association({ id }: { id: string }) {
  return id === eventId(34) ? (
    <span className="buzz-mockup-chip mt-1">
      written in #paseo-later main · associated by Jacob
    </span>
  ) : null;
}

function AgentStrip() {
  return (
    <div className="flex items-center gap-2 border-b bg-background px-4 py-2 text-xs">
      <span className="size-2 rounded-full bg-blue-500" />
      <strong>Fable: Side agents + Page v2 design</strong>
      <span className="buzz-mockup-chip">GCP</span>
      <span className="text-muted-foreground">Running · 3m</span>
      <ArrowUpRight
        className="ml-auto size-3 text-muted-foreground"
        aria-hidden
      />
    </div>
  );
}

export default {
  title: "Side agents + Page v2",
  route: `/channels/${SIDE}?thread=${thread}`,
  channels,
  messages: {
    [SIDE]: [
      message(
        31,
        JACOB,
        "We should make another section in the left-hand sidebar called Side agents. It would be collapsible, and a row could mirror the thread the agent is working on.",
        48,
        { channel },
      ),
      message(
        32,
        SOL,
        "Fable is working on the sidebar section and Page v2.",
        45,
        { channel, root: 31 },
      ),
      message(
        33,
        SOL,
        "The half-height cause is confirmed. The design includes a full-height document, an expand toggle, and a table of contents.",
        22,
        { channel, root: 31 },
      ),
      message(
        34,
        JACOB,
        "Every thread should probably get its own page, with a breadcrumb back up to the channel page.",
        16,
        { channel, root: 31 },
      ),
      ...roster.flatMap((item, index) =>
        index === 2
          ? []
          : [message(35 + index, SOL, item.topic, 32 - index, { channel })],
      ),
    ],
  },
  page,
  slots: {
    sidebar: SideAgents,
    pageActions: PageActions,
    pageContents: Contents,
    message: Association,
    thread: AgentStrip,
  },
  async prepare(view) {
    await waitFor('[data-testid="message-thread-panel"]');
    if (view === "association") return;
    (await waitFor('[data-testid="mockup-page-toggle"]')).click();
    await waitFor('iframe[title="Channel Page HTML"]');
    if (view !== "docked")
      (await waitFor('[data-testid="mockup-expand-page"]')).click();
  },
} satisfies Scenario;
