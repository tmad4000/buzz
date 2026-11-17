import * as React from "react";
import { appBuild, relativeUpdated } from "@/shared/lib/appBuild";

/** Build provenance in About; activation cannot reach conversation hotkeys. */
export function AppStamp() {
  const [exact, setExact] = React.useState(false);
  const [, repaint] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    const tick = () => {
      if (!document.hidden) repaint();
    };
    const timer = window.setInterval(tick, 60000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  const iso =
    appBuild.event === "commit" ? appBuild.commitTime : appBuild.buildTime;
  const relative = relativeUpdated(iso);
  const detail = relative
    ? `${new Date(iso).toLocaleString(undefined, { dateStyle: "full", timeStyle: "long" })} · commit ${appBuild.commit.slice(0, 9) || "unavailable"}${appBuild.event === "build" ? " (build time)" : ""}`
    : "";
  return (
    <button
      type="button"
      data-testid="settings-version"
      className="block max-w-full px-2 pb-1 text-left text-2xs text-muted-foreground tabular-nums focus-visible:outline focus-visible:outline-2"
      title={detail || undefined}
      aria-expanded={exact}
      onClick={(event) => {
        event.stopPropagation();
        setExact(!exact);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") event.stopPropagation();
      }}
      onKeyUp={(event) => {
        if (event.key === "Enter" || event.key === " ") event.stopPropagation();
      }}
    >
      v{appBuild.version}
      {relative ? (
        <>
          {" "}
          ·{" "}
          <time dateTime={iso} title={detail}>
            {exact ? detail : `Updated ${relative}`}
          </time>
        </>
      ) : null}
    </button>
  );
}
