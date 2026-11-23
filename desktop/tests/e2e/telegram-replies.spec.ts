import { expect, test, type Page } from "@playwright/test";
import { installMockBridge, TEST_IDENTITIES } from "../helpers/bridge";
import { waitForAnimations } from "../helpers/animations";

const ids = {
  root: "a1".repeat(32),
  other: "a2".repeat(32),
  reply: "a3".repeat(32),
  nested: "a4".repeat(32),
  late: "a5".repeat(32),
};
const shots =
  process.env.BUZZ_TELEGRAM_REPLY_SCREENSHOTS ??
  "test-results/telegram-replies";

async function setup(page: Page, filler = 0, timelineFirst = false) {
  await installMockBridge(page);
  await page.goto("/");
  await page.waitForFunction(
    () => typeof window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__ === "function",
  );
  if (timelineFirst) {
    await page.getByTestId("channel-general").click();
    await order(page).selectOption("timeline");
    await page.getByTestId("channel-random").click();
  }
  await emitThread(page, filler);
  await page.getByTestId("channel-general").click();
  await expect(page.getByTestId("message-timeline")).toContainText(
    "Lunch is at noon",
    { timeout: 20_000 },
  );
}
async function emitThread(page: Page, filler: number) {
  await page.evaluate(
    ({ ids, alice, bob, filler }) => {
      const emit = window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__;
      if (!emit) throw new Error("Missing mock emitter");
      let createdAt = Math.floor(Date.now() / 1000) + 10;
      const send = (
        id: string | undefined,
        content: string,
        pubkey: string,
        parentEventId?: string,
      ) =>
        emit({
          id,
          content,
          parentEventId,
          pubkey,
          channelName: "general",
          createdAt: createdAt++,
        });
      send(ids.root, "Should we ship the beta on Thursday?", bob);
      send(ids.reply, "Yes, if the import fix lands", alice, ids.root);
      for (let i = 0; i < filler; i++)
        send(undefined, `Unrelated update ${i}\nwith a second line`, bob);
      send(ids.other, "Lunch is at noon", bob);
      send(ids.nested, "It landed this morning", bob, ids.reply);
      send(ids.late, "Then Thursday works for me", alice, ids.root);
    },
    {
      ids,
      alice: TEST_IDENTITIES.alice.pubkey,
      bob: TEST_IDENTITIES.bob.pubkey,
      filler,
    },
  );
}
const row = (page: Page, id: string) =>
  page.locator(`[data-testid="message-row"][data-message-id="${id}"]`);
const order = (page: Page) =>
  page.getByRole("combobox", { name: "Order", exact: true });
const published = (page: Page, content: string) =>
  page.evaluate(
    (content) =>
      (window.__BUZZ_E2E_COMMAND_PAYLOADS__ ?? [])
        .filter((entry) => entry.command === "publish_queued_message")
        .map(
          (entry) =>
            (
              entry.payload as {
                event: { kind: number; content: string; tags: string[][] };
              }
            ).event,
        )
        .filter((event) => event.content === content),
    content,
  );
const readMarkers = (page: Page) =>
  page.evaluate(() =>
    Object.entries(localStorage)
      .filter(([key]) => /read-state|observed/i.test(key))
      .map(([, value]) => value)
      .join("\n"),
  );
async function replyTo(page: Page, id: string) {
  const target = row(page, id);
  await target.hover();
  await target.getByRole("button", { name: "Reply", exact: true }).click();
}

