import { expect, test } from "@playwright/test";
import { installMockBridge, TEST_IDENTITIES } from "../helpers/bridge";

test("production inline composer keeps one editor across compact, draft, popup and send states", async ({
  page,
}, info) => {
  await installMockBridge(page);
  await page.goto("/");
  await page.getByTestId("channel-general").click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__BUZZ_E2E_HAS_MOCK_LIVE_SUBSCRIPTION__?.({
          channelName: "general",
        }),
      ),
    )
    .toBe(true);
  const id = "f4".repeat(32);
  await page.evaluate(
    ({ id, pubkey }) =>
      window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__?.({
        id,
        pubkey,
        content: "Polish acceptance root",
        channelName: "general",
        createdAt: Math.floor(Date.now() / 1000) + 30,
      }),
    { id, pubkey: TEST_IDENTITIES.bob.pubkey },
  );
  const toggle = page.locator(
    `[data-testid="message-thread-summary"][data-thread-head-id="${id}"]`,
  );
  await expect(toggle).toHaveText("Reply");
  await expect(toggle).toHaveAccessibleName(/Reply in thread to/);
  await expect(
    page.locator(
      `[data-testid="open-thread-side-panel"][data-thread-head-id="${id}"]`,
    ),
  ).toHaveCount(0);
  await toggle.focus();
  await page.keyboard.press("Enter");
  const thread = page.locator(
    `[data-testid="inline-thread"][data-thread-head-id="${id}"]`,
  );
  const editor = thread.getByTestId("message-input");
  const composer = thread.getByTestId("message-composer");
  await expect(editor).toBeFocused();
  await expect(editor).toHaveAccessibleName(/Reply in thread to/);
  await expect(thread).not.toContainText("No replies yet");
  await editor.evaluate((el) => {
    (el as HTMLElement).dataset.polishEditor = "original";
  });
  await toggle.focus();
  await expect(composer).toHaveAttribute("data-compact", "true");
  await expect(thread.getByTestId("message-composer-toolbar")).toBeHidden();
  expect(
    await composer.evaluate((el) => el.getBoundingClientRect().height),
  ).toBeLessThanOrEqual(42);
  await page.mouse.move(4, 4);
  await expect(composer).toHaveAttribute("data-compact", "true");
  await editor.focus();
  await page.keyboard.type("Keep exact draft");
  await toggle.focus();
  await expect(composer).toHaveAttribute("data-compact", "false");
  await expect(editor).toHaveText("Keep exact draft");
  await expect(editor).toHaveAttribute("data-polish-editor", "original");
  await toggle.click();
  await expect(thread).toHaveCount(0);
  await toggle.click();
  await expect(editor).toHaveText("Keep exact draft");
  await expect(composer).toHaveAttribute("data-compact", "false");
  await editor.fill("");
  await toggle.focus();
  await expect(composer).toHaveAttribute("data-compact", "true");
  await page.keyboard.press("Tab");
  await expect(editor).toBeFocused();
  await expect(composer).toHaveAttribute("data-compact", "false");
  await editor.fill("Production scoped reply");
  await editor.press("Enter");
  await expect(thread).toContainText("Production scoped reply");
  await expect(editor).toHaveText("");
  await expect(composer).toHaveAttribute("data-compact", "false");
  await toggle.focus();
  await expect(composer).toHaveAttribute("data-compact", "true");
  await expect(toggle).toContainText("1 reply");
  await expect(toggle).toHaveAccessibleName(/Hide replies/);
  await page.screenshot({ path: info.outputPath("reply-polish-dark.png") });
});

test("header full version and read-only provenance survive narrow/zoom layouts", async ({
  page,
}, info) => {
  await installMockBridge(page);
  await page.route(
    "https://api.github.com/repos/tmad4000/buzz/releases*",
    (route) => route.abort(),
  );
  await page.goto("/");
  const stamp = page.getByTestId("header-version");
  await expect(stamp).toContainText("v0.5.28-ideaflow.6");
  await stamp.click();
  await expect(page.getByTestId("header-provenance")).toContainText(
    "not installation time",
  );
  await expect(page.getByTestId("header-provenance")).toContainText(
    "Check failed",
  );
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 760, height: 800 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "32px";
  });
  await expect(stamp).toBeVisible();
  await expect(stamp.locator("time")).toBeHidden();
  const box = await stamp.boundingBox();
  if (!box) throw new Error("Visible header must have bounds");
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(760);
  await page.screenshot({ path: info.outputPath("header-narrow-200.png") });
});

