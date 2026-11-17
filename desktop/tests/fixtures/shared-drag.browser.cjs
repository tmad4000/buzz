const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect: baseExpect } = require("@playwright/test");
const expect = baseExpect.configure({ timeout: 30000 });
const origin = process.env.BUZZ_HOST_FIXTURE_ORIGIN;
if (!origin) throw new Error("Set BUZZ_HOST_FIXTURE_ORIGIN");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.BUZZ_CHROME_PATH,
    chromiumSandbox: true,
    headless: true,
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1700, height: 1000 },
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        !message.text().startsWith("Failed to load resource:")
      )
        errors.push(`console: ${message.text()}`);
    });
    const url = `${origin}/tests/fixtures/full-conversation-hosts.html?layout=1&drag=1`;
    const a = page.locator("[data-conversation-view=a]");
    const sidebar = page.getByRole("complementary", {
      name: "Drag fixture sidebar",
    });
    const row = (label) =>
      sidebar.locator("button").filter({ hasText: new RegExp(`^${label}$`) });
    const model = () => page.evaluate(() => window.layoutSnapshot());
    const events = () => page.evaluate(() => window.dragEvents);
    const panes = (root) =>
      root.kind === "pane" ? [root] : root.children.flatMap(panes);
    const load = async () => {
      await page.goto(url);
      await expect(a.getByTestId("message-thread-panel")).toContainText(
        "Release plan for pane A",
      );
      await expect(row("Drag existing DM")).toBeVisible();
    };
    const noMutations = async () => {
      const commands = await page.evaluate(() =>
        (window.__BUZZ_E2E_COMMAND_PAYLOADS__ ?? []).map((e) => e.command),
      );
      assert.deepEqual(
        commands.filter((command) =>
          /^(send_channel_message|create_dm|open_dm|create_direct_message|invite_channel_member|join_channel)$/.test(
            command,
          ),
        ),
        [],
      );
    };
    const point = async (paneId, edge) => {
      const box = await page
        .locator(`[data-conversation-drop-target="${paneId}"]`)
        .boundingBox();
      return edge === "right"
        ? { x: box.x + box.width - 12, y: box.y + box.height / 2 }
        : { x: box.x + box.width / 2, y: box.y + box.height - 12 };
    };
    const begin = async (label) => {
      const button = row(label);
      await button.scrollIntoViewIfNeeded();
      const box = await button.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2);
    };
    const drop = async (label, paneId, edge) => {
      await begin(label);
      const p = await point(paneId, edge);
      await page.mouse.move(p.x, p.y, { steps: 12 });
      await expect(page.getByTestId("conversation-drop-preview")).toContainText(
        /Open/,
      );
      await page.mouse.up();
    };

    await load();
    const original = await model();
    await a
      .getByTestId("message-thread-panel")
      .getByTestId("message-input")
      .fill("Draft survives canvas split");
    await begin("Drag General duplicate row");
    await expect(
      sidebar.locator("[data-sidebar-draggable-channel]").nth(0),
    ).not.toHaveAttribute("data-sidebar-drag-state", "dragging");
    await expect(
      sidebar.locator("[data-sidebar-draggable-channel]").nth(1),
    ).toHaveAttribute("data-sidebar-drag-state", "dragging");
    let p = await point(original.root.id, "right");
    await page.mouse.move(p.x, p.y, { steps: 12 });
    await expect(page.getByTestId("conversation-drop-preview")).toContainText(
      "Open general here",
    );
    if (process.env.BUZZ_HOST_FIXTURE_SCREENSHOTS) {
      fs.mkdirSync(process.env.BUZZ_HOST_FIXTURE_SCREENSHOTS, {
        recursive: true,
      });
      await page.screenshot({
        path: path.join(
          process.env.BUZZ_HOST_FIXTURE_SCREENSHOTS,
          "right-preview.png",
        ),
      });
    }
    assert.equal(panes((await model()).root).length, 1, "hover cannot split");
    await page.mouse.up();
    await expect(page.locator("[data-conversation-view]")).toHaveCount(2);
    let next = await model();
    assert.equal(
      new Set(Object.values(next.views).map((view) => view.id)).size,
      2,
    );
    assert.equal(
      new Set(Object.values(next.views).map((view) => view.channelId)).size,
      1,
      "same chat opens twice",
    );
    const opened = panes(next.root).find(
      (pane) => pane.id === next.focusedPaneId,
    );
    assert.notEqual(opened.viewInstanceId, "a");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.activeElement.closest("[data-conversation-view]")?.dataset
              .conversationView,
        ),
      )
      .toBe(opened.viewInstanceId);
    await expect(
      a.getByTestId("message-thread-panel").getByTestId("message-input"),
    ).toHaveText("Draft survives canvas split");
    assert.deepEqual(
      (await events()).map((event) => event.type),
      ["canvas"],
    );
    await drop("Drag existing DM", opened.id, "bottom");
    await expect
      .poll(
        async () =>
          Object.values((await model()).views).filter(
            (view) =>
              view.channelId !== Object.values(original.views)[0].channelId,
          ).length,
      )
      .toBe(1);
    next = await model();
    assert.equal(
      panes(next.root).length,
      2,
      "second drop replaces rather than creates a third pane",
    );
    assert.equal(next.root.axis, "horizontal");
    const dmView = page.locator(
      `[data-conversation-view="${opened.viewInstanceId}"]`,
    );
    await expect(dmView.getByTestId("message-thread-panel")).toHaveCount(0);
    await expect(
      dmView.getByText("Release plan for pane A", { exact: true }),
    ).toHaveCount(0);
    await expect(
      a.getByTestId("message-thread-panel").getByTestId("message-input"),
    ).toHaveText("Draft survives canvas split");
    assert.deepEqual(
      (await events()).map((event) => event.type),
      ["canvas", "canvas"],
    );
    await noMutations();

    await load();
    await drop("Drag existing DM", (await model()).root.id, "bottom");
    next = await model();
    assert.equal(next.root.axis, "vertical");
    assert.equal(panes(next.root).length, 2);
    await noMutations();

    await load();
    await a.getByRole("button", { name: "Expand thread", exact: true }).click();
    await expect(a.getByTestId("focus-thread-drawer-overlay")).toBeVisible();
    const saved = JSON.stringify(await model());
    await begin("Drag General");
    p = await point((await model()).root.id, "right");
    await page.mouse.move(p.x, p.y, { steps: 12 });
    await expect(page.getByTestId("conversation-drop-preview")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(page.getByTestId("conversation-drop-preview")).toHaveCount(0);
    await expect(a.getByTestId("focus-thread-drawer-overlay")).toBeVisible();
    assert.equal(JSON.stringify(await model()), saved);
    assert.deepEqual(await events(), []);
    await begin("Drag General");
    await page.mouse.move(1400, 8, { steps: 12 });
    await page.mouse.up();
    assert.equal(JSON.stringify(await model()), saved);
    assert.deepEqual(await events(), []);
    if (await row("Drag unsupported forum").count()) {
      await begin("Drag unsupported forum");
      p = await point((await model()).root.id, "right");
      await page.mouse.move(p.x, p.y, { steps: 12 });
      await expect(page.getByTestId("conversation-drop-preview")).toHaveCount(
        0,
      );
      await page.mouse.up();
      assert.equal(JSON.stringify(await model()), saved);
    }
    await noMutations();

    await load();
    const beforeScopeChange = JSON.stringify(await model());
    await begin("Drag General");
    p = await point((await model()).root.id, "right");
    await page.mouse.move(p.x, p.y, { steps: 12 });
    await expect(page.getByTestId("conversation-drop-preview")).toBeVisible();
    await page.getByTestId("change-drag-scope").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("conversation-drop-preview")).toHaveCount(0);
    await expect(page.getByTestId("sidebar-channel-drag-overlay")).toHaveCount(
      0,
    );
    await page.mouse.up();
    assert.equal(JSON.stringify(await model()), beforeScopeChange);
    assert.deepEqual(await events(), []);
    await noMutations();

    await load();
    let target = await sidebar
      .locator("[data-fixture-section-drop=first]")
      .boundingBox();
    await begin("Drag General");
    await page.mouse.move(
      target.x + target.width / 2,
      target.y + target.height / 2,
      { steps: 12 },
    );
    await page.mouse.up();
    await expect
      .poll(
        async () =>
          (await events()).filter((event) => event.type === "assign").length,
      )
      .toBe(1);
    target = await sidebar
      .locator("[data-fixture-section-drop=first]")
      .boundingBox();
    await begin("Drag existing DM");
    await page.mouse.move(
      target.x + target.width / 2,
      target.y + target.height / 2,
      { steps: 12 },
    );
    await page.mouse.up();
    assert.equal(
      (await events()).filter((event) => event.type === "assign").length,
      1,
      "new DM drag cannot alter grouping",
    );
    const first = sidebar
      .locator("button")
      .filter({ hasText: /^Move first group$/ });
    const second = sidebar
      .locator("button")
      .filter({ hasText: /^Move second group$/ });
    const from = await first.boundingBox(),
      to = await second.boundingBox();
    await page.mouse.move(from.x + 20, from.y + 15);
    await page.mouse.down();
    await page.mouse.move(to.x + 20, to.y + 15, { steps: 16 });
    await page.mouse.up();
    await expect
      .poll(
        async () =>
          (await events()).filter((event) => event.type === "reorder").length,
      )
      .toBe(1);
    assert.equal(panes((await model()).root).length, 1);
    await noMutations();
    const statuses = await page.getByRole("status").allTextContents();
    assert.ok(statuses.some((text) => text.includes("Drag finished.")));
    assert.ok(
      statuses.every(
        (text) => !/sidebar-channel:|conversation-pane-drop:/.test(text),
      ),
      "announcements must not expose implementation IDs",
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS shared real pointer gestures: duplicate sidebar row identity; same-chat right split; existing-DM bottom split; second drop replaces; focused header; stale thread state cleared on resource change; Escape preserves focus drawer; outside/unsupported no-op; section assignment/reorder retained; DM grouping untouched; scope change cancels/hides stale drag; readable announcements; zero send/create/join/invite commands. Sandboxed Chrome; fixture controller, production AppShell layout/store integration still pending.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
