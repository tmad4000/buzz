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
      viewport: { width: 1600, height: 1000 },
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${origin}/tests/fixtures/full-conversation-hosts.html`);
    const a = page.locator("[data-conversation-view=a]"),
      b = page.locator("[data-conversation-view=b]");
    await expect(a.getByTestId("message-thread-panel")).toContainText(
      "Release plan for pane A",
    );
    await expect(b.getByTestId("message-thread-panel")).toContainText(
      "Design decisions for pane B",
    );
    const handle = a.getByTestId("right-auxiliary-pane-resize-handle");
    await expect(handle).toBeVisible();
    const box = await handle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x - 300, box.y + 100);
    await page.mouse.up();
    const maxWidth = (await a.getByTestId("message-thread-panel").boundingBox())
      .width;
    const paneWidth = (await a.boundingBox()).width;
    assert.ok(
      maxWidth >= 320 && paneWidth - maxWidth >= 400,
      "docked chat/thread minima",
    );
    assert.ok(maxWidth <= paneWidth - 408 + 1, "chat plus gutter reserved");
    const box2 = await handle.boundingBox();
    await page.mouse.move(box2.x + box2.width / 2, box2.y + 100);
    await page.mouse.down();
    await page.mouse.move(box2.x + 400, box2.y + 100);
    await page.mouse.up();
    await expect
      .poll(async () =>
        Math.round(
          (await a.getByTestId("message-thread-panel").boundingBox()).width,
        ),
      )
      .toBe(320);
    await page.setViewportSize({ width: 1400, height: 1000 });
    await expect(handle).toHaveCount(0);
    await expect
      .poll(async () => {
        const p = await a.boundingBox(),
          t = await a.getByTestId("message-thread-panel").boundingBox();
        return Math.abs(p.width - t.width) < 1 && Math.abs(p.x - t.x) < 1;
      })
      .toBe(true);
    await expect(b.getByTestId("message-thread-panel")).toContainText(
      "Design decisions for pane B",
    );
    await page.setViewportSize({ width: 1520, height: 1000 });
    await expect(handle).toBeVisible();
    assert.ok(
      (await a.getByTestId("message-thread-panel").boundingBox()).width >= 320,
    );
    assert.equal(
      await page.evaluate(
        () =>
          (window.__BUZZ_E2E_COMMAND_PAYLOADS__ ?? []).filter(
            (e) => e.command === "send_channel_message",
          ).length,
      ),
      0,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS actual scoped leaf geometry: 800 dock, 320 thread minimum, chat400+gutter reserve, 700 full-leaf fallback and 760 dock boundary, sibling retained, zero sends; sandbox on.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
