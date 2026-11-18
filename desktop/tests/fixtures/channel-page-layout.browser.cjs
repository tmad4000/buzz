const assert = require("node:assert/strict");
const { chromium } = require("@playwright/test");

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
      await page.close();
    }
  } finally {
    await browser.close();
  }
})();
