import { ChevronDown, Sparkles } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { formatAgentModelLabel } from "@/features/agents/lib/formatAgentModelLabel";
import type { MessageComposerProps } from "@/features/messages/ui/MessageComposer.types";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import {
  INSTANT_HOST,
  INSTANT_MODEL,
  type ModelChoice,
  models,
  ROOT,
} from "./fixtures";
import {
  createFixtureSession,
  destinationLabel,
  type FixtureCase,
} from "./session";

import { CHANNEL_ID, FIXTURE_THREAD } from "./threadFixture";

const params = new URLSearchParams(location.search);
const caseName = params.get("case");
const fixture: FixtureCase =
  caseName === "pinned" ||
  caseName === "unverified" ||
  caseName === "budget" ||
  caseName === "root-unavailable"
    ? caseName
    : "default";

const autoRouteSession = createFixtureSession(fixture);
export const prepareFixtureSend = autoRouteSession.prepare;

export const sendFixtureMessage: MessageComposerProps["onSend"] = (
  content,
  mentions,
  tags,
  _channel,
  _thread,
  _forceRest,
  outbox,
) =>
  autoRouteSession.send(
    content,
    mentions.length > 0 ||
      Boolean(tags?.length) ||
      Boolean(outbox?.attachments.length),
    outbox?.onQueued,
  );

export function isAutoRouteFixtureThread(
  channelId: string | null,
  id: string | null,
) {
  return (
    params.get("autoRoute") === "1" &&
    channelId === CHANNEL_ID &&
    id === FIXTURE_THREAD
  );
}

function useFixture() {
  return useSyncExternalStore(
    autoRouteSession.subscribe,
    autoRouteSession.getSnapshot,
  );
}

const choices = Object.keys(models) as ModelChoice[];

function ModelChoices({
  value,
  onChange,
  inherit,
}: {
  value: ModelChoice | "inherit";
  onChange: (value: ModelChoice | "inherit") => void;
  inherit?: boolean;
}) {
  return (
    <DropdownMenuRadioGroup
      value={value}
      onValueChange={(next) => {
        if (next === "inherit") onChange(next);
        else {
          const option = choices.find((choice) => choice === next);
          if (option) onChange(option);
        }
      }}
    >
      {inherit && (
        <DropdownMenuRadioItem value="inherit">
          Use thread default
        </DropdownMenuRadioItem>
      )}
      {choices.map((model) => (
        <DropdownMenuRadioItem value={model} key={model}>
          <span className="flex flex-col">
            <span>{models[model].label}</span>
            <span className="text-xs text-muted-foreground">
              {models[model].detail}
            </span>
          </span>
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}

// Item 14 reader presentation seam. The only read here is from local fixtures.
export function FixtureThreadModelChip() {
  const { verified, model, notify } = useFixture();
  const label =
    model === null ? formatAgentModelLabel(null) : models[model].label;
  if (!verified) {
    return (
      <span className="text-xs text-muted-foreground">
        Model and notifications unverified
      </span>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 shrink-0 gap-1.5 text-xs"
          aria-label="Thread model and notifications"
        >
          <Sparkles aria-hidden="true" className="size-3.5 text-primary" />
          {label} · Notify {notify ? "on" : "off"}
          <ChevronDown aria-hidden="true" className="size-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-60 max-w-[calc(100vw-2rem)]"
      >
        <DropdownMenuLabel>Thread model</DropdownMenuLabel>
        <ModelChoices
          value={model ?? "auto"}
          onChange={(next) => {
            if (next !== "inherit") autoRouteSession.setModel(next);
          }}
        />
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Notify on final response</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={notify ? "on" : "off"}
          onValueChange={(value) => autoRouteSession.setNotify(value === "on")}
        >
          <DropdownMenuRadioItem value="on">Notify on</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="off">Notify off</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function FixtureMessageModelChip() {
  const { verified, model, override, preparing } = useFixture();
  if (!verified) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          aria-label="Model for this message"
          disabled={preparing}
        >
          {models[override ?? model ?? "auto"].label}
          {override ? " · once" : ""}
          <ChevronDown aria-hidden="true" className="size-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-60 max-w-[calc(100vw-2rem)]"
      >
        <DropdownMenuLabel>For this message</DropdownMenuLabel>
        <ModelChoices
          value={override ?? "inherit"}
          inherit
          onChange={(next) =>
            autoRouteSession.setOverride(next === "inherit" ? null : next)
          }
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function FixtureTurns() {
  const { turns, announcement } = useFixture();
  const bottom = useRef<HTMLDivElement>(null);
  const turnCount = turns.length;
  useEffect(() => {
    if (turnCount > 0) bottom.current?.scrollIntoView({ block: "nearest" });
  }, [turnCount]);

  return (
    <section
      className="space-y-3 py-2"
      aria-label="Auto-route fixture messages"
    >
      <p className="text-xs text-muted-foreground">
        Simulated replies and receipts. Try “What’s a release candidate?” or
        “Which build is on M3?”
      </p>
      <p className="sr-only" role="status">
        {announcement}
      </p>
      {turns.map(({ id, text, result, handoff }) => (
        <article
          key={id}
          className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3"
        >
          <p className="whitespace-pre-wrap break-words text-message">{text}</p>
          {!result && (
            <p className="text-xs text-muted-foreground">Choosing a route…</p>
          )}
          {result?.kind === "instant" && (
            <div className="space-y-1.5 border-l-2 border-primary/45 pl-3">
              <p className="text-message">{result.text}</p>
              <p className="text-xs text-muted-foreground">
                Instant · {INSTANT_MODEL} · {INSTANT_HOST} · {result.elapsedMs}{" "}
                ms
              </p>
              {!handoff && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => autoRouteSession.escalate(id)}
                >
                  Ask a smarter model{" "}
                  <span className="text-muted-foreground">· {ROOT}</span>
                </Button>
              )}
            </div>
          )}
          {result?.kind === "needs-root" && !handoff && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{result.reason}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => autoRouteSession.escalate(id)}
              >
                Send to {ROOT}
              </Button>
            </div>
          )}
          {handoff && (
            <div className="space-y-1 text-xs text-muted-foreground">
              {result?.kind === "instant" && (
                <p className="font-medium">Follow-up to this message</p>
              )}
              {handoff.status === "sending" && (
                <p>Sending to {destinationLabel(handoff.destination)}…</p>
              )}
              {handoff.status === "received" && (
                <p>
                  {destinationLabel(handoff.destination)} received this ·{" "}
                  {handoff.reason}
                </p>
              )}
              {handoff.status === "failed" && (
                <>
                  <p>Couldn’t reach {destinationLabel(handoff.destination)}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => autoRouteSession.retry(id)}
                  >
                    Retry handoff
                  </Button>
                </>
              )}
            </div>
          )}
        </article>
      ))}
      <div ref={bottom} />
    </section>
  );
}
