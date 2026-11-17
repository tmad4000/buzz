const assert = require("node:assert/strict");
const { chromium, expect: baseExpect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const origin = process.env.BUZZ_HOST_FIXTURE_ORIGIN;
if (!origin)
  throw new Error("Set BUZZ_HOST_FIXTURE_ORIGIN to the task-owned Vite origin");
const shots =
  process.env.BUZZ_HOST_FIXTURE_SCREENSHOTS ??
  "test-results/send-to-thread-hosts";
fs.mkdirSync(shots, { recursive: true });
const expect = baseExpect.configure({ timeout: 30000 });
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
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(
      `${origin}/tests/fixtures/full-conversation-hosts.html?routing`,
    );
    const a = page.locator("[data-conversation-view=a]"),
      b = page.locator("[data-conversation-view=b]");
    const ta = a.getByTestId("message-thread-panel"),
      tb = b.getByTestId("message-thread-panel");
    await expect(ta).toContainText("Release plan for pane A");
    await expect(tb).toContainText("Design decisions for pane B");
    const bBranch = tb.locator(
      `[data-testid="sidebar-read-branch"][data-thread-head-id="${"2".repeat(64)}"]`,
    );
    // Smart may already reveal this direct reply; open only a collapsed branch.
    // The visibility assertion below still requires the sibling reply to render.
    if (await bBranch.count()) await bBranch.click();
    await expect(tb).toContainText("Reply belonging to the design discussion");
    const sends = () =>
      page.evaluate(() =>
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
      (await sends()).length,
      0,
      "mount and persisted restore cannot send through REST or WS",
    );
    await tb
      .getByTestId("message-input")
      .fill("Sibling thread draft remains independent");
    await ta.getByRole("button", { name: "Close panel", exact: true }).click();
    const main = (pane) =>
      pane
        .getByTestId("message-composer")
        .filter({ has: page.getByTestId("send-to-thread") });
    const mainA = main(a);
    await expect(mainA).toBeVisible();
    const inlineBefore = await a
      .locator(
        '[data-testid="message-thread-summary"][data-thread-head-id="' +
          "1".repeat(64) +
          '"]',
      )
      .getAttribute("aria-expanded");
    await mainA
      .getByTestId("message-input")
      .fill("Release plan routing stays captured");
    await mainA.getByTestId("send-to-thread").focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu", { name: "Thread destinations" });
    await expect(menu).toBeVisible();
    assert.equal((await sends()).length, 0, "keyboard open cannot send");
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    assert.equal((await sends()).length, 0, "Escape cannot send");
    // Capture the lock transition before clicking: a sibling focus round-trip
    // can outlast the mocked publish, so current state alone is timing-dependent.
    await mainA.evaluate((form) => {
      window.hostRoutingLockStates = [];
      window.hostRoutingLockObserver = new MutationObserver(() => {
        window.hostRoutingLockStates.push(
          form.getAttribute("data-submit-locked"),
        );
      });
      window.hostRoutingLockObserver.observe(form, {
        attributes: true,
        attributeFilter: ["data-submit-locked"],
      });
    });
    await mainA.getByTestId("send-to-thread").click();
    await menu.locator(`[data-thread-destination="${"1".repeat(64)}"]`).click();
    await tb.getByTestId("message-input").focus();
    await expect
      .poll(() => page.evaluate(() => window.hostRoutingLockStates))
      .toContain("true");
    await expect(mainA.getByTestId("message-input")).toBeEmpty();
    await expect(mainA).toHaveAttribute("data-submit-locked", "false");
    await page.evaluate(() => window.hostRoutingLockObserver.disconnect());
    assert.equal((await sends()).length, 1);
    const first = (await sends())[0];
    assert.equal(first.parentEventId, "1".repeat(64));
    assert.ok(first.channelId);
    await expect(tb).toContainText("Design decisions for pane B");
    await expect(tb.getByTestId("message-input")).toHaveText(
      "Sibling thread draft remains independent",
    );
    await expect(tb).toContainText("Reply belonging to the design discussion");
    assert.equal(
      await a
        .locator(
          '[data-testid="message-thread-summary"][data-thread-head-id="' +
            "1".repeat(64) +
            '"]',
        )
        .getAttribute("aria-expanded"),
      inlineBefore,
      "routing must not change inline expansion",
    );
    await tb.getByRole("button", { name: "Close panel", exact: true }).click();
    await mainA
      .getByTestId("message-input")
      .fill("Shared draft survives picker takeover");
    await expect(b.locator("[data-draft-preview]")).toContainText(
      "Shared draft survives picker takeover",
    );
    await expect(b.getByTestId("send-to-thread")).toHaveCount(0);
    // Retain the actual picker callback from the mounted React component. This
    // test-only introspection adds no runtime seam or command replay mechanism.
    await mainA.getByTestId("send-to-thread").evaluate((button) => {
      const key = Object.keys(button).find((name) =>
        name.startsWith("__reactFiber$"),
      );
      if (!key) throw new Error("Missing React fiber test seam");
      let fiber = button[key];
      while (fiber) {
        const props = fiber.memoizedProps;
        if (
          typeof props?.onPick === "function" &&
          typeof props?.getDraft === "function"
        ) {
          window.retainedRoutingPick = props.onPick;
          return;
        }
        fiber = fiber.return;
      }
      throw new Error("Must capture real SendToThreadPicker onPick");
    });
    await mainA.getByTestId("send-to-thread").click();
    await expect(menu).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: path.join(shots, "owner-picker-preview.png"),
    });
    await b.getByRole("button", { name: "Take over", exact: true }).click();
    const mainB = main(b);
    await expect(mainB.getByTestId("message-input")).toHaveText(
      "Shared draft survives picker takeover",
    );
    await expect(mainB.getByTestId("message-input")).toBeFocused();
    await expect(a.getByTestId("message-input")).toHaveCount(0);
    await expect(a.getByTestId("send-to-thread")).toHaveCount(0);
    await expect(menu).toHaveCount(0);
    await page.evaluate(() => window.retainedRoutingPick("1".repeat(64)));
    assert.equal(
      (await sends()).length,
      1,
      "stale real picker callback after takeover cannot send",
    );
    await expect(mainB.getByTestId("message-input")).toHaveText(
      "Shared draft survives picker takeover",
    );
    await page.screenshot({
      fullPage: true,
      path: path.join(shots, "takeover-resets-picker.png"),
    });
    // Deferred attachment preparation and a failed publish use the same real
    // pipeline as normal Send, and retry still needs an explicit new pick.
    await page.evaluate(() => {
      window.__BUZZ_E2E__.mock.sendMessageErrors = [
        "routing integration offline",
      ];
    });
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      mainB.getByRole("button", { name: "Attach file", exact: true }).click(),
    ]);
    await chooser.setFiles({
      buffer: Buffer.from("routing receipt"),
      mimeType: "application/pdf",
      name: "routing-receipt.pdf",
    });
    await expect(mainB).toContainText("routing-receipt.pdf");
    const inactiveTakeover = a
      .locator("[data-draft-preview]")
      .filter({ hasText: "Shared draft survives picker takeover" })
      .getByRole("button", { name: "Take over", exact: true });
    await inactiveTakeover.evaluate((button) => {
      window.hostTakeoverDisabledStates = [];
      window.hostTakeoverObserver = new MutationObserver(() => {
        window.hostTakeoverDisabledStates.push(button.disabled);
      });
      window.hostTakeoverObserver.observe(button, {
        attributes: true,
        attributeFilter: ["disabled"],
      });
    });
    await mainB.getByTestId("send-to-thread").click();
    await menu.locator(`[data-thread-destination="${"1".repeat(64)}"]`).click();
    await expect
      .poll(() => page.evaluate(() => window.hostTakeoverDisabledStates))
      .toContain(true);
    await page.evaluate(() => window.hostTakeoverObserver.disconnect());
    await expect(
      page.getByText("routing integration offline", { exact: false }),
    ).toBeVisible();
    await expect(mainB.getByTestId("message-input")).toHaveText(
      "Shared draft survives picker takeover",
    );
    await expect(mainB).toContainText("routing-receipt.pdf");
    await expect(
      a
        .locator("[data-draft-preview]")
        .filter({ hasText: "Shared draft survives picker takeover" })
        .getByRole("button", { name: "Take over", exact: true }),
    ).toBeEnabled();
    assert.equal(
      (await sends()).length,
      2,
      "failure is one attempt, no implicit retry",
    );
    await mainB.getByTestId("send-to-thread").click();
    await menu.locator(`[data-thread-destination="${"1".repeat(64)}"]`).click();
    await expect(mainB).toHaveAttribute("data-submit-locked", "false");
    await expect(mainB.getByTestId("message-input")).toBeEmpty();
    const calls = await sends();
    assert.equal(
      calls.length,
      3,
      "one initial reply, one failed attempt, one explicit retry",
    );
    for (const call of calls) {
      assert.equal(call.parentEventId, "1".repeat(64));
      assert.equal(call.channelId, first.channelId);
    }
    assert.ok(
      calls[2].mediaTags?.some((tag) => tag[0] === "imeta"),
      "attachment tags must survive failure/retry",
    );
    await b
      .locator(
        `[data-testid="open-thread-side-panel"][data-thread-head-id="${"2".repeat(64)}"]`,
      )
      .click();
    await expect(tb).toContainText("Design decisions for pane B");
    await expect(tb.getByTestId("message-input")).toHaveText(
      "Sibling thread draft remains independent",
    );
    // Explicitly reveal the sibling's history if the panel reopened collapsed;
    // routing itself was already checked above to preserve its visible branch.
    if (await bBranch.count()) await bBranch.click();
    await expect(tb).toContainText("Reply belonging to the design discussion");
    await page.screenshot({
      fullPage: true,
      path: path.join(shots, "routed-attachment-sibling-draft.png"),
    });
    assert.deepEqual(errors, []);
    console.log(
      "PASS actual shared-channel hosts: owner-only picker; keyboard/Escape/mount/restore/takeover zero REST+WS sends; retained actual picker callback after takeover sends0; exact parent/channel once despite sibling focus; independent thread draft and inline state preserved; synchronous ownership lock; deferred attachment failure/recovery and explicit retry retain imeta. Mock bridge, sandboxed Linux Chrome; no native/live relay acceptance.",
    );
  } catch (error) {
    const page = browser.contexts()[0]?.pages()[0];
    if (page)
      await page.screenshot({
        fullPage: true,
        path: path.join(shots, "failure.png"),
      });
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
