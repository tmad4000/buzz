import type { RouterHistory } from "@tanstack/react-router";

const MARKER = "buzzSendScrollReturn";
type MarkedState = { __TSR_key?: string; key?: string; [MARKER]?: string };
type ReturnEntry = {
  href: string;
  origin: string | undefined;
  marker: string;
  owner: symbol;
  restore: () => void;
  leave: () => void;
};
const activeEntries = new WeakMap<RouterHistory, ReturnEntry>();

function stateOf(history: RouterHistory): MarkedState {
  return history.location.state;
}

/** One transient entry in the existing router history, shared by both panes. */
export function createSendScrollHistory(history: RouterHistory) {
  const owner = Symbol();
  let onLeave = () => {};

  return {
    push(restore: () => void) {
      const state = stateOf(history);
      const href = history.location.href;
      const previous = activeEntries.get(history);
      if (previous?.href === href && state[MARKER] === previous.marker) {
        if (previous.owner !== owner) previous.leave();
        activeEntries.set(history, {
          ...previous,
          owner,
          restore,
          leave: onLeave,
        });
        return true;
      }
      const marker = crypto.randomUUID();
      activeEntries.set(history, {
        href,
        origin: state.__TSR_key ?? state.key,
        marker,
        owner,
        restore,
        leave: onLeave,
      });
      history.push(href, { ...state, [MARKER]: marker });
      return stateOf(history)[MARKER] === marker;
    },
    subscribe(leave: () => void) {
      onLeave = leave;
      return history.subscribe(({ location, action }) => {
        const entry = activeEntries.get(history);
        if (!entry || entry.owner !== owner) return;
        const state: MarkedState = location.state;
        if (location.href === entry.href && state[MARKER] === entry.marker)
          return;
        activeEntries.delete(history);
        const returning =
          action.type === "BACK" || (action.type === "GO" && action.index < 0);
        if (
          returning &&
          location.href === entry.href &&
          (state.__TSR_key ?? state.key) === entry.origin
        )
          entry.restore();
        leave();
      });
    },
    ownsCurrent() {
      const entry = activeEntries.get(history);
      return (
        entry?.owner === owner && stateOf(history)[MARKER] === entry.marker
      );
    },
    clear() {
      if (activeEntries.get(history)?.owner === owner)
        activeEntries.delete(history);
    },
  };
}
