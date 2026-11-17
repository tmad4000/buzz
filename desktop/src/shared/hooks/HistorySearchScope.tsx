import * as React from "react";
import type { HistorySearchSetterOptions } from "./useHistorySearchState";

export type HistorySearchValues = Record<string, string | null>;
export type HistorySearchPatch = Partial<HistorySearchValues>;
export type HistorySearchScope = {
  values: HistorySearchValues;
  applyPatch: (
    patch: HistorySearchPatch,
    options?: HistorySearchSetterOptions,
  ) => void;
};

/** A view supplies local history; only the active view's coordinator projects it into the URL. */
export const HistorySearchScopeContext =
  React.createContext<HistorySearchScope | null>(null);

/** Independent auxiliary navigation state, owned by the stable view instance. */
export function HistorySearchScopeProvider({
  children,
  initialValues = {},
  onNavigate,
}: {
  children: React.ReactNode;
  initialValues?: HistorySearchValues;
  onNavigate?: HistorySearchScope["applyPatch"];
}) {
  const [values, setValues] = React.useState(() => ({ ...initialValues }));
  const mounted = React.useRef(true);
  const current = React.useRef(values);
  const navigate = React.useRef(onNavigate);
  navigate.current = onNavigate;
  const pending = React.useRef<{
    patch: HistorySearchPatch;
    replace: boolean;
  } | null>(null);
  React.useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pending.current = null;
    };
  }, []);
  const applyPatch = React.useCallback<HistorySearchScope["applyPatch"]>(
    (patch, options) => {
      if (!mounted.current) return;
      if (pending.current) {
        Object.assign(pending.current.patch, patch);
        pending.current.replace ||= Boolean(options?.replace);
        return;
      }
      pending.current = {
        patch: { ...patch },
        replace: Boolean(options?.replace),
      };
      queueMicrotask(() => {
        const flush = pending.current;
        pending.current = null;
        if (!flush) return;
        const next = { ...current.current };
        let changed = false;
        for (const [key, value] of Object.entries(flush.patch)) {
          if (value !== undefined && (next[key] ?? null) !== value) {
            next[key] = value;
            changed = true;
          }
        }
        if (!changed) return;
        current.current = next;
        setValues(next);
        navigate.current?.(flush.patch, { replace: flush.replace });
      });
    },
    [],
  );
  const scope = React.useMemo(
    () => ({ values, applyPatch }),
    [values, applyPatch],
  );
  return (
    <HistorySearchScopeContext.Provider value={scope}>
      {children}
    </HistorySearchScopeContext.Provider>
  );
}
