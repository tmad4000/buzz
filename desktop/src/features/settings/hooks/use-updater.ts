import { useState, useRef, useCallback, useEffect } from "react";
import { appBuild } from "@/shared/lib/appBuild";
import { FORK_RELEASE_FEED, newerForkRelease } from "../forkRelease";

export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "up-to-date" }
  | { state: "unavailable" }
  | { state: "available"; version: string }
  | { state: "downloading" }
  | { state: "installing" }
  | { state: "ready" }
  | { state: "error"; message: string }
  | {
      state: "manual-required";
      version: string;
      /** GitHub releases page for the update. */
      releaseUrl: string;
    };

/** Read-only fork release discovery. Never invokes the official updater. */
export function useUpdater() {
  const [status, setStatus] = useState<UpdateStatus>({ state: "idle" });
  const [latestCheck, setLatestCheck] = useState("Latest version not verified");
  const inFlight = useRef(false);
  const generation = useRef(0);
  const manual = useRef(false);
  const run = useCallback(async (background: boolean) => {
    if (!background) manual.current = true;
    if (inFlight.current) {
      if (!background) setStatus({ state: "checking" });
      return;
    }
    inFlight.current = true;
    const request = generation.current;
    setLatestCheck("Checking latest fork release…");
    if (!background) setStatus({ state: "checking" });
    try {
      const response = await fetch(FORK_RELEASE_FEED, {
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
        headers: { Accept: "application/vnd.github+json" },
      });
      if (!response.ok)
        throw new Error(`Fork release check failed (${response.status})`);
      const releases = await response.json();
      if (!Array.isArray(releases))
        throw new Error("Invalid fork release feed");
      const update = newerForkRelease(
        releases,
        appBuild.version,
        navigator.platform,
      );
      if (request !== generation.current) return;
      setLatestCheck(
        update
          ? `Update available: ${update.version}`
          : releases.length
            ? "Last check: no newer compatible fork release found"
            : "Latest version unavailable",
      );
      if (update) setStatus({ state: "manual-required", ...update });
      else if (manual.current)
        setStatus({ state: releases.length ? "up-to-date" : "unavailable" });
    } catch (error) {
      if (request === generation.current)
        setLatestCheck(
          `Check failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      if (request === generation.current && manual.current)
        setStatus({
          state: "error",
          message: error instanceof Error ? error.message : String(error),
        });
    } finally {
      if (request === generation.current) {
        inFlight.current = false;
        manual.current = false;
      }
    }
  }, []);
  const checkForUpdate = useCallback(() => run(false), [run]);
  useEffect(() => {
    const initial = window.setTimeout(() => void run(true), 0);
    const timer = window.setInterval(
      () => {
        if (!document.hidden) void run(true);
      },
      15 * 60 * 1000,
    );
    const visible = () => {
      if (!document.hidden) void run(true);
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      generation.current++;
      inFlight.current = false;
      window.clearTimeout(initial);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [run]);
  // Kept for existing shared indicators. Fork releases require explicit installation.
  const installAndRelaunch = useCallback(async () => {}, []);
  return { status, latestCheck, checkForUpdate, installAndRelaunch };
}
