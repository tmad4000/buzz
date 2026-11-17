import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import { installMockBridge, TEST_IDENTITIES } from "../helpers/bridge";

async function published(page: Page) {
  return page.evaluate(() =>
    (window.__BUZZ_E2E_COMMAND_PAYLOADS__ ?? [])
      .filter((call) => call.command === "publish_queued_message")
      .map(
        (call) =>
          (
            call.payload as {
              event: { id: string; content: string; tags: string[][] };
            }
          ).event,
      ),
  );
}
function threadTags(event: { tags: string[][] }) {
  return event.tags.filter((tag) => tag[0] === "e");
}
async function failNextAdmission(page: Page) {
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    const probe = {
      count: 0,
      restore() {
        if (IDBDatabase.prototype.transaction === wrapped)
          IDBDatabase.prototype.transaction = original;
      },
    };
    const wrapped: IDBDatabase["transaction"] = function (
      this: IDBDatabase,
      ...args
    ) {
      const [names, mode] = args;
      if (
        this.name === "buzz-message-outbox-v1" &&
        mode === "readwrite" &&
        Array.isArray(names) &&
        names.length === 2 &&
        [...names].sort().join(",") === "messages,metadata"
      ) {
        probe.count++;
        IDBDatabase.prototype.transaction = original;
        throw new Error("Routing test: durable storage unavailable");
      }
      return Reflect.apply(original, this, args);
    };
    IDBDatabase.prototype.transaction = wrapped;
    (
      window as Window & { __routingAdmission?: typeof probe }
    ).__routingAdmission = probe;
  });
  return {
    count: () =>
      page.evaluate(
        () =>
          (window as Window & { __routingAdmission?: { count: number } })
            .__routingAdmission?.count,
      ),
    restore: () =>
      page.evaluate(() => {
        const current = window as Window & {
          __routingAdmission?: { restore(): void };
        };
        current.__routingAdmission?.restore();
        delete current.__routingAdmission;
      }),
  };
}

