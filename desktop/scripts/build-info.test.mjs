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
    const clean = buildInfo(root, undefined, {});
    assert.equal(clean.version, "0.5.28-ideaflow.5");
    assert.equal(clean.event, "commit");
    assert.equal(clean.commitTime, git("log", "-1", "--format=%cI"));
    assert.equal(clean.commit, git("rev-parse", "HEAD"));
    writeFileSync(path.join(root, "uncommitted"), "dirty");
    assert.equal(buildInfo(root, undefined, {}).event, "build");
    rmSync(path.join(root, ".git"), { recursive: true });
    writeFileSync(path.join(root, ".git-archive-info"), JSON.stringify(clean));
    const archived = buildInfo(root, undefined, {});
    assert.equal(archived.event, "commit");
    assert.equal(archived.commit, clean.commit);
    assert.equal(archived.commitTime, clean.commitTime);
    rmSync(path.join(root, ".git-archive-info"));
    assert.equal(buildInfo(root, undefined, {}).event, "build");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("verified manifest env overrides archive/git; build time stays real and invalid pairs fail", () => {
  const root = mkdtempSync(path.join(tmpdir(), "buzz-manifest-info-"));
  try {
    mkdirSync(path.join(root, "desktop/src-tauri"), { recursive: true });
    writeFileSync(
      path.join(root, "desktop/src-tauri/tauri.conf.json"),
      JSON.stringify({ version: "0.5.28-ideaflow.5" }),
    );
    writeFileSync(
      path.join(root, ".git-archive-info"),
      JSON.stringify({
        commit: "a".repeat(40),
        commitTime: "2025-01-01T00:00:00Z",
      }),
    );
    const env = {
      BUZZ_SOURCE_COMMIT: "b".repeat(40),
      BUZZ_SOURCE_COMMIT_TIME: "2026-11-16T20:12:34+00:00",
      BUZZ_BUILD_TIME: "2000-01-01T00:00:00Z",
    };
    const before = Date.now();
    const info = buildInfo(root, undefined, env);
    const after = Date.now();
    assert.equal(info.commit, env.BUZZ_SOURCE_COMMIT);
    assert.equal(info.commitTime, env.BUZZ_SOURCE_COMMIT_TIME);
    assert.equal(info.event, "commit");
    const script = `import { buildInfo } from ${JSON.stringify(new URL("./build-info.mjs", import.meta.url).href)}; process.stdout.write(JSON.stringify(buildInfo(process.argv[1])));`;
    const actual = JSON.parse(
      execFileSync(
        process.execPath,
        ["--input-type=module", "-e", script, root],
        { encoding: "utf8", env: { ...process.env, ...env } },
      ),
    );
    assert.equal(actual.commit, env.BUZZ_SOURCE_COMMIT);
    assert.equal(actual.commitTime, env.BUZZ_SOURCE_COMMIT_TIME);
    assert.equal(actual.event, "commit");
    assert.ok(
      Date.parse(info.buildTime) >= before &&
        Date.parse(info.buildTime) <= after,
    );
    for (const invalid of [
      { BUZZ_SOURCE_COMMIT: env.BUZZ_SOURCE_COMMIT },
      { BUZZ_SOURCE_COMMIT_TIME: env.BUZZ_SOURCE_COMMIT_TIME },
      { ...env, BUZZ_SOURCE_COMMIT: "short" },
      { ...env, BUZZ_SOURCE_COMMIT: "" },
      { ...env, BUZZ_SOURCE_COMMIT_TIME: "bad" },
      { ...env, BUZZ_SOURCE_COMMIT_TIME: "2026-11-16" },
      { ...env, BUZZ_SOURCE_COMMIT_TIME: "2026-02-30T00:00:00Z" },
    ])
      assert.throws(
        () => buildInfo(root, undefined, invalid),
        /complete verified SHA/,
      );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
