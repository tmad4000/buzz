const assert = require("node:assert/strict");
const { chromium, expect: baseExpect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const origin = process.env.BUZZ_HOST_FIXTURE_ORIGIN;
if (!origin)
  throw new Error(
    "Set BUZZ_HOST_FIXTURE_ORIGIN to the task-owned Vite origin.",
  );
const shots =
  process.env.BUZZ_HOST_FIXTURE_SCREENSHOTS ??
  "test-results/conversation-hosts";
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
    const fatalConsole = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (
        m.type() === "error" &&
        !m.text().startsWith("Failed to load resource:")
      )
        fatalConsole.push(m.text());
    });
    await page.goto(`${origin}/tests/fixtures/full-conversation-hosts.html`);
    const a = page.locator("[data-conversation-view=a]"),
      b = page.locator("[data-conversation-view=b]");
    await a.waitFor({ timeout: 90000 });
    await b.waitFor();
    const ta = a.getByTestId("message-thread-panel"),
      tb = b.getByTestId("message-thread-panel");
    await expect(ta).toContainText("Release plan for pane A");
    await expect(tb).toContainText("Design decisions for pane B");
    await expect(ta.getByTestId("message-input")).toBeVisible();
    await expect(tb.getByTestId("message-input")).toBeVisible();
    assert.ok((await page.evaluate(() => window.hostReads)).length > 0);
    assert.ok(
      (await page.evaluate(() => window.hostReads)).every(
        (r) => r.view === "a",
      ),
      "background B mount must not read",
    );
    await expect
      .poll(() =>
        page.evaluate(
          () => window.hostReads.filter((read) => read.kind === "seen").length,
        ),
      )
      .toBeGreaterThan(0);
    assert.ok(
      await page.evaluate(() => {
        const observed = window.hostReads.find((read) => read.kind === "seen");
        const [rootId, replyId] = observed.id.split(":");
        return (
          window.hostSeen(rootId, replyId) > 0 &&
          window.hostReads.every((read) => read.view === "a")
        );
      }),
      "visible A writes canonical seen markers; background B never writes",
    );
    const sends = () =>
      page.evaluate(() =>
        (window.__BUZZ_E2E_COMMAND_PAYLOADS__ ?? []).filter(
          (e) => e.command === "send_channel_message",
        ),
      );
    assert.equal((await sends()).length, 0, "mount/restore cannot send");
    await ta.getByTestId("message-input").fill("Independent draft A");
    await tb.getByTestId("message-input").fill("Independent draft B");
    await expect(ta.getByTestId("message-input")).toHaveText(
      "Independent draft A",
    );
    await ta.getByTestId("send-message").click();
    await expect.poll(async () => (await sends()).length).toBe(1);
    await expect(tb.getByTestId("message-input")).toHaveText(
      "Independent draft B",
    );
    await tb.getByTestId("send-message").click();
    await expect.poll(async () => (await sends()).length).toBe(2);
    const calls = await sends();
    assert.equal(calls[0].payload.parentEventId, "1".repeat(64));
    assert.equal(calls[1].payload.parentEventId, "2".repeat(64));
    assert.equal(calls[0].payload.channelId, calls[1].payload.channelId);
    await tb
      .getByTestId("message-input")
      .fill("B draft survives closing sibling panel");
    await ta.getByRole("button", { name: "Close panel", exact: true }).click();
    await expect(ta).toHaveCount(0);
    await expect(tb).toContainText("Design decisions for pane B");
    await expect(tb.getByTestId("message-input")).toHaveText(
      "B draft survives closing sibling panel",
    );
    await tb.getByRole("button", { name: "Close panel", exact: true }).click();
    // Await actual deferred timeline rows, not the initial loading paint.
    await expect(
      a.locator(`[data-message-id="${"1".repeat(64)}"]`).first(),
    ).toBeVisible();
    await expect(
      b.locator(`[data-message-id="${"2".repeat(64)}"]`).first(),
    ).toBeVisible();
    const mainA = a.getByTestId("channel-composer-overlay");
    const mainB = b.getByTestId("channel-composer-overlay");
    // Both panes now target the same canonical main-channel draft.
    await mainA
      .getByTestId("message-input")
      .fill("Shared draft before takeover");
    await expect(mainB.locator("[data-draft-preview]")).toContainText(
      "Shared draft before takeover",
    );
    await page.screenshot({ path: path.join(shots, "shared-preview.png") });
    await mainB.getByRole("button", { name: "Take over", exact: true }).click();
    await expect(mainB.getByTestId("message-input")).toHaveText(
      "Shared draft before takeover",
    );
    await expect(mainB.getByTestId("message-input")).toBeFocused();
    await page.screenshot({ path: path.join(shots, "immediate-takeover.png") });
    await expect(mainA.getByTestId("message-input")).toHaveCount(0);
    await expect(mainA.locator("[data-draft-preview]")).toContainText(
      "Shared draft before takeover",
    );
    assert.equal((await sends()).length, 2, "takeover cannot replay a send");
    await page.getByRole("button", { name: "Unmount A", exact: true }).click();
    await expect(a).toHaveCount(0);
    await expect(mainB.getByTestId("message-input")).toHaveText(
      "Shared draft before takeover",
    );
    await page.evaluate(() => (window.hostReads = []));
    await page.evaluate(() =>
      window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__({
        id: "5".repeat(64),
        content: "Arrival after sibling unmount",
        channelName: "general",
        pubkey: "c".repeat(64),
        createdAt: Math.floor(Date.now() / 1000) + 60,
      }),
    );
    await expect
      .poll(() => page.evaluate(() => window.hostEffective("5".repeat(64))))
      .not.toBeNull();
    const coverage = await page.evaluate(() => ({
      message: window.hostEffective("5".repeat(64)),
      channel: window.hostChannelRead(),
      reads: window.hostReads,
    }));
    assert.equal(
      coverage.message,
      coverage.channel,
      "remaining host must retain its resource-parent resolver",
    );
    assert.ok(
      coverage.reads.length > 0 && coverage.reads.every((r) => r.view === "b"),
    );
    assert.equal((await sends()).length, 2);
    await expect(mainB.getByTestId("message-input")).toHaveText(
      "Shared draft before takeover",
    );
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    await page.screenshot({ path: path.join(shots, "after-takeover.png") });
    assert.deepEqual(errors, []);
    assert.deepEqual(fatalConsole, []);
    console.log(
      "PASS: actual two ChannelScreen hosts; background mount no reads; independent threads/drafts; two explicit production send mutation paths preserve distinct parents and shared channel exactly once; local close isolation; canonical shared draft has one editor with live preview and flush/restore takeover; sibling unmount preserves remaining editor; inherited mount-time autoSend suppressed; post-unmount resolver/read admission survives; no automatic sends, page or React errors. Signing is mocked. Chrome sandbox ON. Not full split/drag/persistence acceptance.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
