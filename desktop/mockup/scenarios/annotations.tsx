import { useState, useSyncExternalStore } from "react";
import { MessageSquareText, Plus, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Textarea } from "@/shared/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { CHANNEL, JACOB, SOL, channels, eventId, message } from "../fixtures";
import { waitFor } from "../presentation";
import type { Scenario } from "../runtime";

const root = eventId(41);
const answer = eventId(43);
const offline = eventId(44);
const filters = ["All", "Mine", "Shared", "Feedback"] as const;
type Note = {
  id: number;
  anchor: string;
  quote: string;
  body: string;
  state: "Private" | "Shared" | "Feedback";
  time: string;
};

const seed: Note[] = [
  {
    id: 1,
    anchor: answer,
    quote: "moved the Needs-you panel into the Mail rail",
    body: "Mail is a mode of Home. Keep Needs-you where the attention design put it.",
    state: "Private",
    time: "09:14",
  },
  {
    id: 2,
    anchor: answer,
    quote: "changed the archive key to d",
    body: "Check this against the existing keyboard map before proposing a new binding.",
    state: "Private",
    time: "09:16",
  },
  {
    id: 3,
    anchor: answer,
    quote: "Mockup and design doc are in the task folder.",
    body: "The summary didn't answer whether existing Inbox filters carry over.",
    state: "Feedback",
    time: "09:18",
  },
  {
    id: 4,
    anchor: offline,
    quote: "Outbox replay and the dirty-draft guard",
    body: "Check the offline flow again after the native smoke run.",
    state: "Private",
    time: "09:20",
  },
];

