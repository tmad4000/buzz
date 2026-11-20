import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const manifest = JSON.parse(
  readFileSync(
    new URL("../../../../preview-features.json", import.meta.url),
    "utf8",
  ),
);

test("existing Projects and Workflows experiments remain unchanged", () => {
  const existing = Object.fromEntries(
    manifest.features
      .filter(({ id }) => id === "projects" || id === "workflows")
      .map((feature) => [feature.id, feature]),
  );

  assert.deepEqual(existing, {
    projects: {
      id: "projects",
      name: "Projects",
      description: "Git repository browser and collaboration",
      platforms: ["desktop"],
    },
    workflows: {
      id: "workflows",
      name: "Workflows",
      description: "YAML-defined automations with approval gates",
      platforms: ["desktop"],
    },
  });
});

test("Results and Lanes share one opt-in desktop feature entry", () => {
  const entries = manifest.features.filter(({ id }) => id === "lanes");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].defaultEnabled, false);
  assert.deepEqual(entries[0].platforms, ["desktop"]);
});

test("Timeline initiator is a desktop default-on preference independent of Results", () => {
  const initiator = manifest.features.find(
    ({ id }) => id === "timelineInitiator",
  );
  assert.equal(initiator?.defaultEnabled, true);
  assert.deepEqual(initiator?.platforms, ["desktop"]);
  assert.equal(
    manifest.features.find(({ id }) => id === "lanes")?.defaultEnabled,
    false,
  );
});
