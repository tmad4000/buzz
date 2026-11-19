import { useState, useRef, useCallback, useEffect } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import { allowAppRestart } from "@/shared/lib/appRestartGuard";
import { explicitUpdate } from "./explicitUpdate";
import { discoverSignedForkUpdate } from "./signedForkUpdate";
import { appBuild } from "@/shared/lib/appBuild";
import { FORK_RELEASE_FEED, newerForkRelease } from "../forkRelease";

export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "up-to-date" }
  | { state: "unavailable" }
  | { state: "available"; version: string; message?: string }
  | { state: "downloading" }
  | { state: "installing" }
  | { state: "ready"; message?: string }
  | { state: "error"; message: string }
  | {
      state: "manual-required";
      version: string;
      /** GitHub releases page for the update. */
      releaseUrl: string;
    };

/** Background checks discover only; installation requires an explicit click. */
export function useUpdater() {
  const [status, setStatus] = useState<UpdateStatus>({ state: "idle" });
  const [latestCheck, setLatestCheck] = useState("Latest version not verified");
  const inFlight = useRef(false);
  const generation = useRef(0);
  const manual = useRef(false);
  const pending = useRef<ReturnType<typeof explicitUpdate> | null>(null);
  const run = useCallback(async (background: boolean) => {
    if (pending.current?.busy || (background && pending.current)) return;
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
      await pending.current?.dispose();
      pending.current = null;
      const signed = await discoverSignedForkUpdate(appBuild.version);
      if (request !== generation.current) {
        await signed?.close();
        return;
      }
      if (signed) {
        pending.current = explicitUpdate(
          signed,
          allowAppRestart,
          relaunch,
          (state, message) => {
            if (request !== generation.current) return;
            if (state === "available")
              setStatus({ state, version: signed.version, message });
            else if (state === "error")
              setStatus({ state, message: message ?? "Update failed" });
            else setStatus({ state, ...(message ? { message } : {}) });
          },
        );
        setStatus({ state: "available", version: signed.version });
        setLatestCheck(`Update available: ${signed.version}`);
        return;
      }
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
      void pending.current?.dispose();
      pending.current = null;
      inFlight.current = false;
      window.clearTimeout(initial);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [run]);
  const installAndRelaunch = useCallback(async () => {
    await pending.current?.start();
  }, []);
  return { status, latestCheck, checkForUpdate, installAndRelaunch };
}