let snapshot = { open: true, target: null as string | null, notes: seed };
const listeners = new Set<() => void>();
function update(patch: Partial<typeof snapshot>) {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function useAnnotations() {
  return useSyncExternalStore(subscribe, () => snapshot);
}

function Glyph({ id }: { id: string }) {
  const { notes, target } = useAnnotations();
  const attached = notes.filter((note) => note.anchor === id);
  const hasFeedback = attached.some((note) => note.state === "Feedback");
  if (![root, answer, offline, eventId(42), eventId(45)].includes(id))
    return null;
  return (
    <button
      type="button"
      aria-label={
        attached.length
          ? `${attached.length} notes on this message. Open annotations`
          : "Annotate this message"
      }
      onClick={() => update({ open: true, target: id })}
      aria-pressed={target === id}
      className={`absolute right-2 z-10 -mt-4 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-accent focus-visible:bg-accent ${hasFeedback ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}
    >
      <MessageSquareText className="size-4" />
      {attached.length > 0 && (
        <span className="text-xs">{attached.length}</span>
      )}
    </button>
  );
}

function Margin() {
  const { notes, open, target } = useAnnotations();
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const [draft, setDraft] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Note | null>(null);
  if (!open) return null;
  const grouped = target
    ? notes.filter((note) => note.anchor === target)
    : notes;
  const matches = (note: Note, filterName: string) =>
    filterName === "All" ||
    note.state === (filterName === "Mine" ? "Private" : filterName);
  const visible = grouped.filter((note) => matches(note, filter));

  function save() {
    if (!draft?.trim()) return;
    update({
      notes: [
        ...notes,
        {
          id: (notes.at(-1)?.id ?? 0) + 1,
          anchor: target ?? root,
          quote: "",
          body: draft.trim(),
          state: "Private",
          time: "Just now",
        },
      ],
    });
    setDraft(null);
    setFilter("All");
  }

  return (
    <aside
      className="mockup-annotation-margin order-2 flex w-[21rem] max-w-[40%] shrink-0 flex-col overflow-hidden border-l bg-background"
      aria-label="Annotations"
      data-testid="mockup-annotations"
    >
      <div className="flex min-h-12 items-center gap-2 border-b px-4">
        <MessageSquareText className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Annotations</h2>
        <span className="text-xs text-muted-foreground">
          {target ? "This message" : "This thread"} · {grouped.length}
        </span>
        <Button
          className="ml-auto"
          size="icon"
          variant="ghost"
          aria-label="Close annotations"
          onClick={() => update({ open: false })}
        >
          <X />
        </Button>
      </div>
      <div className="flex flex-wrap gap-1 border-b px-3 py-2">
        {filters.map((name) => (
          <Button
            type="button"
            size="sm"
            variant={filter === name ? "secondary" : "ghost"}
            aria-pressed={filter === name}
            key={name}
            onClick={() => setFilter(name)}
          >
            {name} {grouped.filter((note) => matches(note, name)).length}
          </Button>
        ))}
      </div>
      {target && (
        <Button
          size="sm"
          className="m-2 self-start"
          variant="ghost"
          onClick={() => update({ target: null })}
        >
          Show all thread notes
        </Button>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        {visible.map((note, index) => (
          <div className="border-b py-3" key={note.id}>
            {note.anchor !== visible[index - 1]?.anchor && (
              <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {note.anchor === root ? "tmad4000" : "Sol"} ·{" "}
                  {note.anchor === offline ? "09:17" : "09:10"}
                </span>
                <button
                  type="button"
                  className="underline underline-offset-2"
                  onClick={() =>
                    document
                      .querySelector(`[data-message-id="${note.anchor}"]`)
                      ?.scrollIntoView({ block: "center" })
                  }
                >
                  Jump to message
                </button>
              </div>
            )}
            {note.quote && (
              <blockquote className="border-l-2 pl-2 text-xs text-muted-foreground">
                “{note.quote}”
              </blockquote>
            )}
            <p className="my-2 text-sm">{note.body}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="buzz-mockup-chip">
                {note.state === "Feedback"
                  ? "Feedback · awaiting Sol"
                  : note.state}
              </span>
              {note.time}
            </div>
            {note.state === "Private" && (
              <Button
                size="sm"
                className="mt-2"
                variant="outline"
                data-mockup-feedback
                onClick={() => setConfirmation(note)}
              >
                Send as feedback
              </Button>
            )}
          </div>
        ))}
        {!visible.length && (
          <p className="py-4 text-sm text-muted-foreground">No notes here.</p>
        )}
      </div>
      <div className="shrink-0 border-t p-3">
        {draft !== null ? (
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <Textarea
              aria-label="Private note"
              placeholder="Write a private note"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                Private · saved to Noos
              </span>
              <Button size="sm" type="submit" disabled={!draft.trim()}>
                Save note
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setDraft("")}>
            <Plus /> New private note
          </Button>
        )}
      </div>
      <Dialog
        open={confirmation !== null}
        onOpenChange={(value) => {
          if (!value) setConfirmation(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send as feedback</DialogTitle>
            <DialogDescription>
              Share this note, quote, and message link with Sol, the author of
              the reply. It will stay out of #Paseo P2.
            </DialogDescription>
          </DialogHeader>
          <blockquote className="rounded-md border bg-muted p-3 text-sm">
            {confirmation?.body}
          </blockquote>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmation(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                update({
                  notes: notes.map((note) =>
                    note.id === confirmation?.id
                      ? { ...note, state: "Feedback" }
                      : note,
                  ),
                });
                setConfirmation(null);
              }}
            >
              Send as feedback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}

function AnnotationControl() {
  const { notes, open } = useAnnotations();
  return (
    <div className="flex items-center justify-between border-b p-2 text-xs">
      <span className="font-medium">Mail view design</span>
      <Button
        size="sm"
        variant="ghost"
        aria-pressed={open}
        onClick={() => update({ open: !open })}
      >
        <MessageSquareText /> Annotations {notes.length}
      </Button>
    </div>
  );
}

export default {
  title: "Annotations margin",
  route: `/channels/${CHANNEL}?thread=${root}`,
  channels,
  messages: {
    [CHANNEL]: [
      message(
        41,
        JACOB,
        "What about an alternative way of browsing Buzz, like an email view where I can see all of my stuff, including requests I’ve sent out?",
        66,
      ),
      message(
        42,
        SOL,
        "I’m reading the attention model and Home Inbox code first.",
        63,
        { root: 41 },
      ),
      message(
        43,
        SOL,
        "Mail view design is ready. Three columns: a folder rail, one row per thread, and the existing thread panel as the reading pane. I moved the Needs-you panel into the Mail rail and changed the archive key to `d` so it matches Done.",
        37,
        { root: 41 },
      ),
      message(
        44,
        SOL,
        "Offline P1 desktop PR 86 is ready for review. Outbox replay and the dirty-draft guard are covered by the journey test.",
        30,
        { root: 41 },
      ),
      message(45, JACOB, "Looks good. Send me the mockup link.", 27, {
        root: 41,
      }),
    ],
  },
  slots: { channelMargin: Margin, message: Glyph, thread: AnnotationControl },
  async prepare(view) {
    await waitFor('[data-testid="message-thread-panel"]');
    await waitFor('[data-testid="mockup-annotations"]');
    if (view === "feedback") {
      (await waitFor("[data-mockup-feedback]")).click();
      await waitFor('[role="dialog"]');
    }
  },
} satisfies Scenario;
