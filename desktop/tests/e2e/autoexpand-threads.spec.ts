import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import { installMockBridge, TEST_IDENTITIES } from "../helpers/bridge";

const VIEWER = "deadbeef".repeat(8);
const shots =
  process.env.BUZZ_AUTOEXPAND_SCREENSHOTS ?? "test-results/autoexpand";
async function ready(page: Page) {
  await page.getByTestId("channel-general").click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__BUZZ_E2E_HAS_MOCK_LIVE_SUBSCRIPTION__?.({
          channelName: "general",
        }),
      ),
    )
    .toBe(true);
}
function emitter(page: Page) {
  let index = 0;
  const base = Math.floor(Date.now() / 1000) + 10;
  return async (
    content: string,
    parentEventId?: string,
    pubkey = TEST_IDENTITIES.bob.pubkey,
    age = 0,
  ) => {
    const input = {
      content,
      parentEventId,
      pubkey,
      id: (5000 + index).toString(16).padStart(64, "0"),
      createdAt: base + index++ - age,
    };
    return page.evaluate(
      (input) =>
        window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__!({
          ...input,
          channelName: "general",
        }),
      input,
    );
  };
}
const inline = (page: Page, id: string) =>
  page.locator(`[data-testid="inline-thread"][data-thread-head-id="${id}"]`);
const toggle = (page: Page, id: string) =>
  page.locator(
    `[data-testid="message-thread-summary"][data-thread-head-id="${id}"]`,
  );
