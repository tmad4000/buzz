const assert = require("node:assert/strict");
const { chromium, expect: baseExpect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const expect = baseExpect.configure({ timeout: 30000 });
const origin = process.env.BUZZ_HOST_FIXTURE_ORIGIN;
if (!origin) throw new Error("Set BUZZ_HOST_FIXTURE_ORIGIN");
const shots = process.env.BUZZ_HOST_FIXTURE_SCREENSHOTS;
if (shots) fs.mkdirSync(shots, { recursive: true });
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
    const shot = async (name) => {
      if (!shots) return;
      await page.mouse.move(0, 0);
      await page.waitForTimeout(350); // Let the real panel transition settle before critique captures.
      await page.screenshot({ path: path.join(shots, name) });
    };
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
    const editor = a
      .getByTestId("message-thread-panel")
      .getByTestId("message-input");
    await editor.fill("Retained layout draft A");
    await page.evaluate(() => {
      window.layoutEditorBefore = document.querySelector(
        "[data-conversation-view=a] [data-testid=message-thread-panel] [data-testid=message-input]",
      );
    });
    await a
      .getByRole("button", { name: "Conversation pane options", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Swap panes", exact: true })
      .click();
    assert.equal(
      await page.evaluate(
        () =>
          window.layoutEditorBefore ===
          document.querySelector(
            "[data-conversation-view=a] [data-testid=message-thread-panel] [data-testid=message-input]",
          ),
      ),
      true,
    );
    await expect(editor).toHaveText("Retained layout draft A");
    const separator = page.getByRole("separator", {
      name: "Resize conversations",
    });
    await separator.focus();
    await page.keyboard.press("ArrowRight");
    await expect(separator).toHaveAttribute("aria-valuenow", "55");
    await separator.dblclick();
    await expect(separator).toHaveAttribute("aria-valuenow", "50");
    const dividerBox = await separator.boundingBox();
    await page.mouse.move(
      dividerBox.x + dividerBox.width / 2,
      dividerBox.y + 100,
    );
    await page.mouse.down();
    await page.mouse.move(dividerBox.x + 80, dividerBox.y + 100);
    await page.mouse.up();
    assert.ok(Number(await separator.getAttribute("aria-valuenow")) > 50);
    await separator.dblclick();
    await a
      .getByRole("button", { name: "Conversation pane options", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Stack conversations", exact: true })
      .click();
    await expect(separator).toHaveAttribute("aria-orientation", "horizontal");
    await expect(editor).toHaveText("Retained layout draft A");
    await shot("layout-stacked-1440.png");
    await a
      .getByRole("button", { name: "Conversation pane options", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Place side by side", exact: true })
      .click();
    await expect(separator).toHaveAttribute("aria-orientation", "vertical");
    await shot("layout-1440.png");
    await page.setViewportSize({ width: 1024, height: 1000 });
    await expect(
      a.getByRole("button", { name: "Conversation pane options", exact: true }),
    ).toBeVisible();
    await expect(
      b.getByRole("button", { name: "Conversation pane options", exact: true }),
    ).toBeVisible();
    await expect
      .poll(
        async () => {
          const paneBox = await a.boundingBox();
          const threadBox = await a
            .getByTestId("message-thread-panel")
            .boundingBox();
          return (
            threadBox.x >= paneBox.x - 1 &&
            threadBox.x + threadBox.width <= paneBox.x + paneBox.width + 1
          );
        },
        { message: "narrow thread stays inside owning leaf" },
      )
      .toBe(true);
    await shot("layout-1024.png");
    const saved = await page.evaluate(() =>
      JSON.stringify(window.layoutSnapshot().root),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("toolbar", { name: "Open conversations" }),
    ).toBeVisible();
    await expect(page.locator("[data-layout-view]:not([hidden])")).toHaveCount(
      1,
    );
    assert.equal(
      await page.evaluate(() => JSON.stringify(window.layoutSnapshot().root)),
      saved,
    );
    await shot("layout-390.png");
    await page
      .getByRole("toolbar", { name: "Open conversations" })
      .getByRole("button", { name: "General b", exact: true })
      .click();
    await expect(b).toBeVisible();
    await expect(a).toBeHidden();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(a).toBeVisible();
    await expect(b).toBeVisible();
    await expect(editor).toHaveText("Retained layout draft A");
    assert.equal(
      await page.evaluate(() => JSON.stringify(window.layoutSnapshot().root)),
      saved,
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
      "PASS real hosts in layout surface: swap preserves editor node/draft, keyboard/reset divider, leaf-local narrow thread, 1440/1024/390 compact/restored snapshot, zero sends; sandbox on. Fixture controller only, no sidebar/dnd/URL/storage integration claim.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
