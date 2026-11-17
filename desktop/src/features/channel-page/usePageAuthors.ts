import * as React from "react";
import { getPageAuthors } from "./service";
/** Refresh the read-side gate; late roster responses cannot restore removed authors. */
export function usePageAuthors(channel: string, retry: number) {
  const [authors, setAuthors] = React.useState<string[] | null>(null);
  const [error, setError] = React.useState("");
  const scope = React.useRef(0),
    sequence = React.useRef(0);
  const latest = React.useRef<Promise<string[]> | null>(null);
  const refresh = React.useCallback(() => {
    const version = scope.current,
      request = ++sequence.current;
    const pending = (async (): Promise<string[]> => {
      try {
        const next = await getPageAuthors(channel);
        if (version !== scope.current) return [];
        if (request !== sequence.current) return latest.current ?? [];
        setAuthors((old) => (old?.join(",") === next.join(",") ? old : next));
        setError("");
        return next;
      } catch (error) {
        if (version === scope.current && request === sequence.current) {
          setAuthors(null);
          setError(String(error));
        }
        throw error;
      }
    })();
    latest.current = pending;
    return pending;
  }, [channel]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: retry is an explicit reload trigger.
  React.useEffect(() => {
    scope.current++;
    setAuthors(null);
    setError("");
    void refresh().catch(() => {});
    const timer = setInterval(() => void refresh().catch(() => {}), 15000);
    return () => {
      scope.current++;
      sequence.current++;
      latest.current = null;
      clearInterval(timer);
    };
  }, [refresh, retry]);
  return { authors, refresh, membershipError: error };
}
