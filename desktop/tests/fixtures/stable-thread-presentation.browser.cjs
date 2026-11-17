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
      viewport: { width: 1440, height: 1000 },
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(
      `${origin}/tests/fixtures/full-conversation-hosts.html?layout=1&single=1`,
    );
    const a = page.locator("[data-conversation-view=a]");
    const threadA = a.getByTestId("message-thread-panel");
    await expect(threadA).toContainText("Release plan for pane A");
    const editorA = threadA.getByTestId("message-input");
    await editorA.fill("Editor and draft survive responsive duplication");
    await page.evaluate(() => {
      window.stableOriginalEditor = document.querySelector(
        "[data-conversation-view=a] [data-testid=message-thread-panel] [data-testid=message-input]",
      );
    });
    const sameEditor = async () =>
      assert.equal(
        await page.evaluate(
          () =>
            window.stableOriginalEditor ===
            document.querySelector(
              "[data-conversation-view=a] [data-testid=message-thread-panel] [data-testid=message-input]",
            ),
        ),
        true,
        "source editor node must remain mounted",
      );
    await a
      .getByRole("button", { name: "Conversation pane options", exact: true })
      .click();
    await page
      .getByRole("menuitem", {
        name: "Open conversation to the right",
        exact: true,
      })
      .click();
    await expect(page.locator("[data-conversation-view]")).toHaveCount(2);
    await sameEditor();
    await expect(editorA).toHaveText(
      "Editor and draft survive responsive duplication",
    );
    const newId = await page.evaluate(() =>
      Object.keys(window.layoutSnapshot().views).find((id) => id !== "a"),
    );
    const duplicate = page.locator(`[data-conversation-view="${newId}"]`);
    await expect(
      duplicate
        .getByTestId("message-thread-panel")
        .locator("[data-draft-preview]"),
    ).toContainText("Editor and draft survive responsive duplication");
    await expect(duplicate.getByTestId("message-input")).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.activeElement.closest("[data-conversation-view]")?.dataset
              .conversationView,
        ),
      )
      .toBe(newId);
    await page.setViewportSize({ width: 1900, height: 1000 });
    await expect(
      a.getByRole("button", { name: "Expand thread", exact: true }),
    ).toBeVisible();
    await sameEditor();
    await a.getByRole("button", { name: "Expand thread", exact: true }).click();
    await expect(a.getByTestId("focus-thread-drawer-overlay")).toBeVisible();
    if (process.env.BUZZ_HOST_FIXTURE_SCREENSHOTS) {
      fs.mkdirSync(process.env.BUZZ_HOST_FIXTURE_SCREENSHOTS, {
        recursive: true,
      });
      await page.mouse.move(0, 0);
      await page.waitForTimeout(350);
      await page.screenshot({
        path: path.join(
          process.env.BUZZ_HOST_FIXTURE_SCREENSHOTS,
          "focused-stable-composer.png",
        ),
      });
    }
    await sameEditor();
    await expect(editorA).toHaveText(
      "Editor and draft survive responsive duplication",
    );
    await expect(
      duplicate
        .getByTestId("message-thread-panel")
        .locator("[data-draft-preview]"),
    ).toContainText("Editor and draft survive responsive duplication");
    await expect(
      a.getByTestId("focus-thread-drawer").getByRole("button", {
        name: "Conversation pane options",
        exact: true,
      }),
    ).toBeVisible();
    await a
      .getByRole("button", { name: "Show thread beside channel", exact: true })
      .click();
    await expect(a.getByTestId("focus-thread-drawer-overlay")).toHaveCount(0);
    await sameEditor();
    await page.setViewportSize({ width: 1024, height: 1000 });
    await expect(
      a.getByRole("button", { name: "Expand thread", exact: true }),
    ).toHaveCount(0);
    await sameEditor();
    await expect(editorA).toHaveText(
      "Editor and draft survive responsive duplication",
    );
    await page.setViewportSize({ width: 1900, height: 1000 });
    await expect(
      a.getByRole("button", { name: "Expand thread", exact: true }),
    ).toBeVisible();
    await sameEditor();
    await duplicate
      .getByTestId("message-thread-panel")
      .getByRole("button", { name: "Take over", exact: true })
      .click();
    await expect(
      duplicate
        .getByTestId("message-thread-panel")
        .getByTestId("message-input"),
    ).toHaveText("Editor and draft survive responsive duplication");
    await expect(threadA.locator("[data-draft-preview]")).toContainText(
      "Editor and draft survive responsive duplication",
    );
    await threadA
      .getByRole("button", { name: "Close panel", exact: true })
      .click();
    await expect(duplicate.getByTestId("message-thread-panel")).toContainText(
      "Release plan for pane A",
    );
    await expect(
      duplicate
        .getByTestId("message-thread-panel")
        .getByTestId("message-input"),
    ).toHaveText("Editor and draft survive responsive duplication");
    const sends = await page.evaluate(() =>
      (window.__BUZZ_E2E_COMMAND_PAYLOADS__ ?? []).filter(
        (event) => event.command === "send_channel_message",
      ),
    );
    assert.equal(sends.length, 0);
    assert.deepEqual(errors, []);
    console.log(
      "PASS actual scoped composer node and draft survive dock/full-leaf/focus transitions and same-chat menu split; duplicate stays read-only until explicit takeover; local close preserves sibling; zero sends. Chrome sandbox on, mock signing/IPC; no native.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
