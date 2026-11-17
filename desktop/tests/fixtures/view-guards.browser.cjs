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
    await page.goto(
      `${origin}/tests/fixtures/full-conversation-hosts.html?layout=1&single=1&routing=1`,
      { timeout: 90000 },
    );
    const a = page.locator('[data-conversation-view="a"]');
    await a
      .getByTestId("message-thread-panel")
      .getByRole("button", { name: "Close panel", exact: true })
      .click();
    const main = a
      .getByTestId("channel-composer-overlay")
      .getByTestId("message-input");
    await main.fill("Main edit must survive background pane replacement");
    await main.press("Enter");
    const row = a
      .getByTestId("message-timeline")
      .getByTestId("message-row")
      .filter({
        hasText: "Main edit must survive background pane replacement",
      });
    await row.hover();
    await row.getByRole("button", { name: "More actions" }).click();
    await page
      .getByRole("menuitem", { name: "Edit message", exact: true })
      .click();
    await expect(a.getByTestId("edit-target")).toBeVisible();
    await main.fill("Uncommitted main edit remains in A");
    await a
      .getByRole("button", { name: "Conversation pane options", exact: true })
      .click();
    await page
      .getByRole("menuitem", {
        name: "Open conversation to the right",
        exact: true,
      })
      .click();
    const b = page.locator(
      '[data-conversation-view]:not([data-conversation-view="a"])',
    );
    await expect(
      b.getByTestId("channel-composer-overlay").locator("[data-draft-preview]"),
    ).toBeVisible();
    const ids = await page.evaluate(() => {
      const state = window.layoutSnapshot();
      return {
        a: state.root.children.find((pane) => pane.viewInstanceId === "a"),
        b: state.root.children.find((pane) => pane.viewInstanceId !== "a"),
        channelId: state.views.a.channelId,
      };
    });
    await b
      .getByRole("button", { name: "Conversation pane options", exact: true })
      .click();
    await page.keyboard.press("Escape");
    const before = await page.evaluate(() =>
      JSON.stringify(window.layoutSnapshot()),
    );
    assert.equal(
      await page.evaluate((id) => window.requestPaneClose(id), ids.a.id),
      false,
    );
    assert.equal(
      await page.evaluate(
        ({ a, channelId }) =>
          window.requestPaneNavigate(a.viewInstanceId, channelId),
        ids,
      ),
      false,
    );
    assert.equal(
      await page.evaluate(() => JSON.stringify(window.layoutSnapshot())),
      before,
    );
    await expect(main).toHaveText("Uncommitted main edit remains in A");
    assert.equal(
      await page.evaluate((id) => window.requestPaneClose(id), ids.b.id),
      true,
      "unrelated preview pane may close",
    );
    await a
      .getByRole("button", { name: "Conversation pane options", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Restore split", exact: true })
      .click();
    await a
      .getByTestId("edit-target")
      .getByRole("button", { name: /cancel/i })
      .click();
    await expect(a.getByTestId("edit-target")).toHaveCount(0);
    assert.equal(
      await page.evaluate((id) => window.requestPaneClose(id), ids.a.id),
      true,
    );
    await expect(a).toHaveCount(0);
    await b
      .getByRole("button", { name: "Conversation pane options", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Restore split", exact: true })
      .click();
    const pendingComposer = b
      .getByTestId("channel-composer-overlay")
      .getByTestId("message-composer");
    await pendingComposer
      .getByTestId("message-input")
      .fill("Canonical pending send survives owner pane close");
    await pendingComposer.getByTestId("send-to-thread").click();
    await page
      .getByRole("menu", { name: "Thread destinations" })
      .locator(`[data-thread-destination="${"1".repeat(64)}"]`)
      .click();
    await expect(pendingComposer).toHaveAttribute("data-submit-locked", "true");
    assert.equal(
      await page.evaluate((id) => window.requestPaneClose(id), ids.b.id),
      true,
      "canonical pending send must not pin owner pane",
    );
    await expect(b).toHaveCount(0);
    await expect(a).toContainText(
      "Canonical pending send survives owner pane close",
    );
    const sends = await page.evaluate(() =>
      (window.__BUZZ_E2E_COMMAND_PAYLOADS__ ?? []).flatMap((entry) => {
        if (entry.command === "send_channel_message") return [entry.payload];
        if (entry.command !== "plugin:websocket|send") return [];
        try {
          const message = JSON.parse(entry.payload.message.data);
          return message[0] === "EVENT" && message[1]?.kind === 9
            ? [message[1]]
            : [];
        } catch {
          return [];
        }
      }),
    );
    assert.equal(
      sends.length,
      2,
      "only two explicit sends; close/replace/restore/cancel never sends",
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS production main-composer edit guard survives background focus; target close/replace blocked, unrelated preview close allowed; restore retains editor, cancel then close allowed; canonical pending send survives owner close; two explicit sends and zero guard-transition sends. Chrome sandbox ON, mock IPC/signing.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
