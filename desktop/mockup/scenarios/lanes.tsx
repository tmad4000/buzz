import { type ReactNode, useState, useSyncExternalStore } from "react";
import {
  CircleCheck,
  CircleHelp,
  Columns3,
  Ellipsis,
  Hourglass,
  Maximize2,
  Minimize2,
  Search,
  ThumbsUp,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Input } from "@/shared/ui/input";
import { CHANNEL, JACOB, SOL, channels, eventId, message } from "../fixtures";
import { waitFor } from "../presentation";
import type { Scenario } from "../runtime";

type Lane = {
  id: string;
  name: string;
  short?: string;
  desc: string;
  hue: number;
};
type Card = {
  i: number;
  time: string;
  body: string;
  lane: string;
  thread: string;
  thread_title: string;
  is_root: boolean;
  glyph: string;
  glyph_at?: string;
  conf: string;
  also: string[];
  replies: { at: string; body: string }[];
};
type Board = { lanes: Lane[]; messages: Card[] };

const privateFixtures = import.meta.glob<Board>("../private/lanes.json", {
  eager: true,
  import: "default",
});
const sampleLanes = [
  {
    id: "routing",
    name: "Buzz · send to thread",
    desc: "Routing, hover preview and thread association",
    hue: 238,
  },
  {
    id: "inbox",
    name: "Buzz · inbox, views & client",
    desc: "Inbox, activity order and profile surfaces",
    hue: 167,
  },
  {
    id: "ops",
    name: "Agent ops & stalls",
    desc: "Queueing, steering and stale work",
    hue: 32,
  },
  {
    id: "unassigned",
    name: "Unassigned / meta",
    desc: "Messages without a lane",
    hue: 0,
  },
];
const sample: Board = {
  lanes: sampleLanes,
  messages: sampleLanes.map(({ id, name }, i) => ({
    i: i + 1,
    time: `19:${40 + i}`,
    body: `Capture the next decision for ${name} in today's review.`,
    lane: id,
    thread: `T${i + 1}`,
    thread_title: name,
    is_root: true,
    glyph: i === 0 ? "❓" : "⏳",
    conf: "high",
    also: [],
    replies: [{ at: "19:54", body: "The fixture thread is ready for review." }],
  })),
};
const board = privateFixtures["../private/lanes.json"] ?? sample;
const laneById = new Map(board.lanes.map((lane) => [lane.id, lane]));
const roots = new Map(
  board.messages
    .filter((card) => card.is_root)
    .map((card) => [card.thread, card.i]),
);
const cardId = (i: number) => eventId(1000 + i);
const statusNames: Record<string, string> = {
  "❓": "Needs me",
  "⏳": "Working",
  "✅": "Done",
  "👍": "Acknowledged",
};
const statusIcons = {
  "❓": CircleHelp,
  "⏳": Hourglass,
  "✅": CircleCheck,
  "👍": ThumbsUp,
} as const;

function LaneStatus({ glyph, time }: { glyph: string; time?: string }) {
  const Icon = statusIcons[glyph as keyof typeof statusIcons];
  if (!Icon) return null;
  const label = time ? `${statusNames[glyph]} · ${time}` : statusNames[glyph];
  return (
    <span
      title={label}
      aria-label={label}
      role="img"
      className="inline-flex items-center text-muted-foreground"
    >
      <Icon className="size-3.5" aria-hidden />
    </span>
  );
}

const storageKey = "buzz.mockup.lanes.moves.v1";

let lanesVisible = true;
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function useLanesVisible() {
  return useSyncExternalStore(subscribe, () => lanesVisible);
}
function showLanes(value: boolean) {
  lanesVisible = value;
  for (const listener of listeners) listener();
}

function ViewSwitch() {
  const active = useLanesVisible();
  return (
    <fieldset
      className="flex shrink-0 items-center gap-1"
      aria-label="Channel view"
    >
      <Button
        size="sm"
        variant={!active ? "secondary" : "ghost"}
        aria-pressed={!active}
        onClick={() => showLanes(false)}
      >
        Timeline
      </Button>
      <Button
        size="sm"
        variant={active ? "secondary" : "ghost"}
        aria-pressed={active}
        onClick={() => showLanes(true)}
      >
        <Columns3 /> Lanes
      </Button>
    </fieldset>
  );
}

function readMoves(): Record<string, string> {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    return Object.fromEntries(
      Object.entries(data).filter(([, lane]) => laneById.has(lane)),
    );
  } catch {
    return {};
  }
}

