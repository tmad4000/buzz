import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, ChevronRight, Hash } from "lucide-react";
import { Button } from "@/shared/ui/button";
import type { RankedThread } from "@/features/messages/lib/threadRouting";
import {
  CHANNEL,
  JACOB,
  NORA,
  SOL,
  channels,
  eventId,
  message,
} from "../fixtures";
import { openThread, waitFor } from "../presentation";
import type { Scenario } from "../runtime";

const book = "Book repo PR: should we link the last PR from the README?";
const rollback =
  "Signed release rollback plan: keep .8 installable while .9 candidates bake.";
const digest = "Weekly reply digest for Jacob";
const draft =
  "Did I submit a PR already to the last book repo? What’s the status on that?";
const books = [
  [
    "Sol",
    "PR #41 is open against main. CI is green and the PR is waiting on your review.",
    "3h",
  ],
  ["tmad4000", "Let’s link it from the README once merged.", "yesterday"],
  ["nora", "Opened the book repo PR. It needs a status note.", "yesterday"],
];
const rollbacks = [
  [
    "nora",
    "The rollback tag stays pinned until two candidates pass smoke.",
    "40m",
  ],
  ["Sol", "Added the recovery steps to RELEASING.md.", "1h"],
  ["tmad4000", "Can we keep .8 installable in parallel?", "2h"],
];
const digests = [
  ["Sol", "Digest posted. Three threads need a reply from you.", "2d"],
  ["tmad4000", "Thanks, will go through them tonight.", "2d"],
];
const previews = {
  [eventId(11)]: {
    reason: "Same repo and PR",
    confidence: "High confidence",
    replies: books,
    last: "3h",
  },
  [eventId(15)]: {
    reason: "Matches PR and status",
    confidence: "Medium confidence",
    replies: rollbacks,
    last: "40m",
  },
  [eventId(19)]: {
    reason: "Recent conversation",
    confidence: "Low confidence",
    replies: digests,
    last: "2d",
  },
} as Record<
  string,
  { reason: string; confidence: string; replies: string[][]; last: string }
>;

