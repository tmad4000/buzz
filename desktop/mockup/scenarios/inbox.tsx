import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Bell, ChevronDown, Plus } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Input } from "@/shared/ui/input";
import type { InboxItem } from "@/features/home/lib/inbox";
import { matchesInboxFilter } from "@/features/home/lib/inboxViewHelpers";
import {
  CHANNEL,
  JACOB,
  NORA,
  SOL,
  channels,
  eventId,
  message,
} from "../fixtures";
import { waitFor } from "../presentation";
import {
  setMockupInboxFilter,
  useMockupInboxFilter,
  type Scenario,
} from "../runtime";

const events = [
  message(51, JACOB, "Pin opens discard an in-progress edit", 95),
  message(
    52,
    SOL,
    "Two options: honour the leave guard, or preserve the edit across the jump. Which should we ship?",
    4,
    { root: 51 },
  ),
  message(
    53,
    SOL,
    "Approve release .9 cut. A workflow is waiting for approval.",
    16,
  ),
  message(54, JACOB, "Latest activity order: hold stable while reading", 82),
  message(
    55,
    SOL,
    "Done: stable identity through the membership gate. The checks cover acknowledgement overlap.",
    23,
    { root: 54 },
  ),
  message(
    56,
    NORA,
    "Which relay for the pair sidecar? Staging or the new one?",
    31,
    { tags: [["p", JACOB]] },
  ),
  message(57, JACOB, "Mobile unread dot regression", 85),
  message(
    58,
    SOL,
    "Reproduced on simulator. The cause is in the channel read fold.",
    42,
    { root: 57 },
  ),
  message(61, JACOB, "Agent response overdue · 2h", 92),
  message(62, SOL, "Watchdog reported this agent overdue.", 67, { root: 61 }),
];
const status = new Map([
  [eventId(52), "Reported waiting"],
  [eventId(55), "Reported done"],
  [eventId(62), "Reported overdue"],
]);
const feedIds: Record<number, "activity" | "needs_action" | "mention"> = {
  52: "activity",
  53: "needs_action",
  55: "activity",
  56: "mention",
  58: "activity",
  62: "activity",
};
const choices = [
  "All",
  "Needs you",
  "Answers",
  "Projects",
  "Mentions",
  "Threads",
  "Needs action",
  "Agents",
  "Mine",
  "Drafts",
];

type Entry = {
  id: number;
  title: string;
  assignee?: string;
  target?: string;
  due?: string;
  done?: boolean;
  snoozed?: boolean;
};
let entries: Entry[] = [
  { id: 1, title: "Test build .9 on M5", due: "Today, 18:00" },
  { id: 2, title: "Read the attention model addendum", target: "#design" },
];
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function saveEntries(next: Entry[]) {
  entries = next;
  for (const listener of listeners) listener();
}
function useEntries() {
  return useSyncExternalStore(subscribe, () => entries);
}

function matches(item: InboxItem, filter: string, done: boolean) {
  switch (filter) {
    case "Needs you":
      return (
        status.get(item.id) === "Reported waiting" ||
        item.isActionRequired ||
        (item.categories.includes("mention") && !done)
      );
    case "Answers":
      return status.get(item.id) === "Reported done" && !done;
    case "Projects":
      return matchesInboxFilter(item, "project");
    case "Mentions":
      return item.categories.includes("mention");
    case "Threads":
      return matchesInboxFilter(item, "thread");
    case "Needs action":
      return item.isActionRequired;
    case "Agents":
      return item.item.pubkey === SOL;
    case "Mine":
    case "Drafts":
      return false;
    default:
      return true;
  }
}