test("Timeline reply stays flat, keeps the draft, and publishes ordinary reply tags", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setup(page);
  await order(page).selectOption("timeline");
  const timeline = page.getByTestId("message-timeline");
  const input = page.getByTestId("message-input").first();
  await expect(timeline.getByTestId("timeline-reply-quote")).toHaveCount(3);
  await waitForAnimations(page);
  await page.screenshot({ path: `${shots}/desktop-timeline.png` });

  await input.fill("Great, I will announce it");
  await replyTo(page, ids.nested);
  const banner = page.getByTestId("reply-target");
  await expect(banner).toContainText("Replying to bob");
  await expect(banner).toContainText("It landed this morning");
  await expect(input).toHaveText("Great, I will announce it");
  await expect(order(page)).toHaveValue("timeline");
  await expect(page.getByTestId("message-thread-panel")).toHaveCount(0);
  await waitForAnimations(page);
  await page.screenshot({ path: `${shots}/desktop-timeline-reply.png` });

  // Cancel by keyboard and by control; the draft survives both.
  await input.press("Escape");
  await expect(banner).toHaveCount(0);
  await expect(input).toHaveText("Great, I will announce it");
  await replyTo(page, ids.nested);
  await banner.getByRole("button", { name: "Cancel reply" }).click();
  await expect(banner).toHaveCount(0);
  await expect(input).toHaveText("Great, I will announce it");

  // Text and parent return together after leaving the channel.
  await replyTo(page, ids.nested);
  await page.getByTestId("channel-random").click();
  await expect(banner).toHaveCount(0);
  await page.getByTestId("channel-general").click();
  await expect(banner).toContainText("It landed this morning");
  await expect(input).toHaveText("Great, I will announce it");
  await input.press("Enter");
  await expect(banner).toHaveCount(0);
  await expect
    .poll(
      async () => (await published(page, "Great, I will announce it")).length,
      { timeout: 15_000 },
    )
    .toBe(1);
  const [event] = await published(page, "Great, I will announce it");
  expect(event.kind).toBe(9);
  expect(event.tags.filter((tag) => tag[0] === "e")).toEqual([
    ["e", ids.root, "", "root"],
    ["e", ids.nested, "", "reply"],
  ]);
  await expect(
    timeline.getByText("Great, I will announce it", { exact: true }),
  ).toBeVisible();
  await expect(timeline.getByTestId("timeline-reply-quote")).toHaveCount(4);
  await expect(order(page)).toHaveValue("timeline");

  // The next message is top-level again.
  await input.fill("A new topic");
  await input.press("Enter");
  await expect
    .poll(async () => (await published(page, "A new topic")).length)
    .toBe(1);
  const [top] = await published(page, "A new topic");
  expect(top.tags.filter((tag) => tag[0] === "e")).toEqual([]);
});

test("Replying to a root from Timeline uses one direct reply tag", async ({
  page,
}) => {
  await setup(page);
  await order(page).selectOption("timeline");
  await replyTo(page, ids.other);
  const input = page.getByTestId("message-input").first();
  await input.fill("See you there");
  await input.press("Enter");
  await expect
    .poll(async () => (await published(page, "See you there")).length)
    .toBe(1);
  const [event] = await published(page, "See you there");
  expect(event.tags.filter((tag) => tag[0] === "e")).toEqual([
    ["e", ids.other, "", "reply"],
  ]);
});

test("a pending Timeline reply stays visible after changing Order", async ({
  page,
}) => {
  await setup(page);
  await order(page).selectOption("timeline");
  await replyTo(page, ids.nested);
  await order(page).selectOption("threads");
  await expect(page.getByTestId("reply-target")).toContainText(
    "It landed this morning",
  );
});

