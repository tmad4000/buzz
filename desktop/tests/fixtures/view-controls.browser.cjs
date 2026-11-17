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
      viewport: { width: 1900, height: 1000 },
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${origin}/tests/fixtures/full-conversation-hosts.html`);
    const a = page.locator("[data-conversation-view=a]");
    const b = page.locator("[data-conversation-view=b]");
    await expect(a.getByTestId("message-thread-panel")).toContainText(
      "Release plan for pane A",
    );
    await expect(b.getByTestId("message-thread-panel")).toContainText(
      "Design decisions for pane B",
    );
    await a.getByRole("button", { name: "Expand thread", exact: true }).click();
    await expect(a.getByTestId("focus-thread-drawer-overlay")).toBeVisible();
    await expect(b.getByTestId("focus-thread-drawer-overlay")).toHaveCount(0);
    await expect(
      b.getByRole("button", { name: "Expand thread", exact: true }),
    ).toBeVisible();
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem("buzz.channels.threadViewMode"),
      ),
      null,
    );
    await b.getByRole("button", { name: "Expand thread", exact: true }).click();
    await expect(b.getByTestId("focus-thread-drawer-overlay")).toBeVisible();
    await expect(a.getByTestId("focus-thread-drawer-overlay")).toBeVisible();
    assert.equal(
      await page.evaluate(
        () =>
          document.activeElement.closest("[data-conversation-view]")?.dataset
            .conversationView,
      ),
      "b",
    );
    await page.keyboard.press("Escape");
    await expect(b.getByTestId("focus-thread-drawer-overlay")).toHaveCount(0);
    await expect(a.getByTestId("focus-thread-drawer-overlay")).toBeVisible();
    await expect(a.getByTestId("message-thread-panel")).toContainText(
      "Release plan for pane A",
    );
    const sends = await page.evaluate(() =>
      (window.__BUZZ_E2E_COMMAND_PAYLOADS__ ?? []).filter(
        (e) => e.command === "send_channel_message",
      ),
    );
    assert.equal(sends.length, 0);
    assert.deepEqual(errors, []);
    console.log(
      "PASS actual two-host mode independence, owning-view focus/Escape, sibling state and zero sends; sandbox enabled",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
