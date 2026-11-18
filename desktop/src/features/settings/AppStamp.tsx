import * as React from "react";
import { cn } from "@/shared/lib/cn";
import { appBuild, relativeUpdated } from "@/shared/lib/appBuild";
import { Popover, PopoverTrigger, PopoverContent } from "@/shared/ui/popover";
import { useOptionalUpdaterContext } from "./hooks/UpdaterProvider";

/** Exact provenance is read-only; opening it never installs or restarts. */
export function AppStamp({
  className,
  surface = "settings",
}: {
  className?: string;
  surface?: "settings" | "header";
}) {
  const latestCheck =
    useOptionalUpdaterContext()?.latestCheck ?? "Latest version not verified";
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
  const commitDate =
    appBuild.event === "commit" && relativeUpdated(appBuild.commitTime)
      ? appBuild.commitTime
      : "";
  const iso = commitDate || appBuild.buildTime;
  const relative = relativeUpdated(iso);
  const exact = relative
    ? new Date(iso).toLocaleString(undefined, {
        dateStyle: "full",
        timeStyle: "long",
      })
    : "Unavailable";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={`${surface}-version`}
          className={cn(
            "min-h-7 max-w-full rounded px-2 text-left text-xs text-muted-foreground tabular-nums focus-visible:ring-2 focus-visible:ring-ring",
            surface === "header" && "whitespace-nowrap",
            className,
          )}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ")
              event.stopPropagation();
          }}
          onKeyUp={(event) => {
            if (event.key === "Enter" || event.key === " ")
              event.stopPropagation();
          }}
        >
          {appBuild.version ? `v${appBuild.version}` : "Version unavailable"}
          {relative ? (
            <span
              className={
                surface === "header" ? "header-version-age" : undefined
              }
            >
              {" "}
              ·{" "}
              <time dateTime={iso}>
                Updated {relative}
                {!commitDate ? " (build)" : ""}
              </time>
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-w-[calc(100vw-2rem)] text-xs"
        data-testid={`${surface}-provenance`}
      >
        <p className="font-medium">
          {appBuild.version
            ? `Buzz Ideaflow v${appBuild.version}`
            : "Version unavailable"}
        </p>
        <p className="mt-2">
          Updated means{" "}
          {commitDate
            ? "source commit time"
            : "build time (source time unavailable)"}
          , not installation time.
        </p>
        <p>{exact}</p>
        <p className="break-all">Commit: {appBuild.commit || "unavailable"}</p>
        <p className="mt-2">{latestCheck}</p>
      </PopoverContent>
    </Popover>
  );
}
