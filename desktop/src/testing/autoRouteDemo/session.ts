import { type ModelChoice, models, ROOT } from "./fixtures.ts";
import { routeFixture, type RouteResult } from "./route.ts";

export type FixtureCase =
  | "default"
  | "pinned"
  | "unverified"
  | "budget"
  | "root-unavailable";
type Destination = "root" | "gpt" | "claude" | "agent";
type Handoff = {
  status: "sending" | "received" | "failed";
  reason: string;
  destination: Destination;
};
type Turn = {
  id: number;
  text: string;
  quick: boolean;
  quickLine: boolean;
  result?: RouteResult;
  handoff?: Handoff;
};

export function quickPrefix(text: string) {
  return /^(?:\?|q:)\s*/i.exec(text.trimStart())?.[0] ?? "";
}

export function createFixtureSession(fixture: FixtureCase) {
  let state = {
    verified: fixture !== "unverified",
    // A verified absence is distinct from an unavailable read. Auto clears the
    // fixture pin; it is never written as a model identifier.
    model:
      fixture === "pinned" ? ("gpt" as Exclude<ModelChoice, "auto">) : null,
    notify: true,
    override: null as ModelChoice | null,
    preparing: false,
    quick: false,
    turns: [] as Turn[],
    announcement: "",
  };
  // The real composer brackets send preparation with this callback so that
  // a later edit to the thread setting cannot change an in-flight message.
  let captured:
    | { model: ModelChoice; quick: boolean; startedAt: number }
    | undefined;
  let nextId = 0;
  const listeners = new Set<() => void>();

  function update(patch: Partial<typeof state>) {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  }

  function changeTurn(id: number, patch: Partial<Turn>, announcement: string) {
    update({
      turns: state.turns.map((turn) =>
        turn.id === id ? { ...turn, ...patch } : turn,
      ),
      announcement,
    });
  }

  function dispatch(id: number, destination: Destination, reason: string) {
    const turn = state.turns.find((item) => item.id === id);
    if (!turn || (turn.handoff && turn.handoff.status !== "failed")) return;
    const label = destinationLabel(destination);
    const handoff = { destination, reason, status: "sending" } as const;
    changeTurn(id, { handoff }, `Sending to ${label}`);
    const willFail = fixture === "root-unavailable" && !turn.handoff;
    setTimeout(() => {
      if (state.turns.find((item) => item.id === id)?.handoff !== handoff)
        return;
      changeTurn(
        id,
        { handoff: { ...handoff, status: willFail ? "failed" : "received" } },
        willFail
          ? `Couldn’t reach ${label}`
          : `${label} received this · ${reason}`,
      );
    }, 260);
  }

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setModel(model: ModelChoice) {
      if (state.verified) update({ model: model === "auto" ? null : model });
    },
    setNotify(notify: boolean) {
      if (state.verified) update({ notify });
    },
    setOverride(override: ModelChoice | null) {
      if (state.verified && !state.preparing) update({ override });
    },
    setQuick(quick: boolean) {
      if (state.verified && !state.preparing) update({ quick });
    },
    prepare(preparing: boolean) {
      if (preparing) {
        captured = {
          model: state.override ?? state.model ?? "auto",
          quick: state.quick,
          startedAt: performance.now(),
        };
      } else {
        captured = undefined;
      }
      update({ preparing });
    },
    async send(
      text: string,
      attachments: boolean,
      acknowledge?: () => void,
      quickLine?: { quick: boolean },
    ) {
      if (!state.verified) {
        update({ announcement: "Thread settings are unverified. Draft kept." });
        throw new Error("Thread settings are unverified. Draft kept.");
      }
      const choice = (!quickLine && captured) || {
        model:
          (quickLine ? state.model : (state.override ?? state.model)) ?? "auto",
        quick: quickLine?.quick ?? state.quick,
        startedAt: performance.now(),
      };
      const prompt = text.trim();
      const prefix = quickPrefix(prompt);
      const quick = choice.quick || Boolean(prefix);
      const question = prompt.slice(prefix.length);
      if (quick && !question) throw new Error("Enter a question. Draft kept.");
      const id = ++nextId;
      update({
        ...(quickLine ? {} : { override: null, quick: false }),
        turns: [
          ...state.turns,
          { id, text: question, quick, quickLine: Boolean(quickLine) },
        ],
        announcement: "Message accepted in fixture thread",
      });
      acknowledge?.();
      const result = await routeFixture({
        ...choice,
        text: question,
        quick,
        attachments,
        budgetAvailable: fixture !== "budget",
      });
      switch (result.kind) {
        case "instant":
          changeTurn(
            id,
            { result },
            `${quick ? "Quick" : "Instant"} answer from ${result.model}`,
          );
          break;
        case "needs-root":
          changeTurn(id, { result }, result.reason);
          break;
        case "root":
          changeTurn(id, { result }, "");
          dispatch(
            id,
            choice.model === "instant" || choice.model === "auto"
              ? "root"
              : choice.model,
            result.reason,
          );
          break;
      }
    },
    escalate(id: number) {
      const turn = state.turns.find((item) => item.id === id);
      if (
        turn?.result?.kind === "instant" ||
        turn?.result?.kind === "needs-root"
      ) {
        dispatch(
          id,
          "root",
          turn.result.kind === "instant"
            ? "Requested a stronger model"
            : turn.result.reason,
        );
      }
    },
    retry(id: number) {
      const handoff = state.turns.find((turn) => turn.id === id)?.handoff;
      if (handoff?.status === "failed")
        dispatch(id, handoff.destination, handoff.reason);
    },
  };
}

export function destinationLabel(destination: Destination) {
  return destination === "root"
    ? ROOT
    : `${models[destination].label} via Paseo root`;
}
