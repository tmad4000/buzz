import { expect, test } from "@playwright/test";

import { installMockBridge, TEST_IDENTITIES } from "../helpers/bridge";

test("Inbox dropdown counts the rows for each filter and respects unread only", async ({
  page,
}) => {
  await installMockBridge(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const trigger = page.getByTestId("inbox-filter-trigger");
  await expect(trigger).toHaveAccessibleName("Filter inbox: All");

  await page.evaluate((author) => {
    const push = window.__BUZZ_E2E_PUSH_MOCK_FEED_ITEM__;
    if (!push) throw new Error("Mock feed helper is unavailable");

    const now = Math.floor(Date.now() / 1000);
    const channelId = "9a1657ac-f7aa-5db0-b632-d8bbeb6dfb50";
    const message = {
      channel_id: channelId,
      channel_name: "general",
      channel_type: "stream",
      content: "Inbox filter count fixture",
      pubkey: author,
    };
    for (let index = 0; index < 50; index += 1) {
      push({
        ...message,
        category: "mention",
        created_at: now + index,
        id: `count-thread-reply-${index}`,
        kind: 9,
        tags: [
          ["h", channelId],
          ["e", "count-thread-root", "", "reply"],
        ],
      });
    }
    push({
      ...message,
      category: "activity",
      channel_id: null,
      channel_name: "",
      channel_type: null,
      created_at: now + 50,
      id: "count-project",
      kind: 1618,
      tags: [["a", `30617:${author}:buzz`]],
    });
    push({
      ...message,
      category: "needs_action",
      created_at: now + 51,
      id: "count-action",
      kind: 46010,
      tags: [["h", channelId]],
    });
  }, TEST_IDENTITIES.alice.pubkey);

  const list = page.getByTestId("home-inbox-list");
  const project = list.getByTestId("home-inbox-item-count-project");
  const action = list.getByTestId("home-inbox-item-count-action");
  const thread = list.locator(
    '[data-testid^="home-inbox-item-count-thread-reply-"]',
  );
  await expect(project).toBeVisible();
  await expect(action).toBeVisible();
  await expect(thread).toBeVisible();
  await trigger.hover();
  await expect(page.getByRole("tooltip")).toHaveText(
    "Counts cover the 50 most recent items per feed bucket",
  );

  await trigger.click();
  const menu = page.getByRole("menu");
  const option = (label: string) =>
    menu.getByRole("menuitemradio", { name: label, exact: true });
  await expect(option("All 3+")).toBeVisible();
  await expect(option("Projects 1+")).toBeVisible();
  await expect(option("Mentions 1+")).toBeVisible();
  await expect(option("Threads 1+")).toBeVisible();
  await expect(option("Needs action 1")).toBeVisible();
  await option("Mentions 1+").click();
  await expect(thread).toBeVisible();
  await expect(project).toHaveCount(0);
  await expect(action).toHaveCount(0);

  await trigger.click();
  await option("Needs action 1").click();
  await expect(action).toBeVisible();
  await action.click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Mark as read", exact: true })
    .click();

  // Switch to a different selection so the read action row is no longer pinned.
  await trigger.click();
  await option("Mentions 1+").click();
  await expect(page.getByRole("menu", { includeHidden: true })).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.getByTestId("inbox-options-trigger").click();
  const unreadOnly = page.getByRole("switch", { name: "Show unread only" });
  await unreadOnly.click();
  await expect(unreadOnly).toBeChecked();
  await page.keyboard.press("Escape");

  await trigger.click();
  await expect(option("Needs action")).toBeVisible();
  await option("Needs action").click();
  await expect(action).toHaveCount(0);
  await trigger.click();
  await expect(option("Needs action 0")).toHaveAttribute(
    "aria-checked",
    "true",
  );
});
