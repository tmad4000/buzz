import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

/** Capture the source revision once per build; never infer a date at runtime. */
export function buildInfo(root, version) {
  const config = JSON.parse(
    readFileSync(path.join(root, "desktop/src-tauri/tauri.conf.json"), "utf8"),
  );
  const buildTime = new Date().toISOString();
  let commit = "";
  let commitTime = "";
  let event = "build";
  try {
    const git = (...args) =>
      execFileSync("git", args, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    commit = git("rev-parse", "HEAD");
    commitTime = git("log", "-1", "--format=%cI", "HEAD");
    if (!git("status", "--porcelain", "--untracked-files=normal"))
      event = "commit";
  } catch {
    try {
      const archived = JSON.parse(
        readFileSync(path.join(root, ".git-archive-info"), "utf8"),
      );
      if (
        /^[a-f0-9]{40}$/.test(archived.commit) &&
        Number.isFinite(Date.parse(archived.commitTime))
      ) {
        commit = archived.commit;
        commitTime = archived.commitTime;
        event = "commit";
      }
    } catch {
      /* Unstamped archives use the recorded build time. */
    }
  }
  return {
    version: version ?? config.version,
    commit,
    commitTime,
    buildTime,
    event,
  };
}
