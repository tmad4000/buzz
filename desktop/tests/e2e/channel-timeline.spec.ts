import { expect, test } from "@playwright/test";
import { installMockBridge, TEST_IDENTITIES } from "../helpers/bridge";

test("Timeline flattens replies chronologically, receives live events, sends top-level, and opens exact thread replies", async ({
  page,
}, testInfo) => {
  await installMockBridge(page);
  await page.goto("/");
  await page.waitForFunction(
    () => typeof window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__ === "function",
  );
  const ids = await page.evaluate((pubkey) => {
    const emit = window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__;
    if (!emit) throw new Error("Missing mock emitter");
    const start = Math.floor(Date.now() / 1000) + 20;
    const root = emit({
      channelName: "general",
      content: "Timeline root topic",
      createdAt: start,
      pubkey,
    });
    const other = emit({
      channelName: "general",
      content: "Timeline intervening topic",
      createdAt: start + 1,
      pubkey,
    });
    const reply = emit({
      channelName: "general",
      content: "Timeline first reply",
      parentEventId: root.id,
      createdAt: start + 2,
      pubkey,
    });
    const nested = emit({
      channelName: "general",
      content: "Timeline nested reply",
      parentEventId: reply.id,
      createdAt: start + 3,
      pubkey,
    });
    return {
      root: root.id,
      other: other.id,
      reply: reply.id,
      nested: nested.id,
    };
  }, TEST_IDENTITIES.bob.pubkey);
  await page.getByTestId("channel-general").click();
  const timeline = page.getByTestId("message-timeline");
  const order = page.getByRole("combobox", { name: "Order", exact: true });
  await expect(order).toHaveValue("threads");
  await expect(
    order.getByRole("option", {
      name: "Latest activity",
      exact: true,
    }),
  ).toHaveJSProperty("disabled", false);
  await expect(
    timeline.getByText("Timeline root topic", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("threads-post-time.png"),
    fullPage: true,
  });
  // The existing root's replies are newer than the other root's latest activity.
  await order.selectOption("activity");
  await expect(order).toHaveValue("activity");
  await expect
    .poll(() =>
      timeline
        .getByTestId("message-row")
        .evaluateAll(
          (rows, ids) =>
            rows
              .map((row) => row.getAttribute("data-message-id"))
              .filter((id) => id === ids.root || id === ids.other),
          ids,
        ),
    )
    .toEqual([ids.other, ids.root]);
  await order.selectOption("threads");
  await expect(order).toHaveValue("threads");
  await order.selectOption("timeline");
  await expect(order).toHaveValue("timeline");
  await expect(
    timeline.getByText("Timeline nested reply", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      timeline
        .getByTestId("message-row")
        .evaluateAll(
          (rows, ids) =>
            rows
              .map((row) => row.getAttribute("data-message-id"))
              .filter((id) => id !== null && Object.values(ids).includes(id)),
          ids,
        ),
    )
    .toEqual([ids.root, ids.other, ids.reply, ids.nested]);
  await expect(
    timeline.getByRole("button", {
      name: /↳ in reply to bob: Timeline first reply/i,
    }),
  ).toBeVisible();
  await expect(timeline.getByTestId("message-thread-summary")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__BUZZ_E2E_HAS_MOCK_LIVE_SUBSCRIPTION__?.({
            channelName: "general",
          }) ?? false,
      ),
    )
    .toBe(true);
  await page.evaluate(
    ({ root, pubkey }) =>
      window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__?.({
        channelName: "general",
        content: "Timeline live reply",
        parentEventId: root,
        pubkey,
        createdAt: Math.floor(Date.now() / 1000) + 60,
      }),
    { root: ids.root, pubkey: TEST_IDENTITIES.bob.pubkey },
  );
  await expect(
    timeline.getByText("Timeline live reply", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("timeline-desktop.png"),
    fullPage: true,
  });
  const nestedRow = timeline.locator(
    `[data-testid="message-row"][data-message-id="${ids.nested}"]`,
  );
  await nestedRow.hover();
  await nestedRow.getByRole("button", { name: "Open reactions" }).click();
  const picker = page.locator("em-emoji-picker");
  await picker.locator("input[type='search']").fill("thumbsup");
  await picker.getByRole("button", { name: "👍" }).first().click();
  await expect(
    nestedRow.getByRole("button", { name: "Toggle 👍 reaction" }),
  ).toBeVisible();
  await nestedRow.getByRole("button", { name: "Toggle 👍 reaction" }).click();
  await expect(
    nestedRow.getByRole("button", { name: "Toggle 👍 reaction" }),
  ).toHaveCount(0);
  const input = page.getByTestId("message-input").first();
  await input.fill("Timeline composer top-level");
  await input.press("Enter");
  await expect(
    timeline.getByText("Timeline composer top-level", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const client = window.__BUZZ_E2E_QUERY_CLIENT__ as unknown as {
          getQueriesData: (
            filter: unknown,
          ) => Array<
            [unknown, Array<{ content: string; tags: string[][] }> | undefined]
          >;
        };
        const event = client
          .getQueriesData({ queryKey: ["channel-messages"] })
          .flatMap(([, events]) => events ?? [])
          .find((event) => event.content === "Timeline composer top-level");
        return event?.tags.filter((tag) => tag[0] === "e").length;
      }),
    )
    .toBe(0);
  await page.getByTestId("channel-management-trigger").click();
  await expect(page.getByTestId("channel-management-sheet")).toBeVisible();
  await timeline
    .getByRole("button", { name: /↳ in reply to bob: Timeline first reply/i })
    .click();
  await expect(order).toHaveValue("threads");
  const panel = page.getByTestId("message-thread-panel");
  await expect(panel).toContainText("Timeline root topic");
  await expect(page.getByTestId("channel-management-sheet")).toHaveCount(0);
  await expect(
    panel.locator(
      `[data-testid="message-row"][data-message-id="${ids.nested}"]`,
    ),
  ).toBeVisible();
  await panel
    .getByTestId("message-input")
    .fill("Reply from selected timeline item");
  await panel.getByTestId("message-input").press("Enter");
  await expect(panel).toContainText("Reply from selected timeline item");
  await expect
    .poll(() =>
      page.evaluate((target) => {
        const client = window.__BUZZ_E2E_QUERY_CLIENT__ as unknown as {
          getQueriesData: (
            filter: unknown,
          ) => Array<
            [unknown, Array<{ content: string; tags: string[][] }> | undefined]
          >;
        };
        const event = client
          .getQueriesData({ queryKey: ["thread-replies"] })
          .flatMap(([, events]) => events ?? [])
          .find(
            (event) => event.content === "Reply from selected timeline item",
          );
        return event?.tags.some((tag) => tag[0] === "e" && tag[1] === target);
      }, ids.nested),
    )
    .toBe(true);
  await order.selectOption("timeline");
  await page.getByTestId("channel-random").click();
  await expect(order).toHaveValue("threads");
  await page.getByTestId("channel-general").click();
  await expect(order).toHaveValue("timeline");
  await page.reload();
  await page.getByTestId("channel-general").click();
  await expect(order).toHaveValue("timeline");
});