function Filter({
  items,
  doneSet,
  onSelect,
}: {
  items: InboxItem[];
  doneSet: ReadonlySet<string>;
  onSelect: (id: string) => void;
}) {
  const filter = useMockupInboxFilter();
  const mine = useEntries().filter((entry) => !entry.done && !entry.snoozed);
  const entryCount =
    filter === "All" || filter === "Mine" || filter === "Needs you";
  const countEntries = (option: string) =>
    option === "All" || option === "Mine"
      ? mine.length
      : option === "Needs you"
        ? mine.filter((entry) => entry.due === "Today, 18:00").length
        : 0;
  const count = (option: string) =>
    items.filter((item) => matches(item, option, doneSet.has(item.id))).length +
    countEntries(option);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          data-testid="mockup-inbox-filter"
          title="Counts cover loaded Inbox rows"
        >
          {filter}{" "}
          <span className="text-muted-foreground">
            {items.filter((item) => matches(item, filter, doneSet.has(item.id)))
              .length + (entryCount ? countEntries(filter) : 0)}
          </span>
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {choices.map((option) => {
          const total = count(option);
          return (
            <div key={option} role="presentation">
              {(option === "Projects" || option === "Mine") && (
                <DropdownMenuSeparator />
              )}
              <DropdownMenuItem
                aria-current={filter === option ? "true" : undefined}
                onSelect={() => {
                  setMockupInboxFilter(option);
                  const first = items.find((item) =>
                    matches(item, option, doneSet.has(item.id)),
                  );
                  if (
                    option !== "Answers" &&
                    first &&
                    !items.some(
                      (item) =>
                        item.id === first.id &&
                        item.conversationId === first.conversationId &&
                        doneSet.has(item.id),
                    )
                  )
                    onSelect(first.id);
                }}
              >
                {option}
                <span className="ml-auto tabular-nums text-muted-foreground">
                  {total || (filter === option ? 0 : "")}
                </span>
              </DropdownMenuItem>
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function QuickAdd() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() =>
    new URLSearchParams(location.search).get("view") === "quick-add"
      ? "Fix the pin-edit guard @Sol #PR70 due Fri 9am"
      : "",
  );
  const [delegate, setDelegate] = useState<Entry | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (
        event.key === "n" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !(
          event.target instanceof Element &&
          event.target.closest("input,textarea,[contenteditable=true]")
        )
      ) {
        event.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, []);
  const assignee = text.match(/(?:^|\s)@(Sol|nora)(?=\s|$)/i)?.[1];
  const target = text.match(/(?:^|\s)(#[\w-]+)(?=\s|$)/)?.[1];
  const due = text.match(/\sdue (.+)$/i)?.[1];
  const title = text
    .replace(/\s*@(?:Sol|nora)(?=\s|$)/i, "")
    .replace(/\s*#[\w-]+(?=\s|$)/, "")
    .replace(/\sdue .+$/i, "")
    .trim();
  function save(assign = false) {
    if (!title) return;
    const entry = {
      id: (entries.at(-1)?.id ?? 0) + 1,
      title,
      assignee,
      target,
      due,
    };
    saveEntries([...entries, entry]);
    setText("");
    setOpen(false);
    if (assign && assignee) setDelegate(entry);
  }
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="mr-2"
        data-testid="mockup-inbox-new"
        onClick={() => setOpen(true)}
      >
        <Plus /> New
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Inbox entry</DialogTitle>
            <DialogDescription>
              Add a private task, ask or saved message.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <Input
              ref={input}
              aria-label="Entry text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Fix the pin-edit guard @Sol #PR70 due Fri 9am"
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  save(true);
                }
              }}
            />
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {assignee && (
                <span className="buzz-mockup-chip">@{assignee}</span>
              )}
              {target && <span className="buzz-mockup-chip">{target}</span>}
              {due && <span className="buzz-mockup-chip">Due {due}</span>}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!title}>
                Save entry
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={delegate !== null}
        onOpenChange={(value) => {
          if (!value) setDelegate(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send ask to {delegate?.assignee}</DialogTitle>
            <DialogDescription>
              {delegate?.target
                ? `This reply will appear in ${delegate.target}.`
                : "This ask will be sent as a direct message."}
            </DialogDescription>
          </DialogHeader>
          <p className="rounded border p-3 text-sm">{delegate?.title}</p>
          <DialogFooter>
            <Button onClick={() => setDelegate(null)}>Send ask</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Entries() {
  const all = useEntries();
  const filter = useMockupInboxFilter();
  const visible = all.filter(
    (entry) =>
      !entry.done &&
      !entry.snoozed &&
      (filter === "All" ||
        filter === "Mine" ||
        (filter === "Needs you" && entry.due === "Today, 18:00")),
  );
  if (!visible.length) return null;
  return (
    <section
      aria-label="My Inbox entries"
      className="shrink-0 divide-y border-b px-4"
    >
      {visible.map((entry) => (
        <div key={entry.id} className="flex items-center gap-2 py-2">
          <Checkbox
            aria-label={`Mark ${entry.title} done`}
            checked={false}
            onCheckedChange={() =>
              saveEntries(
                all.map((item) =>
                  item.id === entry.id ? { ...item, done: true } : item,
                ),
              )
            }
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{entry.title}</div>
            <p className="truncate text-xs text-muted-foreground">
              {entry.assignee ? `Ask · @${entry.assignee}` : "Private entry"}
              {entry.target && ` · ${entry.target}`}
              {entry.due && ` · ${entry.due}`}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Snooze ${entry.title}`}
            onClick={() =>
              saveEntries(
                all.map((item) =>
                  item.id === entry.id ? { ...item, snoozed: true } : item,
                ),
              )
            }
          >
            <Bell />
          </Button>
        </div>
      ))}
    </section>
  );
}

function Status({ item }: { item: InboxItem }) {
  const label = status.get(item.id);
  return label ? <span className="buzz-mockup-chip mt-1">{label}</span> : null;
}

export default {
  title: "Inbox v2",
  route: "/",
  channels,
  messages: { [CHANNEL]: events },
  feed: events.flatMap((event) => {
    const category = feedIds[Number.parseInt(event.id.slice(-8), 16)];
    return category
      ? [
          {
            ...event,
            category,
            channel_id: CHANNEL,
            channel_name: "Paseo P2",
            channel_type: "stream",
          },
        ]
      : [];
  }),
  filterInbox: matches,
  slots: {
    inboxActions: QuickAdd,
    inboxEntries: Entries,
    inboxFilter: Filter,
    inboxStatus: Status,
  },
  async prepare(view) {
    await waitFor('[data-testid="home-inbox"]');
    await waitFor('[data-testid^="home-inbox-item-"]');
    if (view === "filters") {
      (await waitFor('[data-testid="mockup-inbox-filter"]')).dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
      await waitFor('[role="menu"] [role="menuitem"]');
    }
    if (view === "quick-add") {
      (await waitFor('[data-testid="mockup-inbox-new"]')).click();
      await waitFor('[role="dialog"] input');
    }
  },
} satisfies Scenario;