function Picker({
  options,
  pick,
  close,
}: {
  options: RankedThread[];
  pick: (id: string | null) => void;
  close: () => void;
}) {
  const ranked = Object.keys(previews).flatMap((id) =>
    options.filter((option) => option.id === id),
  );
  const [active, setActive] = useState<string | null>(ranked[0]?.id ?? null);
  const rows = useRef<HTMLDivElement>(null);
  const previewAction = useRef<HTMLButtonElement>(null);
  const hover = useRef<number>(undefined);
  useEffect(() => () => window.clearTimeout(hover.current), []);
  const current = ranked.find((row) => row.id === active);
  const preview = current ? previews[current.id] : null;
  const select = (id: string | null) => {
    window.clearTimeout(hover.current);
    setActive(id);
  };
  const openCurrent = () => {
    if (!current) return;
    close();
    void openThread(CHANNEL, current.id);
  };

  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2"
      data-testid="mockup-thread-picker"
    >
      <div className="min-w-0 p-2">
        <h2 className="text-sm font-medium">Choose where to send</h2>
        <p className="pb-3 text-xs text-muted-foreground">
          Top matches in loaded messages · Semantic · local
        </p>
        <div
          ref={rows}
          role="menu"
          aria-label="Thread destinations"
          onKeyDown={(event) => {
            const buttons = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>(
                '[role="menuitem"]',
              ),
            );
            const index = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            if (
              event.key === "o" ||
              (event.key === "Enter" && event.shiftKey)
            ) {
              event.preventDefault();
              openCurrent();
            } else if (event.key === "ArrowRight" || event.key === " ") {
              event.preventDefault();
              previewAction.current?.focus();
            } else if (
              ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
            ) {
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? buttons.length - 1
                    : (index +
                        (event.key === "ArrowDown" ? 1 : -1) +
                        buttons.length) %
                      buttons.length;
              buttons[next]?.focus();
            }
          }}
        >
          <div className="px-2 text-xs font-medium text-muted-foreground">
            Main channel
          </div>
          <button
            role="menuitem"
            type="button"
            className="buzz-mockup-option flex items-center gap-2"
            onClick={() => pick(null)}
            onFocus={() => select(null)}
            onPointerEnter={() => select(null)}
          >
            <Hash className="size-4" /> Paseo P2{" "}
            <span className="ml-auto text-xs text-muted-foreground">
              Top level
            </span>
          </button>
          <div className="mt-2 px-2 text-xs font-medium text-muted-foreground">
            Threads
          </div>
          {ranked.map((row) => (
            <button
              key={row.id}
              role="menuitem"
              type="button"
              data-thread-destination={row.id}
              data-active={current?.id === row.id}
              aria-describedby="mockup-thread-preview"
              className="buzz-mockup-option block"
              onFocus={() => select(row.id)}
              onPointerEnter={() => {
                window.clearTimeout(hover.current);
                hover.current = window.setTimeout(() => select(row.id), 120);
              }}
              onPointerLeave={() => window.clearTimeout(hover.current)}
              onClick={() => pick(row.id)}
            >
              <span className="line-clamp-2 font-medium">{row.title}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {row.author} · {row.replyCount} replies ·{" "}
                {previews[row.id].last}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {previews[row.id].reason}
              </span>
            </button>
          ))}
        </div>
      </div>
      <section
        aria-label="Thread preview"
        id="mockup-thread-preview"
        className="min-w-0 border-border p-3 sm:border-l"
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            rows.current
              ?.querySelector<HTMLButtonElement>('[data-active="true"]')
              ?.focus();
          }
        }}
      >
        {current && preview ? (
          <>
            <h3 className="text-sm font-semibold">{current.title}</h3>
            <div className="mt-2 text-xs text-muted-foreground">
              {current.author} · {current.replyCount} replies · last{" "}
              {preview.last}
            </div>
            <div className="mt-2">
              <span className="buzz-mockup-chip">{preview.confidence}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {preview.reason}
              </span>
            </div>
            <ul className="my-3 space-y-2 border-t pt-3">
              {preview.replies.map(([author, text, age]) => (
                <li key={text} className="text-xs">
                  <span className="font-medium">{author}</span>
                  <span className="ml-2 text-muted-foreground">{age}</span>
                  <p className="line-clamp-2 text-muted-foreground">{text}</p>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => pick(current.id)}>
                Send here
              </Button>
              <Button
                ref={previewAction}
                size="sm"
                variant="outline"
                onClick={openCurrent}
              >
                Open in sidebar <ArrowUpRight />
              </Button>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-sm font-semibold">#Paseo P2</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Post a top-level message to the main channel.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

function Origin({ id }: { id: string }) {
  const [expanded, setExpanded] = useState(false);
  if (id === eventId(18))
    return (
      <p className="mt-1 text-xs text-muted-foreground">
        written in #Paseo P2 main
      </p>
    );
  if (id !== eventId(21)) return null;
  return (
    <div
      className="text-xs text-muted-foreground"
      data-testid="mockup-origin-stub"
    >
      → sent to{" "}
      <button
        className="underline underline-offset-2"
        type="button"
        onClick={() => void openThread(CHANNEL, eventId(15))}
      >
        “Signed release rollback plan…”
      </button>
      <button
        className="ml-2 rounded px-1 hover:bg-accent"
        aria-expanded={expanded}
        type="button"
        onClick={() => setExpanded(!expanded)}
      >
        <ChevronRight className="inline size-3" />
        {expanded ? "Collapse" : "Expand"}
      </button>
      {expanded && (
        <p className="my-1 border-l pl-2">
          Can we keep .8 installable in parallel?
        </p>
      )}
    </div>
  );
}

export default {
  title: "Send to thread v2",
  channels,
  messages: {
    [CHANNEL]: [
      message(11, NORA, book, 1440),
      message(12, NORA, books[2][1], 1250, { root: 11 }),
      message(13, JACOB, books[1][1], 1100, { root: 11 }),
      message(
        22,
        NORA,
        "That should make it easier to find the PR later.",
        900,
        { root: 11 },
      ),
      message(23, SOL, "The branch is ready for review.", 380, { root: 11 }),
      message(14, SOL, books[0][1], 180, { root: 11 }),
      message(15, SOL, rollback, 124),
      message(18, JACOB, rollbacks[2][1], 120, { root: 15 }),
      message(17, SOL, rollbacks[1][1], 60, { root: 15 }),
      message(16, NORA, rollbacks[0][1], 40, { root: 15 }),
      message(19, SOL, digest, 2900),
      message(25, SOL, digests[0][1], 2880, { root: 19 }),
      message(26, JACOB, digests[1][1], 2878, { root: 19 }),
      message(21, JACOB, "Dispatch trace", 34),
    ],
  },
  replaceMessageBody: [eventId(21)],
  slots: { picker: Picker, message: Origin },
  async prepare(view) {
    await waitFor(`[data-message-id="${eventId(21)}"]`);
    if (view === "origin") {
      (
        await waitFor(
          '[data-testid="mockup-origin-stub"] button[aria-expanded]',
        )
      ).click();
      return;
    }
    const editor = await waitFor(
      '[data-testid="channel-composer-overlay"] [contenteditable="true"]',
    );
    if (!editor.textContent?.trim()) {
      editor.focus();
      document.execCommand("insertText", false, draft);
    }
    (await waitFor('[data-testid="send-to-thread"]:not([disabled])')).click();
    await waitFor(`[data-thread-destination="${eventId(11)}"]`);
    document
      .querySelector<HTMLButtonElement>(
        `[data-thread-destination="${eventId(11)}"]`,
      )
      ?.focus();
  },
} satisfies Scenario;