function LaneCard({
  card,
  lane,
  rootLane,
  threadCount,
  laneCount,
  moved,
  onMove,
  openThread,
  wide,
}: {
  card: Card;
  lane: Lane;
  rootLane?: string;
  threadCount: number;
  laneCount: number;
  moved: boolean;
  onMove: (id: string) => void;
  openThread: (id: string) => void;
  wide: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [replies, setReplies] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const root = roots.get(card.thread);
  return (
    <article
      draggable
      aria-label={`${card.time} · ${card.thread} · ${lane.name}`}
      className={`relative rounded-lg border bg-card p-3 focus-visible:outline-2 focus-visible:outline-ring ${card.conf !== "high" && !moved ? "border-dashed" : ""}`}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", String(card.i));
        event.dataTransfer.effectAllowed = "move";
      }}
    >
      <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">tmad4000</span>
        <time>{card.time}</time>
        <LaneStatus glyph={card.glyph} />
        {root !== undefined && (
          <Button
            variant="ghost"
            size="xs"
            className={
              card.is_root || rootLane === lane.id
                ? ""
                : "text-amber-600 dark:text-amber-400"
            }
            onClick={() => openThread(cardId(root))}
            title={
              laneById.get(rootLane ?? "")?.name
                ? `${card.thread_title} · ${laneById.get(rootLane ?? "")?.name}`
                : card.thread_title
            }
          >
            {card.thread}
            {card.is_root ? "*" : ""}
          </Button>
        )}
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              className="ml-auto"
              variant="ghost"
              size="icon-xs"
              aria-label="Move to lane"
            >
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {board.lanes.map((target) => (
              <DropdownMenuItem
                key={target.id}
                disabled={lane.id === target.id}
                onSelect={() => onMove(target.id)}
              >
                {target.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <button
        type="button"
        aria-expanded={expanded || wide}
        className="block w-full break-words text-left text-sm"
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(event) => {
          if (event.key === "m") setMenuOpen(true);
          if (event.key === "r" && card.replies.length) setReplies(!replies);
        }}
      >
        <span
          className={wide || expanded ? "whitespace-pre-wrap" : "line-clamp-3"}
        >
          {card.body}
        </span>
      </button>
      <div className="mt-2 flex flex-wrap gap-1">
        {card.is_root && (
          <span className="buzz-mockup-chip">
            {card.thread} · {threadCount} {threadCount === 1 ? "msg" : "msgs"} ·{" "}
            {laneCount} {laneCount === 1 ? "lane" : "lanes"}
          </span>
        )}
        {card.also
          .filter((id) => id !== lane.id)
          .map((id) => (
            <span key={id} className="buzz-mockup-chip">
              also: {laneById.get(id)?.short ?? laneById.get(id)?.name ?? id}
            </span>
          ))}
        {moved && <span className="buzz-mockup-chip">moved by you</span>}
        {!moved && card.conf !== "high" && (
          <span className="buzz-mockup-chip">
            {card.conf === "low" ? "guess" : "inferred"}
          </span>
        )}
      </div>
      {card.replies.length > 0 && (
        <>
          <button
            type="button"
            className="mt-2 block text-left text-xs text-muted-foreground hover:text-foreground"
            aria-expanded={replies}
            onClick={() => setReplies(!replies)}
          >
            {replies ? "▾" : "▸"} {card.replies.length}{" "}
            {card.replies.length === 1 ? "reply" : "replies"} from root · latest{" "}
            {card.replies.at(-1)?.at}
          </button>
          {replies && (
            <div className="mt-2 space-y-2 border-l pl-2">
              {card.replies.map((reply) => (
                <p
                  key={`${reply.at}-${reply.body}`}
                  className="break-words text-xs"
                >
                  <span className="text-muted-foreground">{reply.at} · </span>
                  {reply.body}
                </p>
              ))}
            </div>
          )}
        </>
      )}
    </article>
  );
}

function Lanes({
  children,
  openThread,
}: {
  children: ReactNode;
  openThread: (id: string) => void;
}) {
  const [moves, setMoves] = useState(readMoves);
  const [undo, setUndo] = useState<{
    previous: Record<string, string>;
    label: string;
  } | null>(null);
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [wide, setWide] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const active = useLanesVisible();

  function persist(next: Record<string, string>) {
    setMoves(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  }
  function move(i: number, target: string) {
    const card = board.messages.find((item) => item.i === i);
    if (!card || (moves[i] ?? card.lane) === target) return;
    setUndo({
      previous: moves,
      label: `Moved to ${laneById.get(target)?.name}`,
    });
    persist({ ...moves, [i]: target });
  }
  if (!active) return children;
  const assigned = board.messages.map((card) => ({
    ...card,
    lane: moves[card.i] ?? card.lane,
    also:
      moves[card.i] && card.also.includes(moves[card.i])
        ? [...card.also.filter((id) => id !== moves[card.i]), card.lane]
        : card.also,
  }));
  const query = search.trim().toLowerCase();
  return (
    <div
      data-testid="mockup-lanes"
      className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-background pt-[var(--buzz-channel-content-top-padding,3.25rem)]"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2">
        {["All", "Needs me", "Working", "Done"].map((name) => (
          <Button
            key={name}
            variant={filter === name ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={filter === name}
            onClick={() => setFilter(name)}
          >
            {name}
          </Button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Search className="size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search lanes"
            placeholder="Search lanes"
            className="h-8 w-36"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!Object.keys(moves).length}
          onClick={() => {
            setUndo({ previous: moves, label: "Moves reset" });
            persist({});
          }}
        >
          Reset moves
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3">
        {board.lanes.map((lane) => {
          const members = assigned.filter((card) => card.lane === lane.id);
          const latest = members
            .filter((card) => card.glyph)
            .sort((a, b) =>
              (b.glyph_at ?? b.time).localeCompare(a.glyph_at ?? a.time),
            )[0];
          const visible = members.filter(
            (card) =>
              (filter === "All" || statusNames[card.glyph] === filter) &&
              (!query ||
                `${card.body} ${card.thread_title}`
                  .toLowerCase()
                  .includes(query)),
          );
          return (
            <section
              key={lane.id}
              aria-label={lane.name}
              className={`flex shrink-0 flex-col overflow-hidden rounded-xl border bg-muted/30 ${wide === lane.id ? "w-[37.5rem]" : "w-[18.75rem]"} ${lane.id === "unassigned" ? "border-dashed" : ""} ${over === lane.id ? "ring-2 ring-primary" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setOver(lane.id);
              }}
              onDragLeave={(event) => {
                if (
                  !event.currentTarget.contains(
                    event.relatedTarget as Node | null,
                  )
                )
                  setOver(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setOver(null);
                move(Number(event.dataTransfer.getData("text/plain")), lane.id);
              }}
            >
              <header className="shrink-0 space-y-1 border-b bg-background p-3">
                <div className="flex items-center gap-2">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: `hsl(${lane.hue} 57% 49%)` }}
                  />
                  <h2
                    className="truncate text-sm font-semibold"
                    title={lane.name}
                  >
                    {lane.name}
                  </h2>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {members.length}
                  </span>
                  {latest && (
                    <LaneStatus
                      glyph={latest.glyph}
                      time={latest.glyph_at ?? latest.time}
                    />
                  )}
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={wide === lane.id ? "Narrow lane" : "Widen lane"}
                    onClick={() => setWide(wide === lane.id ? null : lane.id)}
                  >
                    {wide === lane.id ? <Minimize2 /> : <Maximize2 />}
                  </Button>
                </div>
                <p className="line-clamp-2 min-h-8 text-xs text-muted-foreground">
                  {lane.desc}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Set(members.map((card) => card.thread)).size} threads{" "}
                  {members.length
                    ? `· ${members[0]?.time}–${members.at(-1)?.time}`
                    : ""}
                </p>
              </header>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                {visible.map((card) => {
                  const inThread = assigned.filter(
                    (item) => item.thread === card.thread,
                  );
                  return (
                    <LaneCard
                      key={card.i}
                      card={card}
                      lane={lane}
                      rootLane={inThread.find((item) => item.is_root)?.lane}
                      threadCount={inThread.length}
                      laneCount={
                        new Set(inThread.map((item) => item.lane)).size
                      }
                      moved={Boolean(moves[card.i])}
                      onMove={(target) => move(card.i, target)}
                      openThread={openThread}
                      wide={wide === lane.id}
                    />
                  );
                })}
                {!visible.length && (
                  <p className="p-2 text-xs text-muted-foreground">
                    No matching messages.
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
      {undo && (
        <div
          role="status"
          className="absolute right-5 bottom-5 flex items-center gap-3 rounded-lg border bg-popover p-2 pl-3 text-sm shadow-lg"
        >
          {undo.label}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              persist(undo.previous);
              setUndo(null);
            }}
          >
            Undo
          </Button>
        </div>
      )}
    </div>
  );
}

export default {
  title: "Lanes",
  channels,
  messages: {
    [CHANNEL]: board.messages.flatMap((card, index) => {
      const parent = roots.get(card.thread);
      const age = (board.messages.length - index) * 2;
      return [
        message(1000 + card.i, JACOB, card.body, age, {
          root:
            card.is_root || parent === undefined ? undefined : 1000 + parent,
        }),
        ...card.replies.map((reply, i) =>
          message(2000 + card.i * 10 + i, SOL, reply.body, age - 1, {
            root: parent === undefined ? 1000 + card.i : 1000 + parent,
          }),
        ),
      ];
    }),
  },
  slots: { channelHeader: ViewSwitch, timeline: Lanes },
  async prepare() {
    await waitFor('[data-testid="mockup-lanes"]');
  },
} satisfies Scenario;
