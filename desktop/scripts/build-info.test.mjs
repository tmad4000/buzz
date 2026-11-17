import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { buildInfo } from "./build-info.mjs";

test("committer time is stable, dirty trees fall back, archives preserve source provenance", () => {
  const root = mkdtempSync(path.join(tmpdir(), "buzz-build-info-"));
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  try {
    mkdirSync(path.join(root, "desktop/src-tauri"), { recursive: true });
    writeFileSync(
      path.join(root, "desktop/src-tauri/tauri.conf.json"),
      JSON.stringify({ version: "0.5.28-ideaflow.5" }),
    );
    git("init");
    git("add", ".");
    git(
      "-c",
      "user.name=Build Test",
      "-c",
      "user.email=build-test@example.invalid",
      "commit",
      "-m",
      "fixture",
    );
    const clean = buildInfo(root);
    assert.equal(clean.version, "0.5.28-ideaflow.5");
    assert.equal(clean.event, "commit");
    assert.equal(clean.commitTime, git("log", "-1", "--format=%cI"));
    assert.equal(clean.commit, git("rev-parse", "HEAD"));
    writeFileSync(path.join(root, "uncommitted"), "dirty");
    assert.equal(buildInfo(root).event, "build");
    rmSync(path.join(root, ".git"), { recursive: true });
    writeFileSync(path.join(root, ".git-archive-info"), JSON.stringify(clean));
    const archived = buildInfo(root);
    assert.equal(archived.event, "commit");
    assert.equal(archived.commit, clean.commit);
    assert.equal(archived.commitTime, clean.commitTime);
    rmSync(path.join(root, ".git-archive-info"));
    assert.equal(buildInfo(root).event, "build");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
