const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect: baseExpect } = require("@playwright/test");
const expect = baseExpect.configure({ timeout: 30000 });
const origin = process.env.BUZZ_HOST_FIXTURE_ORIGIN;
if (!origin) throw new Error("Set BUZZ_HOST_FIXTURE_ORIGIN");
const shots = process.env.BUZZ_TIMELINE_PANE_SCREENSHOTS;

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.BUZZ_CHROME_PATH,
    chromiumSandbox: true,
    headless: true,
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1900, height: 1100 },
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(
      `${origin}/tests/fixtures/full-conversation-hosts.html?layout=1`,
      { timeout: 90000 },
    );
    const a = page.locator('[data-conversation-view="a"]');
    const b = page.locator('[data-conversation-view="b"]');
    const orderA = a.getByRole("combobox", { name: "Order", exact: true });
    const orderB = b.getByRole("combobox", { name: "Order", exact: true });
    await expect(a.getByTestId("message-thread-panel")).toContainText(
      "Release plan for pane A",
    );
    await expect(b.getByTestId("message-thread-panel")).toContainText(
      "Design decisions for pane B",
    );
    await b
      .getByTestId("message-thread-panel")
      .getByTestId("message-input")
      .fill("B draft survives A Timeline");
    await page.evaluate(() => {
      window.timelineSiblingEditor = document.querySelector(
        '[data-conversation-view="b"] [data-testid="message-thread-panel"] [data-testid="message-input"]',
      );
    });
    await a
      .getByTestId("message-thread-panel")
      .getByRole("button", { name: "Close panel", exact: true })
      .click();
    await expect(orderA).toBeVisible();
    await expect(orderA.locator('option[value="activity"]')).toHaveJSProperty(
      "disabled",
      true,
    );
    await page.evaluate(async () => {
      const { getIdentity } = await import("/src/shared/api/tauriIdentity.ts");
      const identity = await getIdentity();
      window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__({
        channelName: "general",
        pubkey: identity.pubkey,
        content: "Own editable message for mode safeguard",
        createdAt: Math.floor(Date.now() / 1000) + 1,
      });
    });
    const own = a
      .getByTestId("message-timeline")
      .getByTestId("message-row")
      .filter({ hasText: "Own editable message for mode safeguard" });
    await expect(own).toBeVisible();
    await own.hover();
    await own
      .getByRole("button", { name: "More actions", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Edit message", exact: true })
      .click();
    const mainA = a.getByTestId("channel-composer-overlay");
    await expect(mainA.getByTestId("edit-target")).toBeVisible();
    await expect(mainA.getByTestId("message-input")).toHaveText(
      "Own editable message for mode safeguard",
    );
    await mainA
      .getByTestId("message-input")
      .fill("Unsaved A edit must survive mode switch");
    await expect(mainA.getByTestId("message-input")).toHaveText(
      "Unsaved A edit must survive mode switch",
    );
    await orderA.selectOption("timeline");
    await expect(orderA).toHaveValue("threads");
    await expect(mainA.getByTestId("edit-target")).toBeVisible();
    await expect(mainA.getByTestId("message-input")).toHaveText(
      "Unsaved A edit must survive mode switch",
    );
    await mainA
      .getByRole("button", { name: "Cancel edit", exact: true })
      .click();
    await orderA.selectOption("timeline");
    await expect(orderA).toHaveValue("timeline");
    await expect(orderB).toHaveValue("threads");
    await expect(
      a
        .getByTestId("message-timeline")
        .getByText("Reply belonging to the release plan", { exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 1800, height: 1100 });
    await expect(orderB).toHaveValue("threads");
    await expect(b.getByTestId("chat-title")).toBeVisible();
    assert.ok(
      (await b.getByTestId("chat-title").boundingBox()).width >= 40,
      "docked sibling retains readable conversation title",
    );
    await expect(b.getByTestId("message-thread-panel")).toContainText(
      "Design decisions for pane B",
    );
    await expect(
      b.getByTestId("message-thread-panel").getByTestId("message-input"),
    ).toHaveText("B draft survives A Timeline");
    assert.equal(
      await page.evaluate(
        () =>
          window.timelineSiblingEditor ===
          document.querySelector(
            '[data-conversation-view="b"] [data-testid="message-thread-panel"] [data-testid="message-input"]',
          ),
      ),
      true,
    );
    await mainA
      .getByTestId("message-input")
      .fill("Unsent main draft for routing inspection");
    await mainA.getByTestId("send-to-thread").click();
    const menu = page.getByRole("menu", { name: "Thread destinations" });
    await expect(
      menu.locator(`[data-thread-destination="${"1".repeat(64)}"]`),
    ).toBeVisible();
    await expect(
      menu.locator(`[data-thread-destination="${"3".repeat(64)}"]`),
    ).toHaveCount(0);
    await expect(
      menu.locator(`[data-thread-destination="${"4".repeat(64)}"]`),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    if (shots) {
      await expect(
        page.getByText(
          "Finish or cancel your edit before leaving this conversation.",
          { exact: true },
        ),
      ).toHaveCount(0);
      fs.mkdirSync(shots, { recursive: true });
      await page.screenshot({
        path: path.join(shots, "timeline-and-thread.png"),
      });
    }
    await page.setViewportSize({ width: 1024, height: 1100 });
    await expect(orderA).toBeVisible();
    await expect(a.getByTestId("chat-title")).toBeVisible();
    assert.ok(
      (await a.getByTestId("chat-title").boundingBox()).width >= 40,
      "narrow Timeline keeps its conversation title",
    );
    await expect(
      b.getByTestId("message-thread-panel").getByTestId("message-input"),
    ).toHaveText("B draft survives A Timeline");
    const bounds = await b.boundingBox();
    const panel = await b.getByTestId("message-thread-panel").boundingBox();
    assert.ok(
      panel.x >= bounds.x - 1 &&
        panel.x + panel.width <= bounds.x + bounds.width + 1,
      "narrow thread stays within sibling leaf",
    );
    if (shots)
      await page.screenshot({
        path: path.join(shots, "timeline-and-thread-1024.png"),
      });
    await page.setViewportSize({ width: 1800, height: 1100 });
    assert.equal(
      await page.evaluate(
        () =>
          window.timelineSiblingEditor ===
          document.querySelector(
            '[data-conversation-view="b"] [data-testid="message-thread-panel"] [data-testid="message-input"]',
          ),
      ),
      true,
    );
    await a
      .locator('[title="Open this reply in Threads"]')
      .filter({ hasText: "Release plan for pane A" })
      .click();
    await expect(orderA).toHaveValue("threads");
    await expect(a.getByTestId("message-thread-panel")).toContainText(
      "Release plan for pane A",
    );
    await expect(a.getByTestId("message-thread-panel")).toContainText(
      "Reply belonging to the release plan",
    );
    await expect(b.getByTestId("message-thread-panel")).toContainText(
      "Design decisions for pane B",
    );
    await expect(
      b.getByTestId("message-thread-panel").getByTestId("message-input"),
    ).toHaveText("B draft survives A Timeline");
    assert.equal(
      await page.evaluate(
        () =>
          (window.__BUZZ_E2E_COMMAND_PAYLOADS__ ?? []).filter(
            (entry) =>
              entry.command === "send_channel_message" ||
              (entry.command === "plugin:websocket|send" &&
                (() => {
                  try {
                    const event = JSON.parse(entry.payload.message.data);
                    return event[0] === "EVENT" && event[1]?.kind === 9;
                  } catch {
                    return false;
                  }
                })()),
          ).length,
      ),
      0,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS actual dual ChannelScreen: scoped Order mode, sibling rerender/thread/editor/draft isolation, active edit veto, canonical root-only picker in Timeline, exact chip return and zero REST/WS sends. Mock bridge, Chrome sandbox on; no production workspace/URL/read hydration/native acceptance.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
