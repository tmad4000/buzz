import { test, expect } from "@playwright/test";
import { installMockBridge, TEST_IDENTITIES } from "../helpers/bridge";
import fs from "node:fs";
const self = "deadbeef".repeat(8);
const shots =
  process.env.BUZZ_SIDEBAR_SCREENSHOTS ?? "test-results/unread-sidebar";
test("unread sidebar branches and bounded nesting", async ({ page }) => {
  await installMockBridge(page, {
    searchProfiles: [
      { pubkey: self, displayName: "Nora", isAgent: false },
      {
        pubkey: TEST_IDENTITIES.bob.pubkey,
        displayName: "Alex",
        isAgent: false,
      },
    ],
  });
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
  let tick = Math.floor(Date.now() / 1000) + 30;
  const emit = async (content: string, parentEventId?: string, other = false) =>
    page.evaluate(
      ({ content, parentEventId, pubkey, createdAt }) => {
        const emit = window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__;
        if (!emit) throw new Error("Mock message emitter missing");
        return emit({
          channelName: "general",
          content,
          parentEventId,
          pubkey,
          createdAt,
        });
      },
      {
        content,
        parentEventId,
        pubkey: other ? TEST_IDENTITIES.bob.pubkey : self,
        createdAt: tick++,
      },
    );
  const root = await emit("Release checklist — sidebar review");
  const read = await emit(
    "Previous review: copy and labels approved.",
    root.id,
  );
  await emit("Archived detail: all wording checked.", read.id);
  const branch = await emit(
    "New review: check the unread reply below.",
    root.id,
  );
  const middle = await emit("Build notes and verification.", branch.id);
  const deep = await emit(
    "Unread: the receipt screen is ready for review.",
    middle.id,
    true,
  );
  await page
    .locator(
      `[data-testid="message-thread-summary"][data-thread-head-id="${root.id}"]`,
    )
    .click();
  const panel = page.getByTestId("message-thread-panel");
  await expect(panel).toBeVisible();
  fs.mkdirSync(shots, { recursive: true });
  await page.mouse.move(5, 5);
  if (process.env.BASELINE) {
    await page.mouse.move(5, 5);
    await panel.screenshot({
      path: `${shots}/before-collapsed.png`,
    });
    for (const id of [branch.id, middle.id])
      await panel
        .locator(
          `[data-testid="message-thread-summary"][data-thread-head-id="${id}"]`,
        )
        .click();
    await expect(panel.locator(`[data-message-id="${deep.id}"]`)).toBeVisible();
    await page.mouse.move(5, 5);
    await panel.screenshot({
      path: `${shots}/before-expanded.png`,
    });
  } else {
    await expect(panel.locator(`[data-message-id="${deep.id}"]`)).toBeVisible();
    await expect(
      panel.getByTestId("sidebar-read-branch").filter({ hasText: "1 reply" }),
    ).toBeVisible();
    await expect(panel.getByTestId("sidebar-new-marker")).toContainText(
      "1 new",
    );
    await expect(panel.getByTestId("sidebar-reply-context")).toContainText(
      "Replying to",
    );
    await panel.getByRole("button", { name: "Jump to first unread" }).click();
    await page.mouse.move(5, 5);
    await panel.screenshot({
      path: `${shots}/after-unread.png`,
    });
    await panel
      .getByTestId("sidebar-read-branch")
      .filter({ hasText: "1 reply" })
      .click();
    await expect(
      panel.getByText("Archived detail: all wording checked.", { exact: true }),
    ).toBeVisible();
    await page.mouse.move(5, 5);
    await panel.screenshot({
      path: `${shots}/after-read-expanded.png`,
    });
    await panel
      .locator(
        `[data-testid="sidebar-hide-branch"][data-thread-head-id="${branch.id}"]`,
      )
      .click();
    await expect(panel.locator(`[data-message-id="${deep.id}"]`)).toHaveCount(
      0,
    );
    const newer = await emit(
      "Unread follow-up: ready for final review.",
      middle.id,
      true,
    );
    await expect(
      panel.locator(`[data-message-id="${newer.id}"]`),
    ).toBeVisible();
    await page.waitForTimeout(1200);
    await expect(
      panel.locator(`[data-message-id="${newer.id}"]`),
    ).toBeVisible();
    await expect(panel.getByTestId("sidebar-new-marker")).toContainText(
      "2 new",
    );
  }
});
