import assert from "node:assert/strict";
import test from "node:test";
import { nextWorkspaceFocusRegion } from "./workspaceFocusCycle.ts";

test("F6 and Shift+F6 cycle sidebar and visible panes in opposite directions", () => {
  const regions = ["sidebar", "pane:a", "pane:b"];
  assert.equal(nextWorkspaceFocusRegion(regions, "sidebar", 1), "pane:a");
  assert.equal(nextWorkspaceFocusRegion(regions, "pane:a", 1), "pane:b");
  assert.equal(nextWorkspaceFocusRegion(regions, "pane:b", 1), "sidebar");
  assert.equal(nextWorkspaceFocusRegion(regions, "sidebar", -1), "pane:b");
});
test("compact projection skips hidden panes; missing region falls back by traversal direction", () => {
  const compact = ["sidebar", "pane:b"];
  assert.equal(nextWorkspaceFocusRegion(compact, "sidebar", 1), "pane:b");
  assert.equal(nextWorkspaceFocusRegion(compact, "pane:b", -1), "sidebar");
  assert.equal(nextWorkspaceFocusRegion(compact, "retired", 1), "sidebar");
  assert.equal(nextWorkspaceFocusRegion(compact, "retired", -1), "pane:b");
  assert.equal(nextWorkspaceFocusRegion([], null, 1), null);
});
