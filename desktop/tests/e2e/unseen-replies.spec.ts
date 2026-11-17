import { waitForMockChannelHeadReady } from "../helpers/channelHeadReady";
import { expect, test } from "@playwright/test";
import { installMockBridge, TEST_IDENTITIES } from "../helpers/bridge";

test("unseen summary survives channel opening and clears only on visible reply bodies", async ({
  page,
}) => {
  await installMockBridge(page, {
    searchProfiles: [
      { pubkey: "deadbeef".repeat(8), displayName: "Nora", isAgent: false },
      {
        pubkey: TEST_IDENTITIES.bob.pubkey,
        displayName: "Alex",
        isAgent: false,
      },
    ],
  });
  await page.goto("/");
  await page.getByTestId("channel-general").click();
  await page.keyboard.press("ControlOrMeta+,");
  await page.getByTestId("settings-nav-appearance").click();
  await page.getByTestId("thread-display-channels-collapsed").click();
  await page.getByTestId("thread-display-replies-expanded").click();
  await page.getByTestId("settings-back-to-app").click();
  await page.getByTestId("channel-random").click();
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
  await expect(page.getByTestId("message-timeline")).toContainText("Hey team", {
    timeout: 30000,
  });
  await waitForMockChannelHeadReady(
    page,
    "general",
    "9a1657ac-f7aa-5db0-b632-d8bbeb6dfb50",
  );
  let sequence = 70000;
  let tick = Math.floor(Date.now() / 1000) + 30;
  const emit = async (content: string, parentEventId?: string) => {
    const input = {
      content,
      parentEventId,
      id: (sequence++).toString(16).padStart(64, "0"),
      pubkey: TEST_IDENTITIES.bob.pubkey,
      createdAt: tick++,
    };
    return page.evaluate((input) => {
      const emit = window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__;
      if (!emit) throw new Error("Missing mock message emitter");
      return emit({ ...input, channelName: "general" });
    }, input);
  };
  const root = await emit("Unseen observation acceptance root");
  await emit("First answer body must actually appear", root.id);
  await emit("Second answer body must actually appear", root.id);
  const summary = page.locator(
    `[data-testid="message-thread-summary"][data-thread-head-id="${root.id}"]`,
  );
  await expect(summary).toHaveAttribute("data-unseen", "true", {
    timeout: 30000,
  });
  await expect(summary.getByTestId("thread-unread-badge")).toHaveText("2 new");
  await page.screenshot({ path: test.info().outputPath("unseen-summary.png") });
  await page.getByTestId("channel-random").click();
  await page.getByTestId("channel-general").click();
  await expect(summary.getByTestId("thread-unread-badge")).toHaveText("2 new");
  await expect(
    page.getByRole("button", { name: /Unseen replies \(/ }),
  ).toBeVisible();
  await summary.click();
  const inline = page.locator(
    `[data-testid="inline-thread"][data-thread-head-id="${root.id}"]`,
  );
  await expect(inline).toContainText("First answer body must actually appear");
  await expect(summary.getByTestId("thread-unread-badge")).toHaveCount(0);
  await summary.click();
  await emit("A later answer raises the marker again", root.id);
  await expect(summary.getByTestId("thread-unread-badge")).toHaveText("1 new");
  // Next-unseen opens the source thread; only its visible body clears the marker.
  for (
    let tries = 0;
    tries < 10 && (await summary.getByTestId("thread-unread-badge").count());
    tries++
  ) {
    const next = page.getByRole("button", { name: /Unseen replies \(/ });
    if (!(await next.isVisible())) break;
    await next.click();
    await page.waitForTimeout(500);
  }
  await expect(page.getByTestId("message-thread-panel")).toContainText(
    "A later answer raises the marker again",
  );
  await expect(summary.getByTestId("thread-unread-badge")).toHaveCount(0);
  // Keep an already-open thread scrolled away from a new body: the header
  // must jump within it rather than toggling the thread closed.
  for (let index = 0; index < 12; index++)
    await emit(
      `Long observation spacer ${index}: ${"visible body ".repeat(200)}`,
      root.id,
    );
  const body = page.getByTestId("message-thread-body");
  await body.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await emit("Already open thread jump target", root.id);
  await expect(summary.getByTestId("thread-unread-badge")).toBeVisible();
  const panel = page.getByTestId("message-thread-panel");
  const savedCollapse = await page.evaluate(
    (rootId) =>
      Object.entries(localStorage).filter(
        ([key]) =>
          key.startsWith("buzz-thread-expansion.v1:") && key.includes(rootId),
      ),
    root.id,
  );
  await panel
    .getByRole("button", { name: "Hide replies", exact: true })
    .first()
    .click();
  await expect(
    panel
      .getByTestId("message-body")
      .filter({ hasText: "Already open thread jump target" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /Unseen replies \(/ }).click();
  await expect(page.getByTestId("message-thread-panel")).toBeVisible();
  await expect(
    panel
      .getByTestId("message-body")
      .filter({ hasText: "Already open thread jump target" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        (rootId) =>
          Object.entries(localStorage).filter(
            ([key]) =>
              key.startsWith("buzz-thread-expansion.v1:") &&
              key.includes(rootId),
          ),
        root.id,
      ),
    )
    .toEqual(savedCollapse);
  await expect
    .poll(() => body.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await page.screenshot({
    path: test.info().outputPath("unseen-open-thread-jump.png"),
  });
});
