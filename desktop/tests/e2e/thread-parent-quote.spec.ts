import { expect, test } from "@playwright/test";
import { installMockBridge, TEST_IDENTITIES } from "../helpers/bridge";
import { waitForMockChannelHeadReady } from "../helpers/channelHeadReady";

test("native parent quote survives folds and jumps to the highlighted parent in a flat thread", async ({
  page,
}) => {
  await installMockBridge(page);
  await page.goto("/");
  await page.getByTestId("channel-general").click();
  await waitForMockChannelHeadReady(
    page,
    "general",
    "9a1657ac-f7aa-5db0-b632-d8bbeb6dfb50",
  );
  const ids = {
    root: "a1".repeat(32),
    parent: "a2".repeat(32),
    child: "a3".repeat(32),
  };
  await page.evaluate(
    ({ ids, pubkey }) => {
      const emit = window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__;
      if (!emit) throw new Error("Missing mock message emitter");
      const createdAt = Math.floor(Date.now() / 1000) + 30;
      emit({
        channelName: "general",
        id: ids.root,
        content: "Parent quote root",
        pubkey,
        createdAt,
      });
      emit({
        channelName: "general",
        id: ids.parent,
        parentEventId: ids.root,
        content:
          "The parent's current first line\nSecond line must not appear in the chip",
        pubkey,
        createdAt: createdAt + 1,
      });
      emit({
        channelName: "general",
        id: ids.child,
        parentEventId: ids.parent,
        content: "A flat child with native reply context",
        pubkey,
        createdAt: createdAt + 2,
      });
    },
    { ids, pubkey: TEST_IDENTITIES.bob.pubkey },
  );
  const summary = page.locator(
    `[data-testid="message-thread-summary"][data-thread-head-id="${ids.root}"]`,
  );
  await expect(summary).toBeVisible();
  if ((await summary.getAttribute("aria-expanded")) !== "true")
    await summary.click();
  const inline = page.locator(
    `[data-testid="inline-thread"][data-thread-head-id="${ids.root}"]`,
  );
  const chip = inline.getByTestId("thread-parent-quote");
  await expect(chip).toHaveCount(1);
  await expect(chip).toHaveText("↪ re: The parent's current first line");
  await expect(chip).toHaveAccessibleName(
    "Jump to parent: The parent's current first line",
  );
  await summary.click();
  await expect(inline).toHaveCount(0);
  await summary.click();
  await expect(chip).toHaveText("↪ re: The parent's current first line");
  await chip.click();
  const panel = page.getByTestId("message-thread-panel");
  const parent = panel.locator(`[data-message-id="${ids.parent}"]`);
  await expect(parent).toBeInViewport();
  await expect(parent).toHaveClass(/route-target-highlight-fade/);
  const panelChip = panel.getByTestId("thread-parent-quote");
  await expect(panelChip).toHaveCount(1);
  await panel.locator(`[data-message-id="${ids.child}"]`).hover();
  await panel.getByTestId(`reply-message-${ids.child}`).click();
  const editor = panel.getByTestId("message-input");
  await editor.fill("Keep the newer sidebar draft and its child target");
  await expect(panel.getByTestId("reply-target")).toContainText(
    "A flat child with native reply context",
  );
  const routeBeforeJump = page.url();
  await panelChip.focus();
  await page.keyboard.press("Enter");
  await expect(parent).toBeInViewport();
  await expect(parent).toHaveClass(/route-target-highlight-fade/);
  await expect(panel.getByTestId("sidebar-reply-context")).toHaveCount(0);
  await expect(editor).toHaveText(
    "Keep the newer sidebar draft and its child target",
  );
  await expect(panel.getByTestId("reply-target")).toContainText(
    "A flat child with native reply context",
  );
  expect(page.url()).toBe(routeBeforeJump);
});
