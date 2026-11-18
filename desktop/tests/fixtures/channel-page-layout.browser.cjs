const assert = require("node:assert/strict");
const { chromium, expect } = require("@playwright/test");

const origin = process.env.BUZZ_HOST_FIXTURE_ORIGIN;
if (!origin)
  throw new Error("Set BUZZ_HOST_FIXTURE_ORIGIN to the Vite origin.");

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.BUZZ_CHROME_PATH,
    chromiumSandbox: true,
  });
  try {
    for (const host of ["stream", "dm", "forum", "focus"]) {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 800 },
      });
      await page.goto(
        `${origin}/tests/fixtures/full-conversation-hosts.html?pageHost=${host}`,
      );
      await page.getByRole("button", { name: "Page", exact: true }).click();
      const section = page.getByRole("region", { name: "Channel Page" });
      const iframe = section.locator("iframe");
      await iframe
        .contentFrame()
        .getByRole("heading", { name: "Shared page" })
        .waitFor();
      if (host === "focus") {
        await page
          .getByTestId("focus-thread-drawer")
          .getByRole("region", { name: "Channel Page" })
          .waitFor();
      }
      const { height, bodyHeight } = await iframe.evaluate((frame) => {
        const body = frame.parentElement.parentElement;
        const style = getComputedStyle(body);
        return {
          height: frame.getBoundingClientRect().height,
          bodyHeight:
            body.clientHeight -
            parseFloat(style.paddingTop) -
            parseFloat(style.paddingBottom),
        };
      });
      assert.ok(
        height >= bodyHeight * 0.85,
        `${host}: iframe ${height}px; panel body ${bodyHeight}px`,
      );
      console.log(`${host}: iframe ${height}px; panel body ${bodyHeight}px`);
      const expand = section.getByRole("button", { name: "Expand" });
      const restore = section.getByRole("button", { name: "Restore" });
      const frame = await iframe.elementHandle();
      const dockedWidth = (await section.boundingBox()).width;
      await expand.click();
      await expect(restore).toBeVisible();
      await expect
        .poll(async () => (await section.boundingBox()).width)
        .toBeGreaterThan(dockedWidth + 20);
      assert.ok(await frame.evaluate((element) => element.isConnected));
      const control = iframe
        .contentFrame()
        .getByRole("button", { name: "Page control" });
      await control.press("Escape");
      await expect(expand).toBeVisible();
      await control.press("Meta+Shift+f");
      await expect(restore).toBeVisible();
      await section.getByRole("button", { name: "Edit HTML" }).click();
      const editor = section.getByRole("textbox");
      await editor.fill("<h1>Unsaved draft</h1>");
      await editor.press("Escape");
      await expect(expand).toBeVisible();
      await expect(editor).toHaveValue("<h1>Unsaved draft</h1>");
      await section.getByRole("button", { name: "Cancel" }).click();
      await page.setViewportSize({ width: 580, height: 800 });
      await expect(expand).toHaveCount(0);
      await page.close();
    }
  } finally {
    await browser.close();
  }
})();
