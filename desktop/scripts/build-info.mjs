import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

/** Capture source provenance once per build. Explicit manifest inputs must be
 * verified by the packager and override git/archive discovery as a pair. */
export function buildInfo(root, version, provenance = process.env) {
  const config = JSON.parse(
    readFileSync(path.join(root, "desktop/src-tauri/tauri.conf.json"), "utf8"),
  );
  const buildTime = new Date().toISOString();
  let commit = "";
  let commitTime = "";
  let event = "build";
  const suppliedCommit = provenance.BUZZ_SOURCE_COMMIT;
  const suppliedTime = provenance.BUZZ_SOURCE_COMMIT_TIME;
  if (suppliedCommit !== undefined || suppliedTime !== undefined) {
    if (
      typeof suppliedCommit !== "string" ||
      !/^[a-f0-9]{40}$/.test(suppliedCommit) ||
      typeof suppliedTime !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
        suppliedTime,
      ) ||
      !Number.isFinite(Date.parse(suppliedTime)) ||
      new Date(`${suppliedTime.slice(0, 10)}T00:00:00Z`)
        .toISOString()
        .slice(0, 10) !== suppliedTime.slice(0, 10)
    ) {
      throw new Error(
        "BUZZ_SOURCE_COMMIT and BUZZ_SOURCE_COMMIT_TIME must be a complete verified SHA/ISO-time pair",
      );
    }
    return {
      version: version ?? config.version,
      commit: suppliedCommit,
      commitTime: suppliedTime,
      buildTime,
      event: "commit",
    };
  }
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