test("Tapping a Timeline quote jumps to a distant original and highlights it in place", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await setup(page, 60);
  await order(page).selectOption("timeline");
  const latest = page.getByRole("button", {
    name: /Jump to latest|new message/,
  });
  const toLatest = () =>
    expect(async () => {
      if (await latest.isVisible()) await latest.click({ timeout: 1_000 });
      await expect(row(page, ids.late)).toBeInViewport({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
  await toLatest();
  await expect(row(page, ids.nested)).toBeInViewport();
  await expect(row(page, ids.reply)).not.toBeInViewport();
  const quote = page
    .getByTestId("timeline-reply-quote")
    .filter({ hasText: "Yes, if the import fix lands" });
  await quote.click();
  await expect(row(page, ids.reply)).toBeInViewport();
  await expect(row(page, ids.reply)).toHaveClass(/route-target-highlight/);
  await page.screenshot({ path: `${shots}/desktop-timeline-jump.png` });
  await expect(order(page)).toHaveValue("timeline");
  await expect(page.getByTestId("message-thread-panel")).toHaveCount(0);

  // The composer quote uses the same jump.
  await replyTo(page, ids.reply);
  await toLatest();
  await page.getByTestId("reply-target-open").click();
  await expect(row(page, ids.reply)).toBeInViewport();
});

test("One thread can be flat, is remembered, and leaves other threads nested", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setup(page);
  await page
    .locator(
      `[data-testid="open-thread-side-panel"][data-thread-head-id="${ids.root}"]`,
    )
    .click();
  const panel = page.getByTestId("message-thread-panel");
  const threadOrder = panel.getByRole("combobox", { name: "Thread order" });
  await expect(threadOrder).toHaveValue("nested");
  await waitForAnimations(page);
  await page.screenshot({ path: `${shots}/desktop-thread-nested.png` });
  await threadOrder.selectOption("flat");
  const replies = panel.getByTestId("message-thread-replies");
  await expect
    .poll(() =>
      replies
        .getByTestId("message-row")
        .evaluateAll((rows) =>
          rows.map((item) => item.getAttribute("data-message-id")),
        ),
    )
    .toEqual([ids.reply, ids.nested, ids.late]);
  await expect(replies.getByTestId("sidebar-hide-branch")).toHaveCount(0);
  const quote = replies.getByTestId("thread-parent-quote");
  await expect(quote).toHaveCount(1);
  await waitForAnimations(page);
  await page.screenshot({ path: `${shots}/desktop-thread-flat.png` });
  await quote.click();
  await expect(
    replies.locator(`[data-message-id="${ids.reply}"]`),
  ).toBeInViewport();

  // A reply in the flat thread keeps ordinary parent and root tags.
  const nested = replies.locator(`[data-message-id="${ids.nested}"]`);
  await nested.hover();
  await nested.getByRole("button", { name: "Reply", exact: true }).click();
  const input = panel.getByTestId("message-input");
  await input.fill("Flat thread reply");
  await input.press("Enter");
  await expect
    .poll(async () => (await published(page, "Flat thread reply")).length, {
      timeout: 15_000,
    })
    .toBe(1);
  const [event] = await published(page, "Flat thread reply");
  expect(event.tags.filter((tag) => tag[0] === "e")).toEqual([
    ["e", ids.root, "", "root"],
    ["e", ids.nested, "", "reply"],
  ]);
  await expect(replies.getByText("Flat thread reply")).toBeVisible();

  await page.reload();
  await page.getByTestId("channel-general").click();
  // The mock relay restarts empty, so recreate the same signed thread.
  await page.waitForFunction(
    () => typeof window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__ === "function",
  );
  expect(
    await page.evaluate(() =>
      Object.entries(localStorage)
        .filter(([key]) => key.startsWith("buzz-thread-flat.v1:"))
        .map(([key, value]) => `${key}=${value}`),
    ),
  ).toEqual([expect.stringMatching(new RegExp(`${ids.root}.*=1$`))]);
  await emitThread(page, 0);
  await page
    .locator(
      `[data-testid="open-thread-side-panel"][data-thread-head-id="${ids.root}"]`,
    )
    .click();
  await expect(
    page
      .getByTestId("message-thread-panel")
      .getByRole("combobox", { name: "Thread order" }),
  ).toHaveValue("flat");
});

test("Showing replies in Timeline or a flat thread does not mark them read", async ({
  page,
}) => {
  // Threads' own inline preview may mark visible replies, so never show it.
  await setup(page, 0, true);
  await expect(order(page)).toHaveValue("timeline");
  await expect(row(page, ids.nested)).toBeInViewport();
  await page.waitForTimeout(1500);
  const markers = await readMarkers(page);
  for (const id of [ids.reply, ids.nested, ids.late])
    expect(markers).not.toContain(id);
});