test("sidebar actual send exposes a collapsed ancestry before/after acknowledgement and read/refetch", async ({
  page,
}) => {
  await installMockBridge(page, { sendMessageDelayMs: 6000 });
  await page.goto("/");
  await page.getByTestId("channel-general").click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__BUZZ_E2E_HAS_MOCK_LIVE_SUBSCRIPTION__?.({
          channelName: "general",
        }),
      ),
    )
    .toBe(true);
  const root = "c1".repeat(32),
    branch = "c2".repeat(32);
  await page.evaluate(
    ({ root, branch, pubkey }) => {
      for (const [id, content, parentEventId] of [
        [root, "Own reply sidebar root", undefined],
        [branch, "Nested reply target", root],
        ["c3".repeat(32), "Other author deep reply", branch],
      ])
        window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__?.({
          id: id ?? "",
          content: content ?? "",
          parentEventId,
          pubkey,
          channelName: "general",
          createdAt: Math.floor(Date.now() / 1000) + 10,
        });
    },
    { root, branch, pubkey: TEST_IDENTITIES.bob.pubkey },
  );
  await page
    .locator(
      `[data-testid="open-thread-side-panel"][data-thread-head-id="${root}"]`,
    )
    .click();
  const panel = page.getByTestId("message-thread-panel");
  const branchToggle = panel.locator(
    `button[data-thread-head-id="${branch}"][aria-expanded="false"]`,
  );
  if (await branchToggle.count()) await branchToggle.click();
  await panel.locator(`[data-message-id="${branch}"]`).hover();
  await panel.getByTestId(`reply-message-${branch}`).click();
  const editor = panel.getByTestId("message-input");
  await editor.fill("Own sidebar fresh reply body");
  await panel
    .locator(
      `[data-testid="sidebar-hide-branch"][data-thread-head-id="${branch}"]`,
    )
    .click();
  await expect(panel).not.toContainText("Other author deep reply");
  await panel.getByTestId("send-message").click();
  await expect(
    panel
      .getByTestId("message-body")
      .filter({ hasText: "Own sidebar fresh reply body" }),
  ).toBeVisible({ timeout: 5000 });
  await expect(editor).toBeEmpty();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window.__BUZZ_E2E_COMMAND_PAYLOADS__ ?? []).filter(
            (e) => e.command === "send_channel_message",
          ).length,
      ),
    )
    .toBeGreaterThan(0);
  await expect(
    panel
      .getByTestId("message-body")
      .filter({ hasText: "Own sidebar fresh reply body" }),
  ).toBeVisible();
  await page.evaluate(() =>
    window.__BUZZ_E2E_QUERY_CLIENT__?.invalidateQueries(),
  );
  await expect(
    panel
      .getByTestId("message-body")
      .filter({ hasText: "Own sidebar fresh reply body" }),
  ).toBeVisible();
  await panel
    .locator(
      `[data-testid="sidebar-hide-branch"][data-thread-head-id="${branch}"]`,
    )
    .click();
  await page.evaluate(() =>
    window.__BUZZ_E2E_QUERY_CLIENT__?.invalidateQueries(),
  );
  await expect(panel).not.toContainText("Own sidebar fresh reply body");
});

test("routed accepted reply confirmation opens exact collapsed target and Back preserves newer draft without resending", async ({
  page,
}, info) => {
  await installMockBridge(page, { sendMessageDelayMs: 6000 });
  await page.goto("/");
  await page.getByTestId("channel-general").click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__BUZZ_E2E_HAS_MOCK_LIVE_SUBSCRIPTION__?.({
          channelName: "general",
        }),
      ),
    )
    .toBe(true);
  const root = "b1".repeat(32);
  await page.evaluate(
    ({ root, pubkey }) => {
      window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__?.({
        id: root,
        content: "Captured confirmation destination",
        pubkey,
        channelName: "general",
        createdAt: Math.floor(Date.now() / 1000) + 10,
      });
      window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__?.({
        id: "b2".repeat(32),
        content: "Existing destination reply",
        parentEventId: root,
        pubkey,
        channelName: "general",
        createdAt: Math.floor(Date.now() / 1000) + 11,
      });
    },
    { root, pubkey: TEST_IDENTITIES.bob.pubkey },
  );
  await page
    .locator(
      `[data-testid="open-thread-side-panel"][data-thread-head-id="${root}"]`,
    )
    .click();
  const panel = page.getByTestId("message-thread-panel");
  await panel
    .locator(`button[aria-expanded="true"][data-thread-head-id="${root}"]`)
    .click();
  await panel.getByRole("button", { name: "Close panel", exact: true }).click();
  const main = page
    .getByTestId("message-composer")
    .filter({ has: page.getByTestId("send-to-thread") });
  await main
    .getByTestId("message-input")
    .fill("Captured confirmation accepted reply");
  await main.getByTestId("send-to-thread").click();
  await page.locator(`[data-thread-destination="${root}"]`).click();
  const receipt = page.getByTestId("routed-send-notice");
  await expect(receipt).toHaveCount(0);
  await expect(receipt).toContainText(
    "Sent to Captured confirmation destination",
  );
  await main
    .getByTestId("message-input")
    .fill("Newer draft must survive Open Back");
  const count = () =>
    page.evaluate(
      () =>
        (window.__BUZZ_E2E_COMMAND_PAYLOADS__ ?? []).filter(
          (e) => e.command === "send_channel_message",
        ).length,
    );
  const before = await count();
  for (let cycle = 0; cycle < 2; cycle++) {
    await receipt.getByRole("button", { name: /Open thread Captured/ }).click();
    await expect(
      panel
        .getByTestId("message-body")
        .filter({ hasText: "Captured confirmation accepted reply" }),
    ).toBeVisible();
    await page.evaluate(
      ({ pubkey, cycle }) =>
        window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__?.({
          id: `d${cycle + 3}`.repeat(32),
          content: "Incoming message during Open Back",
          pubkey,
          channelName: "general",
          createdAt: Math.floor(Date.now() / 1000) + 50 + cycle,
        }),
      { pubkey: TEST_IDENTITIES.bob.pubkey, cycle },
    );
    await page.getByTestId("routed-send-back").click();
    await expect(panel).toHaveCount(0);
    await expect(main.getByTestId("message-input")).toHaveText(
      "Newer draft must survive Open Back",
    );
    await expect(
      receipt.getByRole("button", { name: /Open thread Captured/ }),
    ).toBeFocused();
    expect(await count()).toBe(before);
  }
  await page.screenshot({
    path: info.outputPath("routed-confirmation-back.png"),
  });
});
