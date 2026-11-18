import { expect, test, type Page, type Locator } from "@playwright/test";
import fs from "node:fs";
import { installMockBridge, TEST_IDENTITIES } from "../helpers/bridge";
const ids = {
  root: "91".repeat(32),
  child: "92".repeat(32),
  deep: "93".repeat(32),
  other: "94".repeat(32),
  foreign: "95".repeat(32),
};
const shots =
  process.env.BUZZ_NESTED_ROUTING_SCREENSHOTS ??
  "test-results/nested-thread-routing";
async function setup(page: Page, channelName = "general") {
  await installMockBridge(page);
  await page.goto("/");
  await page.getByTestId(`channel-${channelName}`).click();
  await expect
    .poll(() =>
      page.evaluate(
        (channelName) =>
          window.__BUZZ_E2E_HAS_MOCK_LIVE_SUBSCRIPTION__?.({ channelName }),
        channelName,
      ),
    )
    .toBe(true);
  await page.evaluate(
    ({ ids, channelName, pubkey }) => {
      const emit = window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__;
      if (!emit) throw Error("Missing emitter");
      let createdAt = Math.floor(Date.now() / 1000) + 10;
      for (const [id, content, parentEventId] of [
        [ids.root, "Release plan thread", undefined],
        [ids.child, "Rollback deployment branch", ids.root],
        [ids.deep, "Receipts verification subthread", ids.child],
        [ids.other, "Independent lunch discussion", undefined],
        [ids.foreign, "Receipts verification foreign branch", ids.other],
      ] as const)
        emit({
          id,
          content,
          parentEventId,
          pubkey,
          channelName,
          createdAt: createdAt++,
        });
    },
    { ids, channelName, pubkey: TEST_IDENTITIES.bob.pubkey },
  );
}
const published = (page: Page) =>
  page.evaluate(() =>
    (window.__BUZZ_E2E_COMMAND_PAYLOADS__ ?? [])
      .filter((x) => x.command === "publish_queued_message")
      .map(
        (x) =>
          (
            x.payload as {
              event: { id: string; content: string; tags: string[][] };
            }
          ).event,
      ),
  );
