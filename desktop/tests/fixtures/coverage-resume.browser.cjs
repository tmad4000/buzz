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
      viewport: { width: 1900, height: 1200 },
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      const NativeObserver = window.IntersectionObserver;
      window.coverageObservations = [];
      window.IntersectionObserver = class extends NativeObserver {
        observe(target) {
          window.coverageObservations.push({
            id: target.closest("[data-message-id]")?.dataset.messageId,
            phase: window.coveragePhase,
          });
          return super.observe(target);
        }
      };
    });
    await page.goto(
      `${origin}/tests/fixtures/full-conversation-hosts.html?layout=1&single=1`,
      { timeout: 90000 },
    );
    const a = page.locator('[data-conversation-view="a"]');
    const panel = a.getByTestId("message-thread-panel");
    await expect(panel).toContainText("Release plan for pane A");
    for (const [index, attribute] of ["inert", "aria-hidden"].entries()) {
      const id = String(index + 6).repeat(64);
      const at = Math.floor(Date.now() / 1000) + 120 + index;
      await a.evaluate(
        (node, attribute) =>
          node.setAttribute(
            attribute,
            attribute === "aria-hidden" ? "true" : "",
          ),
        attribute,
      );
      await page.evaluate(
        ({ id, at, attribute }) => {
          window.coveragePhase = `covered-${attribute}`;
          window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__({
            id,
            content: `Reply arriving under ${attribute} cover`,
            parentEventId: "1".repeat(64),
            channelName: "general",
            pubkey: "c".repeat(64),
            createdAt: at,
          });
        },
        { id, at, attribute },
      );
      const body = panel
        .locator(`[data-message-id="${id}"] [data-testid="message-body"]`)
        .first();
      await expect(body).toBeVisible();
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      assert.equal(
        await page.evaluate(
          ({ id, at }) => (window.hostSeen("1".repeat(64), id) ?? -1) >= at,
          { id, at },
        ),
        false,
      );
      const before = await body.boundingBox();
      const scrollBefore = await panel
        .getByTestId("message-thread-body")
        .evaluate((node) => node.scrollTop);
      await a.evaluate((node, attribute) => {
        window.coveragePhase = `uncovered-${attribute}`;
        node.removeAttribute(attribute);
      }, attribute);
      await expect
        .poll(() =>
          page.evaluate((id) => window.hostSeen("1".repeat(64), id), id),
        )
        .toBe(at);
      assert.equal(
        await page.evaluate(
          ({ id, attribute }) =>
            window.coverageObservations.some(
              (entry) =>
                entry.id === id && entry.phase === `uncovered-${attribute}`,
            ),
          { id, attribute },
        ),
        true,
        "uncover re-observes the actual reply body",
      );
      const after = await body.boundingBox();
      assert.ok(
        Math.abs(before.y - after.y) < 1 &&
          Math.abs(before.height - after.height) < 1,
        "coverage removal leaves body geometry unchanged",
      );
      assert.equal(
        await panel
          .getByTestId("message-thread-body")
          .evaluate((node) => node.scrollTop),
        scrollBefore,
      );
    }
    assert.deepEqual(errors, []);
    console.log(
      "PASS actual idle-cover arrival: inert and aria-hidden removal re-observe unchanged reply bodies and write canonical seen markers without scroll, focus change, user interaction or invented IO events. Sandboxed Chrome, mock IPC/signing.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
