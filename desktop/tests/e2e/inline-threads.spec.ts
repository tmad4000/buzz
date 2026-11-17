import { expect, test } from "@playwright/test";
import fs from "node:fs";
import { installMockBridge, TEST_IDENTITIES } from "../helpers/bridge";

const shots =
  process.env.BUZZ_INLINE_SCREENSHOTS ?? "test-results/inline-threads";
test("inline replies, scoped sends, saved expansion and side panel coexist", async ({
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
  const ready = async () => {
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
  };
  await page.goto("/");
  await ready();
  // Exercise the explicit-collapse flow independently of Smart defaults.
  await page.keyboard.press("ControlOrMeta+,");
  await page.getByTestId("settings-nav-appearance").click();
  await page.getByTestId("thread-display-channels-collapsed").click();
  await page.getByTestId("thread-display-replies-expanded").click();
  await page.getByTestId("settings-back-to-app").click();
  await page.getByTestId("channel-random").click();
  await ready();
  let tick = Math.floor(Date.now() / 1000) + 30;
  const fixtures: {
    content: string;
    parentEventId?: string;
    id: string;
    pubkey: string;
    createdAt: number;
  }[] = [];
  const emit = async (content: string, parentEventId?: string) => {
    const input = {
      content,
      parentEventId,
      id: (1000 + fixtures.length).toString(16).padStart(64, "0"),
      pubkey: TEST_IDENTITIES.bob.pubkey,
      createdAt: tick++,
    };
    fixtures.push(input);
    return page.evaluate((input) => {
      if (!window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__)
        throw new Error("Missing emitter");
      return window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__({
        ...input,
        channelName: "general",
      });
    }, input);
  };
  const root = await emit("Release plan — discuss without leaving the channel");
  const child = await emit(
    "Keep the signed build and rollback together.",
    root.id,
  );
  await emit("Nested detail: the notarization receipt is attached.", child.id);
  await emit("The sidebar can stay open independently.", root.id);
  const other = await emit("Another topic for the side panel");
  await emit(
    "This panel must not change when an inline reply sends.",
    other.id,
  );
  const fresh = await emit("A new topic with no replies yet");
  const toggle = (id: string) =>
    page.locator(
      `[data-testid="message-thread-summary"][data-thread-head-id="${id}"]`,
    );
  const inline = (id: string) =>
    page.locator(`[data-testid="inline-thread"][data-thread-head-id="${id}"]`);
  const side = page.getByTestId("message-thread-panel");
  await expect(toggle(root.id)).toHaveAttribute("aria-expanded", "false");
  await toggle(root.id).click();
  await expect(inline(root.id)).toContainText(
    "Nested detail: the notarization receipt is attached.",
  );
  await expect(side).toHaveCount(0);
  await inline(root.id).getByTestId("message-input").focus();
  await page.mouse.move(5, 5);
  await expect(
    inline(root.id).getByTestId(`message-action-bar-${child.id}`),
  ).toHaveCSS("opacity", "0");
  fs.mkdirSync(shots, { recursive: true });
  await page.mouse.move(5, 5);
  await page.screenshot({ path: `${shots}/expanded-main-channel.png` });

  await page
    .locator(
      `[data-testid="open-thread-side-panel"][data-thread-head-id="${other.id}"]`,
    )
    .click();
  await expect(side).toContainText("Another topic for the side panel");
  const box = inline(root.id).getByTestId("message-input");
  await box.fill("Inline reply stays with the release plan");
  await inline(root.id).getByTestId("send-message").click();
  await expect(inline(root.id)).toContainText(
    "Inline reply stays with the release plan",
  );
  const lastParent = () =>
    page.evaluate(() => {
      const call = [...(window.__BUZZ_E2E_COMMAND_PAYLOADS__ ?? [])]
        .reverse()
        .find((entry) => entry.command === "send_channel_message");
      return (call?.payload as { parentEventId?: string } | undefined)
        ?.parentEventId;
    });
  await expect.poll(lastParent).toBe(root.id);
  await inline(root.id).locator(`[data-message-id="${child.id}"]`).hover();
  await inline(root.id).getByTestId(`reply-message-${child.id}`).click();
  await box.fill("A nested reply keeps its actual parent");
  await inline(root.id).getByTestId("send-message").click();
  await expect.poll(lastParent).toBe(child.id);
  await expect(inline(root.id)).toContainText(
    "A nested reply keeps its actual parent",
  );
  await expect(side).toContainText("Another topic for the side panel");
  await page.screenshot({ path: `${shots}/inline-and-side-panel.png` });
  await side.getByRole("button", { name: "Close panel", exact: true }).click();

  // The same inline path can create the first reply, without opening a panel.
  await toggle(fresh.id).click();
  await expect(inline(fresh.id)).toContainText("No replies yet.");
  await inline(fresh.id)
    .getByTestId("message-input")
    .fill("First reply from the channel");
  await inline(fresh.id).getByTestId("send-message").click();
  await expect.poll(lastParent).toBe(fresh.id);
  await expect(inline(fresh.id)).toContainText("First reply from the channel");
  await expect(side).toHaveCount(0);
  await toggle(fresh.id).click();

  await page.getByTestId("channel-random").click();
  await ready();
  await expect(toggle(root.id)).toHaveAttribute("aria-expanded", "true");
  await expect(inline(root.id)).toContainText(
    "Keep the signed build and rollback together.",
  );
  const restart = async () => {
    await page.reload();
    await ready();
    await page.evaluate((fixtures) => {
      if (!window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__)
        throw new Error("Missing emitter after reload");
      for (const input of fixtures)
        window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__({
          ...input,
          channelName: "general",
        });
    }, fixtures);
  };
  await restart();
  await expect(toggle(root.id)).toHaveAttribute("aria-expanded", "true");
  await expect(inline(root.id)).toContainText(
    "Nested detail: the notarization receipt is attached.",
  );
  await toggle(root.id).click();
  await emit("A newer unread reply must not reopen a saved collapse.", root.id);
  await expect(inline(root.id)).toHaveCount(0);
  await restart();
  await expect(toggle(root.id)).toHaveAttribute("aria-expanded", "false");
  await expect(inline(root.id)).toHaveCount(0);
  await page.screenshot({ path: `${shots}/collapsed-after-reload.png` });
  await page.setViewportSize({ width: 430, height: 900 });
  await toggle(root.id).click();
  await expect(inline(root.id)).toContainText(
    "Nested detail: the notarization receipt is attached.",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(`[data-testid="message-row"][data-message-id="${root.id}"]`)
    .first()
    .scrollIntoViewIfNeeded();
  await page.mouse.move(5, 5);
  await page.screenshot({ path: `${shots}/narrow-inline.png` });
});

test("large inline threads reveal bounded batches", async ({ page }) => {
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
  const rootId = (3000).toString(16).padStart(64, "0");
  await page.evaluate(
    ({ rootId, pubkey }) => {
      const emit = window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__;
      if (!emit) throw new Error("Missing emitter");
      const now = Math.floor(Date.now() / 1000) + 1;
      emit({
        channelName: "general",
        id: rootId,
        content: "A longer engineering discussion",
        pubkey,
        createdAt: now,
      });
      for (let index = 0; index < 55; index++)
        emit({
          channelName: "general",
          id: (3001 + index).toString(16).padStart(64, "0"),
          content: `Engineering reply ${index}`,
          parentEventId: rootId,
          pubkey,
          createdAt: now + index + 1,
        });
    },
    { rootId, pubkey: TEST_IDENTITIES.bob.pubkey },
  );
  await page
    .locator(
      `[data-testid="message-thread-summary"][data-thread-head-id="${rootId}"]`,
    )
    .click();
  const inline = page.locator(
    `[data-testid="inline-thread"][data-thread-head-id="${rootId}"]`,
  );
  await expect(inline.getByTestId("message-row")).toHaveCount(8);
  await expect(
    inline.getByText("Engineering reply 54", { exact: true }),
  ).toHaveCount(0);
  for (const expected of [28, 48, 55]) {
    await inline
      .getByRole("button", { name: /^(More replies|Show \d+ more replies)$/ })
      .click();
    await expect(inline.getByTestId("message-row")).toHaveCount(expected);
  }
  await expect(
    inline.getByText("Engineering reply 54", { exact: true }),
  ).toBeVisible();
});

test("inline channel rows retain search match and active result highlighting", async ({
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
  const needle = "InlineSearchNeedle";
  const root = await page.evaluate(
    (content) =>
      window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__!({
        channelName: "general",
        content,
        createdAt: Math.floor(Date.now() / 1000) + 10,
      }),
    needle,
  );
  await page.keyboard.press("ControlOrMeta+f");
  await page.getByTestId("search-dialog-input").fill(needle);
  const result = page
    .getByTestId("search-results")
    .getByRole("option")
    .filter({ hasText: needle });
  await expect(result).toBeVisible();
  await result.click();
  const row = page
    .getByTestId("message-timeline")
    .locator(`[data-message-id="${root.id}"]`);
  await expect(row.locator("mark")).toHaveText(needle);
  await expect
    .poll(() =>
      row.evaluate((element) =>
        Boolean(element.closest('[class*="before:bg-primary"]')),
      ),
    )
    .toBe(true);
  await page.screenshot({ path: `${shots}/inline-search.png` });
});
