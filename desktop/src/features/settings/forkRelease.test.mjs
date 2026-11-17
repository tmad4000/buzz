import { test } from "node:test";
import assert from "node:assert/strict";
import { forkVersion, newerForkRelease } from "./forkRelease.ts";
const release = (tag, extra = {}) => ({
  tag_name: tag,
  html_url: `https://github.com/tmad4000/buzz/releases/tag/${tag}`,
  assets: [{ name: "Buzz.Ideaflow.dmg" }],
  ...extra,
});
test("fork release selection compares numbered builds, ignores upstream, drafts, source-only and untrusted URLs", () => {
  assert.equal(forkVersion("v0.5.28"), null);
  assert.equal(
    newerForkRelease(
      [release("buzz-ideaflow-v0.5.28-ideaflow.4")],
      "0.5.28-ideaflow.4",
    ),
    null,
  );
  const valid = release("buzz-ideaflow-v0.5.28-ideaflow.10");
  const result = newerForkRelease(
    [
      null,
      {},
      release("v9.0.0"),
      release("buzz-ideaflow-v0.5.28-ideaflow.9"),
      valid,
      release("buzz-ideaflow-v0.5.28-ideaflow.12", { draft: true }),
      release("buzz-ideaflow-v0.5.28-ideaflow.13", { assets: [] }),
      release("buzz-ideaflow-v0.5.28-ideaflow.14", {
        html_url: "https://github.com/block/buzz/releases",
      }),
    ],
    "0.5.28-ideaflow.4",
  );
  assert.deepEqual(result, {
    version: "0.5.28-ideaflow.10",
    releaseUrl: valid.html_url,
  });
  assert.equal(
    newerForkRelease([valid], "0.5.28-ideaflow.4", "Linux x86_64"),
    null,
  );
  assert.ok(newerForkRelease([valid], "0.5.28-ideaflow.4", "MacIntel"));
  assert.equal(newerForkRelease([], "0.5.28-ideaflow.4"), null);
});

test("only exact version-matching arm64/x64 fork ZIPs are eligible on Mac", () => {
  const tag = "buzz-ideaflow-v0.5.28-ideaflow.5";
  const candidate = (name) => [release(tag, { assets: [{ name }] })];
  for (const arch of ["arm64", "x64"]) {
    const name = `Buzz-Ideaflow-0.5.28-ideaflow.5-macos-${arch}.zip`;
    assert.deepEqual(
      newerForkRelease(candidate(name), "0.5.28-ideaflow.4", "MacIntel"),
      {
        version: "0.5.28-ideaflow.5",
        releaseUrl: `https://github.com/tmad4000/buzz/releases/tag/${tag}`,
      },
    );
    for (const platform of ["Linux x86_64", "Win32", "all", "unknown"])
      assert.equal(
        newerForkRelease(candidate(name), "0.5.28-ideaflow.4", platform),
        null,
      );
  }
  for (const name of [
    "source.zip",
    "Buzz-Ideaflow-0.5.28-ideaflow.4-macos-arm64.zip",
    "Buzz-Ideaflow-0.5.28-ideaflow.5-macos-x86_64.zip",
    "Buzz-Ideaflow-0.5.28-ideaflow.5-macos-universal.zip",
    "Buzz-Ideaflow-0.5.28-ideaflow.5-macos-arm64.zip.sig",
    "Buzz-0.5.28-ideaflow.5-macos-arm64.zip",
  ])
    assert.equal(
      newerForkRelease(candidate(name), "0.5.28-ideaflow.4", "MacIntel"),
      null,
    );
});
