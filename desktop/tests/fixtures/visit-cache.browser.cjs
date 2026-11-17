const assert = require("node:assert/strict");
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
      viewport: { width: 1440, height: 1000 },
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(
      `${origin}/tests/fixtures/full-conversation-hosts.html?layout=1`,
    );
    const a = page.locator("[data-conversation-view=a]");
    const b = page.locator("[data-conversation-view=b]");
    await expect(a.getByTestId("message-thread-panel")).toContainText(
      "Release plan for pane A",
    );
    await expect(b.getByTestId("message-thread-panel")).toContainText(
      "Design decisions for pane B",
    );
    const original = await page.evaluate(
      () => window.layoutSnapshot().views.a.channelId,
    );
    const dm = await page.evaluate(async () => {
      const { getChannels } = await import("/src/shared/api/tauriChannels.ts");
      return (await getChannels(null)).channels.find(
        (channel) => channel.channelType === "dm",
      ).id;
    });
    const siblingEditor = b
      .getByTestId("message-thread-panel")
      .getByTestId("message-input");
    await siblingEditor.fill("Sibling draft survives A navigation");
    await page.evaluate(() => {
      window.siblingEditorBefore = document.querySelector(
        "[data-conversation-view=b] [data-testid=message-thread-panel] [data-testid=message-input]",
      );
    });
    assert.equal(
      await page.evaluate((dm) => window.requestPaneNavigate("a", dm), dm),
      true,
    );
    await expect(a.getByTestId("message-thread-panel")).toHaveCount(0);
    assert.equal(
      await page.evaluate(
        (id) => window.requestPaneNavigate("a", id),
        original,
      ),
      true,
    );
    await expect(a.getByTestId("message-thread-panel")).toContainText(
      "Release plan for pane A",
    );
    await expect(b.getByTestId("message-thread-panel")).toContainText(
      "Design decisions for pane B",
    );
    await expect(siblingEditor).toHaveText(
      "Sibling draft survives A navigation",
    );
    assert.equal(
      await page.evaluate(
        () =>
          window.siblingEditorBefore ===
          document.querySelector(
            "[data-conversation-view=b] [data-testid=message-thread-panel] [data-testid=message-input]",
          ),
      ),
      true,
    );
    const views = await page.evaluate(() => window.layoutSnapshot().views);
    assert.equal(views.a.panelState.thread, "1".repeat(64));
    assert.equal(views.b.panelState.thread, "2".repeat(64));
    assert.equal(
      await page.evaluate(
        () =>
          (window.__BUZZ_E2E_COMMAND_PAYLOADS__ ?? []).filter(
            (entry) => entry.command === "send_channel_message",
          ).length,
      ),
      0,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS production controller + real ChannelScreen A→DM→A restores own thread; sibling thread/editor DOM/draft preserved; zero sends; sandbox on. Fixture navigation callback, not production URL/workspace acceptance.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