async function openPanel(page: Page, id: string) {
  await page
    .locator(
      `[data-testid="open-thread-side-panel"][data-thread-head-id="${id}"]`,
    )
    .click();
  return page.getByTestId("message-thread-panel");
}
function editor(pane: Locator) {
  return pane.getByTestId("message-composer").filter({
    has: pane
      .page()
      .locator(
        `[data-testid="send-to-thread"][data-thread-routing-head="${ids.root}"]`,
      ),
  });
}
async function checkTags(page: Page, content: string, parent: string) {
  await expect
    .poll(
      async () =>
        (await published(page)).filter((e) => e.content === content).length,
      { timeout: 15000 },
    )
    .toBe(1);
  const event = (await published(page)).find((e) => e.content === content);
  if (!event) throw Error("Missing acknowledged event");
  expect(event.tags).toEqual(
    expect.arrayContaining(
      parent === ids.root
        ? [["e", parent, "", "reply"]]
        : [
            ["e", ids.root, "", "root"],
            ["e", parent, "", "reply"],
          ],
    ),
  );
}
test("side-panel picker ranks descendants only; opening/Escape do not send; nested and root choices keep NIP-10 tags", async ({
  page,
}) => {
  await setup(page);
  const panel = await openPanel(page, ids.root);
  const composer = editor(panel);
  const box = composer.getByTestId("message-input");
  await box.fill("Receipts verification follow-up");
  // A narrow panel keeps its routing/send buttons clear of formatting tools.
  const routingBox = await composer.getByTestId("send-to-thread").boundingBox();
  const formattingBox = await composer
    .getByRole("button", { name: "Toggle formatting", exact: true })
    .boundingBox();
  if (!routingBox || !formattingBox) throw Error("Missing toolbar controls");
  expect(
    routingBox.y >= formattingBox.y + formattingBox.height ||
      routingBox.x >= formattingBox.x + formattingBox.width,
  ).toBe(true);
  const before = (await published(page)).length;
  await composer.getByTestId("send-to-thread").focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "Thread destinations" });
  await expect(menu.getByRole("menuitem").first()).toContainText(
    "Receipts verification subthread",
  );
  await expect(menu.locator("[data-thread-destination]")).toHaveCount(2);
  await expect(menu).not.toContainText("foreign branch");
  await expect(menu).not.toContainText("New message");
  await expect(menu).toContainText("Reply to thread root");
  expect((await published(page)).length).toBe(before);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(box).toHaveText("Receipts verification follow-up");
  expect((await published(page)).length).toBe(before);
  await composer.getByTestId("send-to-thread").click();
  fs.mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/side-panel-descendants.png` });
  await expect(menu.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("Enter");
  await checkTags(page, "Receipts verification follow-up", ids.deep);
  await expect(box).toBeEmpty();
  await box.fill("Root-level follow-up");
  await composer.getByTestId("send-to-thread").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await checkTags(page, "Root-level follow-up", ids.root);
  await expect(box).toBeEmpty();
  await box.fill("Formatting layout check");
  await composer
    .getByRole("button", { name: "Toggle formatting", exact: true })
    .click();
  expect(
    await composer.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await composer
    .getByRole("button", { name: "Close formatting", exact: true })
    .click();
  await expect(
    composer.getByRole("button", { name: "Close formatting", exact: true }),
  ).toHaveCount(0);
});
test("inline nested picker sends to its descendant while independent panel draft/selection is unchanged", async ({
  page,
}) => {
  await setup(page);
  const panel = await openPanel(page, ids.other);
  const sibling = panel.getByTestId("message-input");
  await sibling.fill("Independent panel draft");
  const inline = page.locator(
    `[data-testid="inline-thread"][data-thread-head-id="${ids.root}"]`,
  );
  if (!(await inline.count()))
    await page
      .locator(
        `[data-testid="message-thread-summary"][data-thread-head-id="${ids.root}"]`,
      )
      .click();
  const composer = editor(inline),
    box = composer.getByTestId("message-input");
  await box.fill("Receipts verification inline follow-up");
  await composer.getByTestId("send-to-thread").click();
  const menu = page.getByRole("menu", { name: "Thread destinations" });
  await expect(menu).not.toContainText("foreign branch");
  await expect(menu.getByRole("menuitem").first()).toContainText(
    "Receipts verification subthread",
  );
  await menu.locator(`[data-thread-destination="${ids.deep}"]`).click();
  await sibling.focus();
  await checkTags(page, "Receipts verification inline follow-up", ids.deep);
  await expect(panel).toContainText("Independent lunch discussion");
  await expect(sibling).toHaveText("Independent panel draft");
  await expect(box).toBeEmpty();
  await page.screenshot({ path: `${shots}/inline-and-independent-panel.png` });
});
test("DM thread picker preserves channel and descendant/root scope", async ({
  page,
}) => {
  await setup(page, "alice-tyler");
  const panel = await openPanel(page, ids.root);
  const composer = editor(panel);
  await composer.getByTestId("message-input").fill("DM receipts verification");
  await composer.getByTestId("send-to-thread").click();
  const menu = page.getByRole("menu", { name: "Thread destinations" });
  await expect(menu).not.toContainText("foreign branch");
  await menu.locator(`[data-thread-destination="${ids.deep}"]`).click();
  await checkTags(page, "DM receipts verification", ids.deep);
  await expect(composer.getByTestId("message-input")).toBeEmpty();
  await expect(page.getByTestId("chat-title")).toHaveText("alice-tyler");
});

test("nested durable admission failure keeps the thread draft for an explicit retry", async ({
  page,
}) => {
  await setup(page);
  const panel = await openPanel(page, ids.root),
    composer = editor(panel),
    box = composer.getByTestId("message-input");
  await box.fill("Receipts verification retry");
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (
      ...args: Parameters<IDBDatabase["transaction"]>
    ) {
      const [names, mode] = args;
      if (
        this.name === "buzz-message-outbox-v1" &&
        mode === "readwrite" &&
        Array.isArray(names) &&
        [...names].sort().join(",") === "messages,metadata"
      ) {
        IDBDatabase.prototype.transaction = original;
        throw Error("Nested routing test: durable storage unavailable");
      }
      return Reflect.apply(original, this, args);
    };
  });
  const before = (await published(page)).length;
  await composer.getByTestId("send-to-thread").click();
  await page
    .getByRole("menu", { name: "Thread destinations" })
    .locator(`[data-thread-destination="${ids.deep}"]`)
    .click();
  await expect(box).toHaveText("Receipts verification retry");
  await expect(composer.getByTestId("send-to-thread")).toBeEnabled();
  expect((await published(page)).length).toBe(before);
  await composer.getByTestId("send-to-thread").click();
  await page
    .getByRole("menu", { name: "Thread destinations" })
    .locator(`[data-thread-destination="${ids.deep}"]`)
    .click();
  await checkTags(page, "Receipts verification retry", ids.deep);
  await expect(box).toBeEmpty();
});

test.afterEach(async ({ page }, info) => {
  const counts = await page.evaluate(() => {
    const calls = window.__BUZZ_E2E_COMMAND_PAYLOADS__ ?? [];
    // Preparation signs the outbox event without publishing it.
    const rest = calls.filter(
      (x) =>
        x.command === "send_channel_message" &&
        (x.payload as { prepareOnly?: boolean })?.prepareOnly !== true,
    ).length;
    const ws = calls.filter((x) => {
      if (x.command !== "plugin:websocket|send") return false;
      const data = (x.payload as { message?: { data?: string } })?.message
        ?.data;
      if (!data) return false;
      try {
        const frame = JSON.parse(data);
        return frame[0] === "EVENT" && [9, 40002].includes(frame[1]?.kind);
      } catch {
        return false;
      }
    }).length;
    return {
      rest,
      ws,
      queued: calls.filter((x) => x.command === "publish_queued_message")
        .length,
    };
  });
  await info.attach("publication-counts", {
    body: JSON.stringify(counts),
    contentType: "application/json",
  });
  await info.attach("all-rest-command-calls", {
    body: JSON.stringify(
      await page.evaluate(() =>
        (window.__BUZZ_E2E_COMMAND_PAYLOADS__ ?? []).filter(
          (x) => x.command === "send_channel_message",
        ),
      ),
    ),
    contentType: "application/json",
  });
  expect(counts.rest).toBe(0);
  expect(counts.ws).toBe(0);
  if (info.status !== info.expectedStatus) {
    const sends = await page.evaluate(() =>
      (window.__BUZZ_E2E_COMMAND_PAYLOADS__ ?? []).filter((x) =>
        /publish_queued_message|send_channel_message|sign_queued_message/.test(
          x.command,
        ),
      ),
    );
    await info.attach("publication-routes", {
      body: JSON.stringify(sends, null, 2),
      contentType: "application/json",
    });
  }
});