async function preferences(
  page: Page,
  channels: "collapsed" | "smart" | "expanded",
  replies: "collapsed" | "smart" | "expanded",
  layout?: "focus",
) {
  await page.keyboard.press("ControlOrMeta+,");
  await expect(page.getByTestId("settings-view")).toBeVisible();
  await page.getByTestId("settings-nav-appearance").click();
  await page.getByTestId(`thread-display-channels-${channels}`).click();
  await page.getByTestId(`thread-display-replies-${replies}`).click();
  if (layout) await page.getByTestId(`thread-layout-${layout}`).click();
  await page.getByTestId("settings-back-to-app").click();
  await page.getByTestId("channel-random").click();
  await ready(page);
}
async function marker(page: Page, id: string) {
  return page.evaluate(
    ({ pubkey, id }) =>
      JSON.parse(
        localStorage.getItem(`buzz.channel-read-state.v2:${pubkey}`) ?? "{}",
      )[`msg:${id}`] ?? null,
    { pubkey: VIEWER, id },
  );
}
test("Smart exposes historical Q&A and first agent answer without a click; saved collapse wins", async ({
  page,
}) => {
  const agent = "ab".repeat(32);
  await installMockBridge(page, {
    searchProfiles: [{ pubkey: agent, displayName: "Ava", isAgent: true }],
  });
  await page.addInitScript((pubkey) => {
    const value = new Date(Date.now() - 172800000 + 1000000).toISOString();
    const ids = [5000, 5001].map(
      (id) => `msg:${id.toString(16).padStart(64, "0")}`,
    );
    localStorage.setItem(
      `buzz.channel-read-state.v2:${pubkey}`,
      JSON.stringify(Object.fromEntries(ids.map((id) => [id, value]))),
    );
  }, VIEWER);
  await page.goto("/");
  await ready(page);
  const emit = emitter(page);
  const q = await emit(
    "Which build includes the sidebar fix?",
    undefined,
    TEST_IDENTITIES.bob.pubkey,
    172800,
  );
  const a = await emit(
    "Build 4; build 5 adds inline reading.",
    q.id,
    TEST_IDENTITIES.bob.pubkey,
    172800,
  );
  await page.getByTestId("message-timeline").evaluate((node) => {
    node.scrollTop = 0;
  });
  await expect(inline(page, q.id)).toContainText(
    "Build 4; build 5 adds inline reading.",
  );
  await inline(page, q.id)
    .getByText("Build 4; build 5 adds inline reading.", { exact: true })
    .scrollIntoViewIfNeeded();
  await expect.poll(() => marker(page, a.id)).not.toBeNull();
  const command = await emit("Check the CI result", undefined, VIEWER);
  await expect(inline(page, command.id)).toHaveCount(0);
  const focusAnchor = page.getByRole("button", {
    name: "Toggle Sidebar",
    exact: true,
  });
  await focusAnchor.focus();
  await expect(focusAnchor).toBeFocused();
  const agentAnswer = await emit(
    "All required checks passed.",
    command.id,
    agent,
  );
  await expect(inline(page, command.id)).toContainText(
    "All required checks passed.",
  );
  await expect(page.getByTestId("message-thread-panel")).toHaveCount(0);
  await expect(focusAnchor).toBeFocused();
  await inline(page, command.id)
    .getByText("All required checks passed.", { exact: true })
    .scrollIntoViewIfNeeded();
  await expect.poll(() => marker(page, agentAnswer.id)).not.toBeNull();
  const keys = await page.evaluate(() =>
    Object.keys(localStorage).filter((key) =>
      key.startsWith("buzz-thread-expansion.v1:"),
    ),
  );
  expect(keys).toEqual([]);
  fs.mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/smart-answers.png` });
  await toggle(page, q.id).scrollIntoViewIfNeeded();
  await expect(toggle(page, q.id)).toHaveAttribute("aria-expanded", "true");
  await toggle(page, q.id).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(inline(page, q.id)).toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  await expect(inline(page, q.id)).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(inline(page, q.id)).toHaveCount(0);
  const hidden = await emit("A later hidden reply stays unread.", q.id);
  await expect(toggle(page, q.id)).toHaveAttribute("aria-expanded", "false");
  expect(await marker(page, hidden.id)).toBeNull();
  await page.getByTestId("channel-random").click();
  await ready(page);
  await expect(inline(page, q.id)).toHaveCount(0);
  expect(await marker(page, hidden.id)).toBeNull();
});
test("nested choices synchronize with the side panel and beat later Expanded defaults", async ({
  page,
}) => {
  await installMockBridge(page);
  await page.goto("/");
  await ready(page);
  await preferences(page, "collapsed", "collapsed");
  const emit = emitter(page);
  const root = await emit("Review the deployment plan");
  const branch = await emit("Signing and notarization", root.id);
  const leaf = await emit("Retain the rollback copy.", branch.id);
  await expect(inline(page, root.id)).toHaveCount(0);
  await toggle(page, root.id).click();
  const box = inline(page, root.id);
  await expect(
    box.getByText("Signing and notarization", { exact: true }),
  ).toBeVisible();
  await expect(
    box.getByText("Retain the rollback copy.", { exact: true }),
  ).toHaveCount(0);
  expect(await marker(page, leaf.id)).toBeNull();
  const branchToggle = box.locator(
    `[data-testid="inline-branch-toggle"][data-thread-head-id="${branch.id}"]`,
  );
  await branchToggle.click();
  await expect(
    box.getByText("Retain the rollback copy.", { exact: true }),
  ).toBeVisible();
  await page
    .locator(
      `[data-testid="open-thread-side-panel"][data-thread-head-id="${root.id}"]`,
    )
    .click();
  const side = page.getByTestId("message-thread-panel");
  await expect(
    side.getByText("Retain the rollback copy.", { exact: true }),
  ).toBeVisible();
  await branchToggle.click();
  await expect(
    box.getByText("Retain the rollback copy.", { exact: true }),
  ).toHaveCount(0);
  await expect(
    side.getByText("Retain the rollback copy.", { exact: true }),
  ).toHaveCount(0);
  await preferences(page, "collapsed", "expanded");
  await expect(
    box.getByText("Retain the rollback copy.", { exact: true }),
  ).toHaveCount(0);
  await expect(
    box.locator(
      `[data-testid="inline-branch-toggle"][data-thread-head-id="${branch.id}"]`,
    ),
  ).toHaveAttribute("aria-expanded", "false");
  fs.mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/shared-saved-collapse.png` });
});
test("Expanded uses bounded pages/rows and does not acknowledge unloaded replies", async ({
  page,
}) => {
  await installMockBridge(page);
  await page.goto("/");
  await ready(page);
  await preferences(page, "expanded", "expanded");
  const rootId = (9000).toString(16).padStart(64, "0");
  const lastId = (9055).toString(16).padStart(64, "0");
  await page.evaluate(
    ({ rootId, pubkey }) => {
      const emit = window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__!;
      const now = Math.floor(Date.now() / 1000) + 10;
      emit({
        id: rootId,
        content: "A longer project discussion",
        channelName: "general",
        pubkey,
        createdAt: now,
      });
      for (let i = 1; i <= 55; i++)
        emit({
          id: (9000 + i).toString(16).padStart(64, "0"),
          content: `Bounded reply ${i}`,
          parentEventId: rootId,
          channelName: "general",
          pubkey,
          createdAt: now + i,
        });
    },
    { rootId, pubkey: TEST_IDENTITIES.bob.pubkey },
  );
  const box = inline(page, rootId);
  await expect(box.getByTestId("message-row")).toHaveCount(8);
  await expect(box.getByText("Bounded reply 55", { exact: true })).toHaveCount(
    0,
  );
  expect(await marker(page, lastId)).toBeNull();
  const reads = () =>
    page.evaluate(
      (rootId) =>
        (window.__BUZZ_E2E_COMMAND_PAYLOADS__ ?? [])
          .filter(
            (entry) =>
              entry.command === "get_thread_replies" &&
              (entry.payload as { rootEventId?: string }).rootEventId ===
                rootId,
          )
          .map(
            (entry) => entry.payload as { limit?: number; cursor?: unknown },
          ),
      rootId,
    );
  const initial = await reads();
  expect(initial.length).toBeGreaterThan(0);
  expect(initial.every((read) => read.limit === 20 && !read.cursor)).toBe(true);
  await box.getByRole("button", { name: "More replies", exact: true }).click();
  await expect(box.getByTestId("message-row")).toHaveCount(28);
  expect(await marker(page, lastId)).toBeNull();
  expect((await reads()).every((read) => read.limit === 20)).toBe(true);
  fs.mkdirSync(shots, { recursive: true });
  await page
    .locator(
      `[data-testid="open-thread-side-panel"][data-thread-head-id="${rootId}"]`,
    )
    .click();
  const panel = page.getByTestId("message-thread-panel");
  await expect(panel.getByTestId("message-row")).toHaveCount(41);
  await panel.getByRole("button", { name: /Show earlier replies/ }).click();
  await expect(
    panel.getByText("Bounded reply 1", { exact: true }),
  ).toBeVisible();
  await panel.getByRole("button", { name: /Show later replies/ }).click();
  await expect(panel.getByTestId("message-row")).toHaveCount(41);
  await expect(
    panel.getByText("Bounded reply 55", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${shots}/bounded-narrow.png` });
});

test("focused thread keyboard disclosure retains focus after branch/root collapse and expansion", async ({
  page,
}) => {
  await installMockBridge(page);
  await page.goto("/");
  await ready(page);
  await preferences(page, "collapsed", "expanded", "focus");
  const emit = emitter(page);
  const root = await emit("Keyboard review discussion");
  const branch = await emit("Signing details", root.id);
  await emit("Preserve the rollback bundle.", branch.id);
  await page
    .locator(
      `[data-testid="open-thread-side-panel"][data-thread-head-id="${root.id}"]`,
    )
    .click();
  const panel = page.getByTestId("message-thread-panel");
  await expect(
    panel.getByText("Preserve the rollback bundle.", { exact: true }),
  ).toBeVisible();
  const disclosure = (id: string, open: boolean) =>
    panel.locator(
      `button[data-thread-head-id="${id}"][aria-expanded="${open}"]`,
    );
  await disclosure(branch.id, true).focus();
  await page.keyboard.press("Enter");
  await expect(disclosure(branch.id, false)).toBeFocused();
  await expect(
    panel.getByText("Preserve the rollback bundle.", { exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Space");
  await expect(disclosure(branch.id, true)).toBeFocused();
  await expect(
    panel.getByText("Preserve the rollback bundle.", { exact: true }),
  ).toBeVisible();
  await disclosure(root.id, true).focus();
  await page.keyboard.press("Space");
  await expect(disclosure(root.id, false)).toBeFocused();
  await expect(panel.getByText("Signing details", { exact: true })).toHaveCount(
    0,
  );
  await page.keyboard.press("ArrowRight");
  await expect(disclosure(root.id, true)).toBeFocused();
  await expect(
    panel.getByText("Preserve the rollback bundle.", { exact: true }),
  ).toBeVisible();
  fs.mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/focused-keyboard-disclosure.png` });
});
