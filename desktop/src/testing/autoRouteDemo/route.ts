import {
  findPromptFixture,
  INSTANT_HOST,
  INSTANT_MODEL,
  LUNA_HOST,
  LUNA_MODEL,
  type ModelChoice,
  type ReplyFixture,
} from "./fixtures.ts";

const DEADLINE_MS = 1_000;
const MAX_VISIBLE_TOKENS = 48;
const MIN_CONFIDENCE = 0.95;

export type RouteResult =
  | {
      kind: "instant";
      text: string;
      elapsedMs: number;
      model: string;
      host: string;
    }
  | { kind: "root" | "needs-root"; reason: string };

type Clock = {
  now: () => number;
  wait: (ms: number) => Promise<void>;
};

const clientClock: Clock = {
  now: () => performance.now(),
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

function isComplete(reply: ReplyFixture) {
  return (
    reply.status === "complete" &&
    Boolean(reply.text.trim()) &&
    reply.visibleTokens > 0 &&
    reply.visibleTokens <= MAX_VISIBLE_TOKENS
  );
}

/** Route against a closed set of simulated provider responses. Unknown text can only go to simulated root. */
export async function routeFixture(
  input: {
    text: string;
    quick?: boolean;
    model: ModelChoice;
    attachments: boolean;
    budgetAvailable: boolean;
    startedAt: number;
  },
  clock: Clock = clientClock,
): Promise<RouteResult> {
  const { model, quick } = input;
  const fallback = (reason: string): RouteResult => ({
    kind: quick || model === "instant" ? "needs-root" : "root",
    reason,
  });
  if (!quick && model !== "auto" && model !== "instant") {
    return { kind: "root", reason: "Selected destination" };
  }
  if (input.attachments) return fallback("Includes attachments or mentions");
  if (!input.budgetAvailable) return fallback("Instant budget reached");
  const fixture = findPromptFixture(input.text);
  if (!fixture) return fallback("No matching instant fixture");
  if (fixture.localReason) return fallback(fixture.localReason);

  const inTime = (nextMs = 0) =>
    clock.now() - input.startedAt + nextMs < DEADLINE_MS;
  if (!quick) {
    const decision = fixture.decision;
    if (!decision) return fallback("No routing decision fixture");
    if (!inTime(decision.latencyMs))
      return fallback("Instant deadline exceeded");
    await clock.wait(decision.latencyMs);
    if (!inTime()) return fallback("Instant deadline exceeded");
    if (
      decision.route !== "answer" ||
      !(decision.confidence >= MIN_CONFIDENCE && decision.confidence <= 1)
    ) {
      return fallback("Needs more context");
    }
  }
  const typedAnswer = quick ? fixture.quickDecision : undefined;
  if (typedAnswer) {
    if (!inTime(typedAnswer.latencyMs))
      return fallback("Instant deadline exceeded");
    await clock.wait(typedAnswer.latencyMs);
    if (!inTime()) return fallback("Instant deadline exceeded");
    return {
      kind: "instant",
      text: typedAnswer.value ? "Yes." : "No.",
      elapsedMs: Math.round(clock.now() - input.startedAt),
      model: LUNA_MODEL,
      host: LUNA_HOST,
    };
  }

  const reply = fixture.reply;
  if (!reply) return fallback("No complete instant answer");
  if (!inTime(reply.latencyMs)) return fallback("Instant deadline exceeded");
  await clock.wait(reply.latencyMs);
  if (!inTime()) return fallback("Instant deadline exceeded");
  if (!isComplete(reply)) return fallback("No complete instant answer");
  return {
    kind: "instant",
    text: reply.text,
    model: INSTANT_MODEL,
    host: INSTANT_HOST,
    elapsedMs: Math.round(clock.now() - input.startedAt),
  };
}