test("explicit keyboard routing, cancel and new-message fallback preserve inline/side state", async ({
  page,
}) => {
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
  // This routing regression exercises an explicitly opened inline thread.
  // Select the personal collapsed default instead of assuming the pre-Smart default.
  await page.keyboard.press("ControlOrMeta+,");
  await page.getByTestId("settings-nav-appearance").click();
  await page.getByTestId("thread-display-channels-collapsed").click();
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
  const root = "d1".repeat(32),
    other = "d2".repeat(32);
  await page.evaluate(
    ({ root, other, pubkey }) => {
      const emit = window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__;
      if (!emit) throw new Error("Missing mock emitter");
      const now = Math.floor(Date.now() / 1000) + 10;
      emit({
        channelName: "general",
        id: root,
        content: "Signed release rollback plan",
        pubkey,
        createdAt: now,
      });
      emit({
        channelName: "general",
        id: "d3".repeat(32),
        parentEventId: root,
        content: "Keep the receipt",
        pubkey,
        createdAt: now + 1,
      });
      emit({
        channelName: "general",
        id: other,
        content: "Lunch with the team",
        pubkey,
        createdAt: now + 2,
      });
      emit({
        channelName: "general",
        id: "d4".repeat(32),
        parentEventId: other,
        content: "Meet tomorrow",
        pubkey,
        createdAt: now + 3,
      });
    },
    { root, other, pubkey: TEST_IDENTITIES.bob.pubkey },
  );
  const main = page
    .getByTestId("message-composer")
    .filter({ has: page.getByTestId("send-to-thread") });
  const editor = main.getByTestId("message-input");
  const count = async () => (await published(page)).length;
  const lastSend = async () => {
    const sent = (await published(page)).at(-1);
    if (!sent) throw new Error("No queued signed publish recorded");
    return sent;
  };
  await expect(main.getByTestId("send-to-thread")).toBeDisabled();
  await editor.fill("Signed release rollback checklist");
  const before = await count();
  await main.getByTestId("send-to-thread").focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "Thread destinations" });
  await expect(menu.getByRole("menuitem").first()).toContainText(
    "Signed release rollback plan",
  );
  await expect(menu.getByRole("menuitem")).toHaveCount(4);
  expect(await count()).toBe(before);
  const shots =
    process.env.BUZZ_THREAD_ROUTING_SCREENSHOTS ??
    "test-results/send-to-thread";
  fs.mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/ranked-picker.png` });
  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();
  await expect(editor).toContainText("Signed release rollback checklist");
  expect(await count()).toBe(before);
  // Side panel selection is unrelated to the routing destination.
  await page
    .locator(
      `[data-testid="open-thread-side-panel"][data-thread-head-id="${other}"]`,
    )
    .click();
  const side = page.getByTestId("message-thread-panel");
  await expect(side).toContainText("Lunch with the team");
  await main.getByTestId("send-to-thread").click();
  await expect(menu.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Home");
  await page.evaluate(() => window.__BUZZ_E2E_HOLD_OUTBOX_PUBLISH__?.(true));
  await page.keyboard.press("Enter");
  await expect
    .poll(() =>
      page.evaluate(() => window.__BUZZ_E2E_HELD_OUTBOX_PUBLISHES__?.()),
    )
    .toBe(1);
  await expect(editor).toBeEmpty();
  await expect(page.getByTestId("routed-send-notice")).toHaveCount(0);
  expect(
    await page.evaluate(() => window.__BUZZ_E2E_HOLD_OUTBOX_PUBLISH__?.(false)),
  ).toBe(1);
  await expect.poll(count).toBe(before + 1);
  await expect
    .poll(async () => threadTags(await lastSend()))
    .toEqual([["e", root, "", "reply"]]);
  await expect(editor).toBeEmpty();
  await expect(side).toContainText("Lunch with the team");
  await expect(page.getByTestId("routed-send-notice")).toContainText(
    "Sent to Signed release rollback plan",
  );
  // The routed reply is in the existing inline thread and opens no other panel.
  const disclosure = page.locator(
    `[data-testid="message-thread-summary"][data-thread-head-id="${root}"]`,
  );
  if ((await disclosure.getAttribute("aria-expanded")) !== "true")
    await disclosure.click();
  const inline = page.locator(
    `[data-testid="inline-thread"][data-thread-head-id="${root}"]`,
  );
  await expect(inline).toContainText("Signed release rollback checklist");
  await expect(inline.getByTestId("send-to-thread")).toHaveCount(0);
  await page.screenshot({
    path: `${shots}/routed-inline-and-independent-panel.png`,
  });
  await editor.fill("A separate announcement");
  await main.getByTestId("send-to-thread").click();
  await expect(menu.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(editor).toBeEmpty();
  const announcement = page.getByText("A separate announcement", {
    exact: true,
  });
  await expect(announcement).toBeVisible();
  expect(
    await announcement.evaluate(
      (node) => node.closest('[data-testid="inline-thread"]') === null,
    ),
  ).toBe(true);
  await expect.poll(count).toBe(before + 2);
  const sent = (await published(page)).slice(before);
  expect(threadTags(sent[0])).toEqual([["e", root, "", "reply"]]);
  expect(threadTags(sent[1])).toEqual([]);
});

test("channel navigation dismisses picker and uses only destination channel's roots", async ({
  page,
}) => {
  await installMockBridge(page);
  await page.goto("/");
  await page.getByTestId("channel-general").click();
  const main = page
    .getByTestId("message-composer")
    .filter({ has: page.getByTestId("send-to-thread") });
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__BUZZ_E2E_HAS_MOCK_LIVE_SUBSCRIPTION__?.({
          channelName: "general",
        }),
      ),
    )
    .toBe(true);
  await page.evaluate(
    (pubkey) =>
      window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__?.({
        channelName: "general",
        id: "e2".repeat(32),
        content: "GENERAL_ONLY routing source",
        pubkey,
        createdAt: Math.floor(Date.now() / 1000) + 10,
      }),
    TEST_IDENTITIES.bob.pubkey,
  );
  await main
    .getByTestId("message-input")
    .fill("GENERAL_ONLY private draft stays here");
  await main.getByTestId("send-to-thread").click();
  const menu = page.getByRole("menu", { name: "Thread destinations" });
  await expect(menu).toContainText("GENERAL_ONLY routing source");
  await page.getByTestId("channel-random").click();
  await expect(menu).not.toBeVisible();
  await expect(main.getByTestId("message-input")).toBeEmpty();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__BUZZ_E2E_HAS_MOCK_LIVE_SUBSCRIPTION__?.({
          channelName: "random",
        }),
      ),
    )
    .toBe(true);
  await page.evaluate(
    (pubkey) =>
      window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__?.({
        channelName: "random",
        id: "e3".repeat(32),
        content: "RANDOM_ONLY routing source",
        pubkey,
        createdAt: Math.floor(Date.now() / 1000) + 10,
      }),
    TEST_IDENTITIES.bob.pubkey,
  );
  await main.getByTestId("message-input").fill("RANDOM_ONLY update");
  await main.getByTestId("send-to-thread").click();
  await expect(menu).toContainText("RANDOM_ONLY routing source");
  await expect(menu).not.toContainText("GENERAL_ONLY");
  await page.keyboard.press("Escape");
  await page.getByTestId("channel-general").click();
  await expect(main.getByTestId("message-input")).toContainText(
    "GENERAL_ONLY private draft stays here",
  );
  expect(
    await page.evaluate(
      () =>
        (window.__BUZZ_E2E_COMMAND_PAYLOADS__ ?? []).filter(
          (x) => x.command === "send_channel_message",
        ).length,
    ),
  ).toBe(0);
});

test("DM routing stays scoped and failed durable admission keeps draft for explicit retry", async ({
  page,
}) => {
  await installMockBridge(page);
  await page.goto("/");
  await page.getByTestId("channel-alice-tyler").click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__BUZZ_E2E_HAS_MOCK_LIVE_SUBSCRIPTION__?.({
          channelName: "alice-tyler",
        }),
      ),
    )
    .toBe(true);
  const root = "e1".repeat(32);
  await page.evaluate(
    ({ root, pubkey }) => {
      const emit = window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__;
      if (!emit) throw new Error("Missing mock emitter");
      emit({
        channelName: "alice-tyler",
        id: root,
        content: "Private invoice review",
        pubkey,
        createdAt: Math.floor(Date.now() / 1000) + 5,
      });
    },
    { root, pubkey: TEST_IDENTITIES.bob.pubkey },
  );
  const main = page
    .getByTestId("message-composer")
    .filter({ has: page.getByTestId("send-to-thread") });
  const editor = main.getByTestId("message-input");
  const admission = await failNextAdmission(page);
  try {
    await editor.fill("Private invoice review follow-up");
    await main.getByTestId("send-to-thread").click();
    const menu = page.getByRole("menu", { name: "Thread destinations" });
    await expect(menu.getByRole("menuitem").first()).toContainText(
      "Private invoice review",
    );
    await expect(menu).not.toContainText("Welcome to #general");
    await menu.getByRole("menuitem").first().click();
    await expect(
      page.getByText("Routing test: durable storage unavailable", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(editor).toContainText("Private invoice review follow-up");
    expect(await admission.count()).toBe(1);
    expect(await published(page)).toEqual([]);
    await expect(page.getByTestId("routed-send-notice")).toHaveCount(0);
    await expect(
      page.getByRole("article", { name: "Queued message" }),
    ).toHaveCount(0);
    // The persistent failure toast can cover the pointer target; exercise the
    // ordinary keyboard retry path without bypassing hit testing or gates.
    await main.getByTestId("send-to-thread").focus();
    await main.getByTestId("send-to-thread").press("Enter");
    await expect(menu.getByRole("menuitem").first()).toContainText(
      "Private invoice review",
    );
    const shots =
      process.env.BUZZ_THREAD_ROUTING_SCREENSHOTS ??
      "test-results/send-to-thread";
    fs.mkdirSync(shots, { recursive: true });
    await page.setViewportSize({ width: 1000, height: 800 });
    await page.screenshot({ path: `${shots}/dm-retry-picker.png` });
    await page.evaluate(() => window.__BUZZ_E2E_HOLD_OUTBOX_PUBLISH__?.(true));
    await menu.getByRole("menuitem").first().click();
    await expect
      .poll(() =>
        page.evaluate(() => window.__BUZZ_E2E_HELD_OUTBOX_PUBLISHES__?.()),
      )
      .toBe(1);
    await expect(editor).toBeEmpty();
    expect(
      await page.evaluate(() =>
        window.__BUZZ_E2E_HOLD_OUTBOX_PUBLISH__?.(false),
      ),
    ).toBe(1);
    await expect.poll(async () => (await published(page)).length).toBe(1);
    const [sent] = await published(page);
    expect(threadTags(sent)).toEqual([["e", root, "", "reply"]]);
    expect(sent.content).toBe("Private invoice review follow-up");
    expect(await admission.count()).toBe(1);
  } finally {
    await admission.restore();
  }
});

test("DM committed publish failure keeps the queued reply and explicit Retry delivers without clearing a newer draft", async ({
  page,
}) => {
  await installMockBridge(page, {
    sendMessageErrors: [
      "Relay rejected event: Routing test: committed rejection",
    ],
  });
  await page.goto("/");
  await page.getByTestId("channel-alice-tyler").click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__BUZZ_E2E_HAS_MOCK_LIVE_SUBSCRIPTION__?.({
          channelName: "alice-tyler",
        }),
      ),
    )
    .toBe(true);
  const root = "e5".repeat(32);
  await page.evaluate(
    ({ root, pubkey }) => {
      const emit = window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__;
      if (!emit) throw new Error("Missing mock emitter");
      const createdAt = Math.floor(Date.now() / 1000) + 10;
      emit({
        channelName: "alice-tyler",
        id: root,
        content: "Committed DM route",
        pubkey,
        createdAt,
      });
      emit({
        channelName: "alice-tyler",
        id: "e6".repeat(32),
        parentEventId: root,
        content: "Existing DM reply",
        pubkey,
        createdAt: createdAt + 1,
      });
    },
    { root, pubkey: TEST_IDENTITIES.bob.pubkey },
  );
  const main = page
    .getByTestId("message-composer")
    .filter({ has: page.getByTestId("send-to-thread") });
  const editor = main.getByTestId("message-input");
  await editor.fill("Committed DM reply remains queued");
  await main.getByTestId("send-to-thread").click();
  await page
    .getByRole("menu", { name: "Thread destinations" })
    .getByRole("menuitem")
    .filter({ hasText: "Committed DM route" })
    .click();
  await expect(editor).toBeEmpty();
  await expect.poll(async () => (await published(page)).length).toBe(1);
  const [rejected] = await published(page);
  expect(threadTags(rejected)).toEqual([["e", root, "", "reply"]]);
  await expect(page.getByTestId("routed-send-notice")).toHaveCount(0);
  // The captured destination owns its queue UI, even though the origin is the main composer.
  await page
    .locator(
      `[data-testid="open-thread-side-panel"][data-thread-head-id="${root}"]`,
    )
    .click();
  const panel = page.getByTestId("message-thread-panel");
  const queued = panel
    .getByRole("article", { name: "Queued message" })
    .filter({ hasText: "Committed DM reply remains queued" });
  await expect(queued).toContainText("Could not send");
  await expect(queued).toContainText("Routing test: committed rejection");
  await expect(editor).toBeEmpty();
  const rowId = await queued.getAttribute("data-outbox-id");
  expect(rowId).toBeTruthy();
  await editor.fill("Newer DM draft must survive queue Retry");
  await page.evaluate(() => window.__BUZZ_E2E_HOLD_OUTBOX_PUBLISH__?.(true));
  await queued.getByRole("button", { name: "Retry", exact: true }).focus();
  await queued
    .getByRole("button", { name: "Retry", exact: true })
    .press("Enter");
  await expect
    .poll(() =>
      page.evaluate(() => window.__BUZZ_E2E_HELD_OUTBOX_PUBLISHES__?.()),
    )
    .toBe(1);
  await expect(queued).toHaveAttribute("data-outbox-id", rowId ?? "");
  await expect(editor).toHaveText("Newer DM draft must survive queue Retry");
  expect((await published(page)).length).toBe(1);
  expect(
    await page.evaluate(() => window.__BUZZ_E2E_HOLD_OUTBOX_PUBLISH__?.(false)),
  ).toBe(1);
  await expect.poll(async () => (await published(page)).length).toBe(2);
  const attempts = await published(page);
  expect(attempts[1].id).toBe(rejected.id);
  expect(attempts[1].content).toBe("Committed DM reply remains queued");
  expect(threadTags(attempts[1])).toEqual([["e", root, "", "reply"]]);
  await expect(queued).toHaveCount(0);
  await expect(
    panel
      .getByTestId("message-body")
      .filter({ hasText: "Committed DM reply remains queued" }),
  ).toBeVisible();
  await expect(editor).toHaveText("Newer DM draft must survive queue Retry");
  await expect(page.getByTestId("routed-send-notice")).toContainText(
    "Sent to Committed DM route",
  );
});