test("Timeline pages reply subtrees with bounded reads, keeps partial history honest, and retries failures", async ({
  page,
}) => {
  await installMockBridge(page);
  await page.goto("/");
  await page.waitForFunction(
    () => typeof window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__ === "function",
  );
  await page.evaluate((pubkey) => {
    const emit = window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__;
    if (!emit) throw new Error("Missing mock emitter");
    const start = Math.floor(Date.now() / 1000) + 10;
    for (let root = 0; root < 4; root++) {
      const id = `e${root}`.padEnd(64, "0");
      emit({
        channelName: "general",
        id,
        pubkey,
        content: `Paged topic ${root}`,
        createdAt: start,
      });
      for (let i = 0; i < (root === 0 ? 205 : 1); i++) {
        emit({
          channelName: "general",
          parentEventId: id,
          pubkey,
          content: `Paged reply ${root}:${i}`,
          createdAt: start + 1 + root,
        });
      }
    }
    const w = window as typeof window & {
      __timelineProbe?: {
        active: number;
        max: number;
        pages: number;
        fail: boolean;
      };
      __TAURI_INTERNALS__: {
        invoke: (
          command: string,
          payload: unknown,
          options: unknown,
        ) => Promise<unknown>;
      };
    };
    const probe = { active: 0, max: 0, pages: 0, fail: true };
    w.__timelineProbe = probe;
    const invoke = w.__TAURI_INTERNALS__.invoke.bind(w.__TAURI_INTERNALS__);
    w.__TAURI_INTERNALS__.invoke = async (command, payload, options) => {
      if (command !== "get_thread_replies")
        return invoke(command, payload, options);
      probe.active++;
      probe.max = Math.max(probe.max, probe.active);
      const args = payload as { rootEventId: string; cursor: unknown };
      if (args.cursor) probe.pages++;
      try {
        await new Promise((resolve) => setTimeout(resolve, 750));
        if (args.rootEventId.startsWith("e3") && probe.fail)
          throw new Error("Reply history unavailable");
        return await invoke(command, payload, options);
      } finally {
        probe.active--;
      }
    };
  }, TEST_IDENTITIES.bob.pubkey);
  await page.getByTestId("channel-general").click();
  await page
    .getByRole("combobox", { name: "Order", exact: true })
    .selectOption("timeline");
  await expect(
    page.getByRole("status").filter({ hasText: "Loading older replies" }),
  ).toBeVisible();
  await expect(page.getByTestId("message-thread-replies-error")).toBeVisible({
    timeout: 30000,
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const client = window.__BUZZ_E2E_QUERY_CLIENT__ as unknown as {
          getQueriesData: (
            filter: unknown,
          ) => Array<
            [readonly unknown[], Array<{ content: string }> | undefined]
          >;
        };
        const root = client
          .getQueriesData({ queryKey: ["thread-replies"] })
          .find(([key]) => key[2] === "e0".padEnd(64, "0"));
        return (
          root?.[1]?.filter((event) =>
            event.content.startsWith("Paged reply 0:"),
          ).length ?? 0
        );
      }),
    )
    .toBe(205);
  const probe = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __timelineProbe?: { max: number; pages: number };
        }
      ).__timelineProbe,
  );
  expect(probe?.max).toBeLessThanOrEqual(2);
  expect(probe?.pages).toBeGreaterThan(0);
  await page.evaluate(() => {
    const probe = (
      window as typeof window & { __timelineProbe?: { fail: boolean } }
    ).__timelineProbe;
    if (!probe) throw new Error("Missing probe");
    probe.fail = false;
  });
  await page.getByTestId("message-thread-replies-retry").click();
  await expect(page.getByTestId("message-thread-replies-error")).toHaveCount(0);
  await expect(
    page
      .getByTestId("message-timeline")
      .getByText("Paged reply 3:0", { exact: true }),
  ).toBeVisible();
});
