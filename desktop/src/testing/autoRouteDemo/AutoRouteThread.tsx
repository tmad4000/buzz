import { ChevronDown, Sparkles, Zap } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { formatAgentModelLabel } from "@/features/agents/lib/formatAgentModelLabel";
import type { MessageComposerProps } from "@/features/messages/ui/MessageComposer.types";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { type ModelChoice, models, ROOT } from "./fixtures";
import {
  createFixtureSession,
  destinationLabel,
  type FixtureCase,
  quickPrefix,
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

function QuickToggle({
  active,
  prefix,
  disabled,
  onToggle,
}: {
  active: boolean;
  prefix: string;
  disabled: boolean;
  onToggle: () => void;
}) {
  const quick = active || Boolean(prefix);
  return (
    <Button
      type="button"
      size="sm"
      variant={quick ? "secondary" : "ghost"}
      aria-pressed={quick}
      disabled={disabled || Boolean(prefix)}
      title={prefix ? "Remove the Quick prefix to turn Quick off" : undefined}
      className="h-7 gap-1 text-xs"
      onClick={onToggle}
    >
      <Zap aria-hidden="true" className="size-3.5" />
      Quick
    </Button>
  );
}

export function FixtureComposerControls({ draft }: { draft: string }) {
  const { quick, preparing, verified } = useFixture();
  const prefix = quickPrefix(draft);
  if (!verified) return null;
  return (
    <>
      <QuickToggle
        active={quick}
        prefix={prefix}
        disabled={preparing}
        onToggle={() => autoRouteSession.setQuick(!quick)}
      />
      <FixtureMessageModelChip disabled={quick || Boolean(prefix)} />
    </>
  );
}

export function FixtureQuickLine() {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [quick, setQuick] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const submitting = useRef(false);
  const { verified } = useFixture();
  const prefix = quickPrefix(draft);
  const hasQuestion = Boolean(draft.trimStart().slice(prefix.length).trim());
  if (params.get("autoRoute") !== "1") return null;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mx-2 justify-start gap-2"
        >
          <Zap aria-hidden="true" className="size-4" />
          Quick-line
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogTitle>Quick-line</DialogTitle>
        <DialogDescription>
          Posts to Release questions. Use Quick, or start with ? or q:. Replies
          and handoffs are simulated.
        </DialogDescription>
        {!verified && (
          <p className="text-sm text-muted-foreground">
            Fixture scope is unverified.
          </p>
        )}
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!hasQuestion || submitting.current || !verified) return;
            submitting.current = true;
            setPreparing(true);
            setError("");
            try {
              await autoRouteSession.send(
                draft,
                false,
                () => {
                  setDraft("");
                  setQuick(false);
                },
                { quick },
              );
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Could not accept this question.",
              );
            } finally {
              submitting.current = false;
              setPreparing(false);
            }
          }}
        >
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-label="Quick-line question"
            className="flex-1"
            disabled={preparing || !verified}
          />
          <QuickToggle
            active={quick}
            prefix={prefix}
            disabled={preparing || !verified}
            onToggle={() => setQuick(!quick)}
          />
          <Button
            type="submit"
            size="sm"
            disabled={preparing || !hasQuestion || !verified}
          >
            Send
          </Button>
        </form>
        {error && (
          <p role="alert" className="text-sm">
            {error}
          </p>
        )}
        <div className="max-h-[50vh] overflow-y-auto">
          <FixtureTurns quickLineOnly />
        </div>
      </DialogContent>
    </Dialog>
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

function FixtureMessageModelChip({ disabled }: { disabled: boolean }) {
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
          disabled={preparing || disabled}
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

export function FixtureTurns({
  quickLineOnly = false,
}: {
  quickLineOnly?: boolean;
} = {}) {
  const { turns: allTurns, announcement } = useFixture();
  const turns = quickLineOnly
    ? allTurns.filter((turn) => turn.quickLine)
    : allTurns;
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
      {!quickLineOnly && (
        <p className="text-xs text-muted-foreground">
          Simulated replies and receipts. Try “What’s a release candidate?” or
          “Which build is on M3?”
        </p>
      )}
      <p className="sr-only" role="status">
        {announcement}
      </p>
      {turns.map(({ id, text, quick, result, handoff }) => (
        <article
          key={id}
          className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3"
        >
          <p className="whitespace-pre-wrap break-words text-message">{text}</p>
          {!result && (
            <p className="text-xs text-muted-foreground">
              {quick ? "Preparing a quick answer…" : "Choosing a route…"}
            </p>
          )}
          {result?.kind === "instant" && (
            <div className="space-y-1.5 border-l-2 border-primary/45 pl-3">
              <p className="text-message">{result.text}</p>
              <p className="text-xs text-muted-foreground">
                {quick ? "quick" : "Instant"} · {result.model} · {result.host} ·{" "}
                {result.elapsedMs} ms
              </p>
              {!handoff && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => autoRouteSession.escalate(id)}
                >
                  {quick ? "Go deeper" : "Ask a smarter model"}{" "}
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
                {quick ? `Go deeper · ${ROOT}` : `Send to ${ROOT}`}
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
