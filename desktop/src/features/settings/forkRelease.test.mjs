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

test("notarized macOS fork zip is eligible, arbitrary zip is not", () => {
  const tag = "buzz-ideaflow-v0.5.28-ideaflow.5";
  assert.ok(
    newerForkRelease(
      [
        release(tag, {
          assets: [{ name: "Buzz-Ideaflow-0.5.28-ideaflow.5-macos-arm64.zip" }],
        }),
      ],
      "0.5.28-ideaflow.4",
      "MacIntel",
    ),
  );
  assert.equal(
    newerForkRelease(
      [release(tag, { assets: [{ name: "source.zip" }] })],
      "0.5.28-ideaflow.4",
      "MacIntel",
    ),
    null,
  );
  assert.equal(
    newerForkRelease(
      [
        release(tag, {
          assets: [{ name: "Buzz-Ideaflow-0.5.28-ideaflow.5-macos-arm64.zip" }],
        }),
      ],
      "0.5.28-ideaflow.4",
      "Linux x86_64",
    ),
    null,
  );
});
