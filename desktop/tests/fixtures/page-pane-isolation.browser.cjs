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
      viewport: { width: 1900, height: 1100 },
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(
      `${origin}/tests/fixtures/full-conversation-hosts.html?layout=1`,
      { timeout: 90000 },
    );
    const a = page.locator('[data-conversation-view="a"]'),
      b = page.locator('[data-conversation-view="b"]');
    await expect(a.getByTestId("message-thread-panel")).toContainText(
      "Release plan for pane A",
    );
    await expect(b.getByTestId("message-thread-panel")).toContainText(
      "Design decisions for pane B",
    );
    await a.getByRole("button", { name: "Page", exact: true }).first().click();
    const pageA = a.getByRole("region", { name: "Channel Page", exact: true });
    await expect(pageA).toBeVisible();
    await expect(
      b.getByRole("region", { name: "Channel Page", exact: true }),
    ).toHaveCount(0);
    await pageA
      .getByRole("button", { name: /^(Create Page|Edit HTML)$/ })
      .click();
    await pageA.locator("textarea").fill("<h1>Unsaved Page A</h1>");
    await b.getByRole("button", { name: "Page", exact: true }).first().click();
    const pageB = b.getByRole("region", { name: "Channel Page", exact: true });
    await expect(pageB).toBeVisible();
    await expect(pageB.locator("textarea")).toHaveCount(0);
    await expect(pageA.locator("textarea")).toHaveValue(
      "<h1>Unsaved Page A</h1>",
    );
    const ids = await page.evaluate(() => {
      const state = window.layoutSnapshot();
      return {
        a: state.root.children.find((pane) => pane.viewInstanceId === "a"),
        b: state.root.children.find((pane) => pane.viewInstanceId === "b"),
        channel: state.views.a.channelId,
      };
    });
    assert.equal(
      await page.evaluate((id) => window.requestPaneClose(id), ids.a.id),
      false,
    );
    assert.equal(
      await page.evaluate(
        ({ a, channel }) =>
          window.requestPaneNavigate(a.viewInstanceId, channel),
        ids,
      ),
      false,
    );
    await a.getByRole("button", { name: "Close panel", exact: true }).click();
    await expect(pageA.locator("textarea")).toHaveValue(
      "<h1>Unsaved Page A</h1>",
    );
    await b.getByRole("button", { name: "Close panel", exact: true }).click();
    await expect(pageB).toHaveCount(0);
    await expect(b.getByTestId("message-thread-panel")).toContainText(
      "Design decisions for pane B",
    );
    await pageA.getByRole("button", { name: "Cancel", exact: true }).click();
    await a.getByRole("button", { name: "Close panel", exact: true }).click();
    await expect(pageA).toHaveCount(0);
    await expect(a.getByTestId("message-thread-panel")).toContainText(
      "Release plan for pane A",
    );
    await page.setViewportSize({ width: 1024, height: 1100 });
    await a.getByRole("button", { name: "Page", exact: true }).first().click();
    await expect(pageA).toBeVisible();
    await expect(
      a
        .getByRole("button", { name: "Conversation pane options", exact: true })
        .first(),
    ).toBeVisible();
    await expect(a.getByText(/^Page ·/)).toBeVisible();
    await expect(b).toBeVisible();
    const shots = process.env.BUZZ_PAGE_PANE_SCREENSHOTS;
    if (shots) {
      fs.mkdirSync(shots, { recursive: true });
      await page.screenshot({
        path: path.join(shots, "page-narrow-sibling.png"),
      });
    }
    const writes = await page.evaluate(() =>
      (window.__BUZZ_E2E_COMMAND_PAYLOADS__ ?? []).flatMap((entry) => {
        if (entry.command === "send_channel_message") return [entry.payload];
        if (entry.command !== "plugin:websocket|send") return [];
        try {
          const packet = JSON.parse(entry.payload.message.data);
          return packet[0] === "EVENT" && [9, 40004].includes(packet[1]?.kind)
            ? [packet[1]]
            : [];
        } catch {
          return [];
        }
      }),
    );
    assert.deepEqual(
      writes,
      [],
      "open/close/edit/cancel/narrow/restore never publishes a Page or message",
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS Page per-view isolation, unsaved editor target guards, independent sibling close, original thread restoration, narrow controls/title and zero Page/message publishes. Chrome sandbox ON, mock IPC/signing.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
