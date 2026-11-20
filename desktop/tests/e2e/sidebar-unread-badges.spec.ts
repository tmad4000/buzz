import { expect, test } from "@playwright/test";
import { installMockBridge, TEST_IDENTITIES } from "../helpers/bridge";

test("sidebar unread badges show partial counts, mentions and mute precedence", async ({
  page,
}, testInfo) => {
  await installMockBridge(page);
  await page.goto("/");
  await page.getByTestId("channel-general").click();

  const random = page.getByTestId("channel-random");
  const watercooler = page.getByTestId("channel-watercooler");
  const engineering = page.getByTestId("channel-engineering");

  await random.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Mark unread" }).click();
  await expect(random).toHaveAccessibleDescription("Unread messages");

  await engineering.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Mute channel" }).click();

  await expect
    .poll(
      () =>
        page.evaluate(() =>
          ["watercooler", "engineering"].every((channelName) =>
            window.__BUZZ_E2E_HAS_MOCK_LIVE_SUBSCRIPTION__?.({
              channelName,
              kind: 40002,
            }),
          ),
        ),
      { timeout: 15_000 },
    )
    .toBe(true);
  const author = TEST_IDENTITIES.alice.pubkey;
  await page.evaluate((pubkey) => {
    const reader = "deadbeef".repeat(8);
    for (const name of ["watercooler", "engineering"]) {
      const message = window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__?.({
        channelName: name,
        content: "Unread sidebar fixture",
        pubkey,
        mentionPubkeys: [reader],
        kind: 40002,
      });
      const channelId = message?.tags.find(([tag]) => tag === "h")?.[1];
      if (!message || !channelId) throw new Error(`Missing ${name} fixture`);
      window.__BUZZ_E2E_PUSH_MOCK_FEED_ITEM__?.({
        id: message.id,
        kind: message.kind,
        pubkey,
        content: message.content,
        created_at: message.created_at,
        channel_id: channelId,
        channel_name: name,
        tags: message.tags,
        category: "mention",
      });
    }
  }, author);

  await expect(watercooler).toHaveAccessibleDescription(
    /^At least \d+ unread messages?, including a mention$/,
  );
  await expect(page.getByTestId("channel-unread-badge-watercooler")).toHaveText(
    /@\d+\+/,
  );
  await expect(engineering).toHaveCSS("font-weight", "700");
  await expect(engineering).not.toHaveAttribute("aria-describedby");
  await expect(
    page.getByTestId("channel-unread-badge-engineering"),
  ).toHaveCount(0);

  if (process.env.BUZZ_ITEM15_CAPTURE === "1") {
    await page.mouse.move(640, 400);
    await page.screenshot({ path: testInfo.outputPath("item15-sidebar.png") });
  }

  await watercooler.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Mark as read" }).click();
  await expect(watercooler).not.toHaveAttribute("aria-describedby");
});
