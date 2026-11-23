import { expect, test, type Locator, type Page } from "@playwright/test";
import { installMockBridge, TEST_IDENTITIES } from "../helpers/bridge";
import { waitForMockChannelHeadReady } from "../helpers/channelHeadReady";
import { openSettings } from "../helpers/settings";

test("Timeline flattens replies chronologically, receives live events, sends top-level, and keeps quote jumps in place", async ({
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
      name: "Jump to original from bob: Timeline first reply",
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
  await expect(input).toHaveText("Timeline composer top-level");
  const commandStart = await page.evaluate(
    () => (window.__BUZZ_E2E_COMMAND_PAYLOADS__ ?? []).length,
  );
  await input.press("Enter");
  // Draft clearing proves admission, not mock publication/readback or rendering.
  let acceptedEventId = "";
  await expect
    .poll(async () => {
      acceptedEventId = await page.evaluate(
        async ({ content, channelId, start }) => {
          const call = (window.__BUZZ_E2E_COMMAND_PAYLOADS__ ?? []).slice(start).find(
            (entry) => {
              if (entry.command !== "publish_queued_message") return false;
              const event = (entry.payload as {
                event?: { content: string; kind: number; tags: string[][] };
              }).event;
              return (
                event?.kind === 9 &&
                event.content === content &&
                event.tags.some((tag) => tag[0] === "h" && tag[1] === channelId)
              );
            },
          );
          if (!call) return "";
          const payload = call.payload as {
            event: { id: string; pubkey: string };
            expectedSignerPubkey: string;
          };
          const published = payload.event;
          if (
            !/^[a-f0-9]{64}$/.test(published.id) ||
            !/^[a-f0-9]{64}$/.test(payload.expectedSignerPubkey) ||
            published.pubkey !== payload.expectedSignerPubkey
          ) {
            return "";
          }
          const read = window.__BUZZ_E2E_INVOKE_MOCK_COMMAND__;
          if (!read) throw new Error("Missing mock event reader");
          let raw: unknown;
          try {
            raw = await read("get_event", { eventId: published.id });
          } catch (error) {
            if (String(error).includes(`Event not found: ${published.id}`))
              return "";
            throw error;
          }
          if (typeof raw !== "string") return "";
          const recorded = JSON.parse(raw) as {
            pubkey: string;
            id: string;
            content: string;
            kind: number;
            tags: string[][];
          };
          return recorded.id === published.id &&
            recorded.pubkey === published.pubkey &&
            recorded.content === content &&
            recorded.kind === 9 &&
            recorded.tags.some((tag) => tag[0] === "h" && tag[1] === channelId)
            ? recorded.id
            : "";
        },
        {
          content: "Timeline composer top-level",
          channelId: GENERAL_ID,
          start: commandStart,
        },
      );
      return acceptedEventId;
    }, {
      message:
        "Current send must reach exact mock-store event readback before row assertions",
    })
    .toMatch(/^[a-f0-9]{64}$/);
  await testInfo.attach("timeline-mock-recorded-event", {
    body: JSON.stringify({
      eventId: acceptedEventId,
      commandStart,
      boundary: "mock-store readback; not durable checkpoint or native proof",
    }),
    contentType: "application/json",
  });
  await expect(
    timeline.locator(
      `[data-testid="message-row"][data-message-id="${acceptedEventId}"]`,
    ),
  ).toBeVisible();
  await expect(
    timeline.getByText("Timeline composer top-level", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate((eventId) => {
        const client = window.__BUZZ_E2E_QUERY_CLIENT__ as unknown as {
          getQueriesData: (
            filter: unknown,
          ) => Array<
            [
              unknown,
              Array<{ id: string; content: string; tags: string[][] }> | undefined,
            ]
          >;
        };
        const event = client
          .getQueriesData({ queryKey: ["channel-messages"] })
          .flatMap(([, events]) => events ?? [])
          .find(
            (event) =>
              event.id === eventId &&
              event.content === "Timeline composer top-level",
          );
        return event?.tags.filter((tag) => tag[0] === "e").length;
      }, acceptedEventId),
    )
    .toBe(0);
  // Reply and quote navigation stay in Timeline; telegram-replies.spec.ts
  // covers the in-place composer, jump and signed tags.
  await timeline
    .getByRole("button", {
      name: "Jump to original from bob: Timeline first reply",
    })
    .click();
  await expect(order).toHaveValue("timeline");
  await expect(page.getByTestId("message-thread-panel")).toHaveCount(0);
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

const GENERAL_ID = "9a1657ac-f7aa-5db0-b632-d8bbeb6dfb50";
const COLLAPSE_FIXTURE = {
  root: "ca".repeat(32),
  reply: "cb".repeat(32),
  nested: "cc".repeat(32),
  shortBody: "Short topic with all of its replies",
  longBody: `## Paseo follow-up\n\n${"Verification evidence is attached below. ".repeat(25)}\n\n**Exact original ending.**`,
};

async function openCollapseFixture(page: Page) {
  await page.getByTestId("channel-general").click();
  await waitForMockChannelHeadReady(page, "general", GENERAL_ID);
  await page.evaluate(
    ({ fixture, pubkey }) => {
      const emit = window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__;
      if (!emit) throw new Error("Missing mock message emitter");
      const createdAt = Math.floor(Date.now() / 1000) + 20;
      emit({
        channelName: "general",
        id: fixture.root,
        content: fixture.shortBody,
        createdAt,
        pubkey,
      });
      emit({
        channelName: "general",
        id: fixture.reply,
        parentEventId: fixture.root,
        content: fixture.longBody,
        createdAt: createdAt + 1,
        pubkey,
      });
      emit({
        channelName: "general",
        id: fixture.nested,
        parentEventId: fixture.reply,
        content: "The nested follow-up remains visible.",
        createdAt: createdAt + 2,
        pubkey,
      });
    },
    { fixture: COLLAPSE_FIXTURE, pubkey: TEST_IDENTITIES.bob.pubkey },
  );
}

async function controlledMessageBody(row: Locator, toggle: Locator) {
  const target = await toggle.getAttribute("aria-controls");
  if (!target) throw new Error("Missing message body disclosure target");
  return row.locator(`[id=${JSON.stringify(target)}]`);
}

test("Timeline clamps a long message, restores expanded state, and copies the exact Markdown", async ({
  page,
}) => {
  await installMockBridge(page, undefined, { seedPreviewFeatures: false });
  await page.goto("/");
  await openCollapseFixture(page);
  const order = page.getByRole("combobox", { name: "Order", exact: true });
  await order.selectOption("timeline");

  const timeline = page.getByTestId("message-timeline");
  const reply = timeline.locator(
    `[data-message-id="${COLLAPSE_FIXTURE.reply}"][data-testid="message-row"]`,
  );
  const showMore = reply.getByRole("button", { name: "Show more" });
  await expect(showMore).toHaveAttribute("aria-expanded", "false");
  const content = await controlledMessageBody(reply, showMore);
  await expect(content).toHaveJSProperty("inert", true);
  await expect(content).toHaveCSS("overflow", "hidden");
  await expect(content).not.toHaveCSS("mask-image", "none");
  await expect
    .poll(() =>
      content.evaluate((node) => node.scrollHeight > node.clientHeight),
    )
    .toBe(true);

  await reply.hover();
  const actions = reply.getByTestId(`more-actions-${COLLAPSE_FIXTURE.reply}`);
  await actions.click();
  await page
    .getByRole("menuitem", { name: "Copy message", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => window.__BUZZ_E2E_LAST_CLIPBOARD__?.text))
    .toBe(COLLAPSE_FIXTURE.longBody);

  // The copy menu restores its trigger focus asynchronously on close.
  // Let that handoff finish before assigning keyboard ownership to disclosure.
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(actions).toHaveAttribute("aria-expanded", "false");
  await expect(actions).toBeFocused();
  await showMore.focus();
  await expect(showMore).toBeFocused();
  const disclosureButton = await showMore.elementHandle();
  const controlledBodyId = await showMore.getAttribute("aria-controls");
  if (!disclosureButton || !controlledBodyId)
    throw new Error("Missing disclosure button or controlled body");
  await page.keyboard.press("Enter");
  const showLess = reply.getByRole("button", { name: "Show less" });
  await expect(showLess).toBeFocused();
  expect(
    await showLess.evaluate(
      (node, original) => node === original,
      disclosureButton,
    ),
  ).toBe(true);
  await expect(showLess).toHaveAttribute("aria-controls", controlledBodyId);
  await expect(showLess).toHaveAttribute("aria-expanded", "true");
  await expect(content).toHaveJSProperty("inert", false);
  await expect(
    content.getByText("Exact original ending.", { exact: true }),
  ).toBeVisible();

  await page.reload();
  await openCollapseFixture(page);
  await order.selectOption("timeline");
  await expect(showLess).toHaveAttribute("aria-expanded", "true");
  await expect(
    reply.getByText("Exact original ending.", { exact: true }),
  ).toBeVisible();
});

test.describe("message disclosure on touch", () => {
  test.use({ hasTouch: true, viewport: { width: 1000, height: 850 } });

  test("short and long thread bodies disclose independently of nested reply links and drafts", async ({
    page,
  }) => {
    await installMockBridge(page, undefined, { seedPreviewFeatures: false });
    await page.goto("/");
    await openCollapseFixture(page);
    const timeline = page.getByTestId("message-timeline");
    const root = timeline.locator(
      `[data-message-id="${COLLAPSE_FIXTURE.root}"][data-testid="message-row"]`,
    );

    await root.getByTestId(`more-actions-${COLLAPSE_FIXTURE.root}`).tap();
    await page
      .getByRole("menuitem", { name: "Collapse message", exact: true })
      .tap();
    const showRoot = root.getByRole("button", { name: "Show more" });
    await expect(showRoot).toHaveAttribute("aria-expanded", "false");
    const rootBody = await controlledMessageBody(root, showRoot);
    await expect(rootBody).toBeHidden();

    await timeline
      .locator(
        `[data-testid="open-thread-side-panel"][data-thread-head-id="${COLLAPSE_FIXTURE.root}"]`,
      )
      .tap();
    const panel = page.getByTestId("message-thread-panel");
    const reply = panel.locator(
      `[data-message-id="${COLLAPSE_FIXTURE.reply}"][data-testid="message-row"]`,
    );
    const chip = panel.locator(
      `[data-testid="thread-parent-quote"][data-parent-message-id="${COLLAPSE_FIXTURE.reply}"]`,
    );
    const editor = panel.getByTestId("message-input");
    await editor.fill("Keep this sidebar draft");
    const showMore = reply.getByRole("button", { name: "Show more" });
    await expect(showMore).toHaveAttribute("aria-expanded", "false");
    const body = await controlledMessageBody(reply, showMore);
    await expect(chip).toBeVisible();
    await expect(
      panel.getByText("The nested follow-up remains visible.", { exact: true }),
    ).toBeVisible();
    await showMore.tap();
    await expect(body).toHaveJSProperty("inert", false);
    await expect(
      body.getByText("Exact original ending.", { exact: true }),
    ).toBeVisible();
    await expect(chip).toBeVisible();
    await expect(editor).toHaveText("Keep this sidebar draft");
    await chip.tap();
    await expect(reply).toHaveClass(/route-target-highlight-fade/);
    await expect(editor).toHaveText("Keep this sidebar draft");
  });
});

async function seedReadingConversation(page: Page, thread: boolean) {
  const seeded = await page.evaluate(
    ({ thread, pubkey }) => {
      const emit = window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__;
      if (!emit) throw new Error("Missing mock messages");
      // These are live emissions after channel opening, so keep them inside
      // the loaded mock window (whose oldest initial row is now - 120).
      const createdAt = Math.floor(Date.now() / 1000) - 100;
      const root = emit({
        channelName: "general",
        pubkey,
        createdAt,
        content: "Reading return root",
      });
      let timelineTailId = "";
      let panelWindowTailId = "";
      for (let index = 1; index <= 65; index++) {
        const sample = emit({
          channelName: "general",
          pubkey,
          createdAt: createdAt + index,
          parentEventId: thread ? root.id : undefined,
          content: `Reading sample ${index}\n\nA separate paragraph keeps the scroll test measurable.\n\nLast line of sample ${index}.`,
        });
        timelineTailId = sample.id;
        if (index === 40) panelWindowTailId = sample.id;
      }
      return { rootId: root.id, timelineTailId, panelWindowTailId };
    },
    { thread, pubkey: TEST_IDENTITIES.bob.pubkey },
  );
  if (!thread) {
    const scroller = page.getByTestId("message-timeline");
    // Emission is not proof the deferred virtualized surface has admitted it.
    await expect(
      scroller.locator(`[data-testid="message-row"][data-message-id="${seeded.timelineTailId}"]`),
    ).toBeInViewport();
    return scroller;
  }
  const rootRow = page
    .getByTestId("message-timeline")
    .locator(`[data-testid="message-row"][data-message-id="${seeded.rootId}"]`);
  await expect(rootRow).toHaveCount(1);
  await rootRow.scrollIntoViewIfNeeded();
  await expect(rootRow).toBeInViewport();
  const opener = page.locator(
    `[data-testid="open-thread-side-panel"][data-thread-head-id="${seeded.rootId}"]`,
  );
  await expect(opener).toHaveCount(1);
  await expect(opener).toBeVisible();
  await expect(opener).toBeEnabled();
  // Test this exact control's normal keyboard activation after realization.
  await opener.focus();
  await expect(opener).toBeFocused();
  await page.keyboard.press("Enter");
  const panel = page.getByTestId("message-thread-panel");
  await expect(panel).toBeVisible();
  await expect(
    panel.locator(`[data-testid="message-row"][data-message-id="${seeded.rootId}"]`),
  ).toBeVisible();
  const scroller = page.getByTestId("message-thread-body");
  // The existing bounded panel initially admits 40 replies, not all 65.
  await expect(
    scroller.locator(`[data-testid="message-row"][data-message-id="${seeded.panelWindowTailId}"]`),
  ).toBeVisible();
  await expect(
    scroller
      .getByTestId("message-thread-replies")
      .locator('[data-render-pending="true"]'),
  ).toHaveCount(0);
  return scroller;
}

async function wheelToReadingPosition(
  scroller: Locator,
  viewports: number | "start",
) {
  await expect(scroller).toHaveCSS("overflow-y", /auto|scroll/);
  await scroller.hover();
  // Re-measure after each real gesture; never compete with the reader anchor
  // by assigning scrollTop between gestures. Corrections are fixture setup,
  // bounded independently of the unchanged final position assertions.
  for (let correction = 0; correction < 4; correction++) {
    const metrics = await scroller.evaluate((node) => ({
      top: node.scrollTop,
      height: node.clientHeight,
      total: node.scrollHeight,
    }));
    expect(metrics.height).toBeGreaterThan(0);
    const target =
      viewports === "start"
        ? 0
        : metrics.total - metrics.height * (1 + viewports);
    const delta = target - metrics.top;
    const aligned =
      viewports === "start"
        ? metrics.top === 0
        : Math.abs(delta) / metrics.height < 0.08;
    if (correction > 0 && aligned) return;
    await scroller.page().mouse.wheel(0, delta);
    await expect
      .poll(() =>
        scroller.evaluate(async (node) => {
          const top = node.scrollTop;
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          });
          return node.scrollTop === top;
        }),
      )
      .toBe(true);
  }
}

async function scrollReadingDistance(scroller: Locator, viewports: number) {
  await expect
    .poll(() =>
      scroller.evaluate(
        (node) => (node.scrollHeight - node.clientHeight) / node.clientHeight,
      ),
    )
    .toBeGreaterThan(viewports);
  await wheelToReadingPosition(scroller, viewports);
  await expect
    .poll(() =>
      scroller.evaluate(
        (node, distance) =>
          Math.abs(
            (node.scrollHeight - node.clientHeight - node.scrollTop) /
              node.clientHeight -
              distance,
          ),
        viewports,
      ),
    )
    .toBeLessThan(0.08);
}

async function currentReadingAnchor(scroller: Locator) {
  return scroller.evaluate((node) => {
    const { top, bottom } = node.getBoundingClientRect();
    for (const row of node.querySelectorAll<HTMLElement>("[data-message-id]")) {
      const bounds = row.getBoundingClientRect();
      if (bounds.bottom > top && bounds.top < bottom)
        return { id: row.dataset.messageId ?? "", offset: bounds.top - top };
    }
    return null;
  });
}

async function expectReadingAnchor(
  scroller: Locator,
  anchor: Awaited<ReturnType<typeof currentReadingAnchor>>,
) {
  if (!anchor) throw new Error("Expected a visible reading anchor");
  await expect
    .poll(async () => {
      const current = await currentReadingAnchor(scroller);
      return current?.id === anchor.id
        ? Math.abs(current.offset - anchor.offset)
        : Infinity;
    })
    .toBeLessThan(2);
}

async function sendReadingMessage(surface: Locator, text: string) {
  const input = surface.getByTestId("message-input");
  await input.fill(text);
  await input.press("Enter");
}

async function openReadingChannel(page: Page) {
  await page.goto("/");
  await page.getByTestId("channel-general").click();
  await waitForMockChannelHeadReady(page, "general", GENERAL_ID);
}

test("Timeline confirmed sends return to the exact row and offset by pill, browser Back, and Cmd-[", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "platform", { value: "MacIntel" }),
  );
  await installMockBridge(page);
  await openReadingChannel(page);
  const scroller = await seedReadingConversation(page, false);
  const surface = page.getByTestId("channel-composer-overlay");
  const originIndex = await page.evaluate(() => history.state.__TSR_index);
  const back = surface.getByTestId("send-scroll-back");
  for (const method of ["pill", "browser", "keyboard"]) {
    await scrollReadingDistance(scroller, 1.7);
    const anchor = await currentReadingAnchor(scroller);
    const message = `Confirmed Timeline send using ${method}`;
    await sendReadingMessage(surface, message);
    await expect(back).toBeVisible();
    await expect(scroller.getByText(message, { exact: true })).toBeInViewport();
    if (method === "pill") await back.click();
    else if (method === "browser") await page.evaluate(() => history.back());
    else await page.keyboard.press("Meta+[");
    await expect(back).toHaveCount(0);
    await expectReadingAnchor(scroller, anchor);
    await expect
      .poll(() => page.evaluate(() => history.state.__TSR_index))
      .toBe(originIndex);
  }
  await page.evaluate(() => history.back());
  await expect
    .poll(() => page.evaluate(() => history.state.__TSR_index))
    .toBe(originIndex - 1);
});

test("Timeline return pill dismisses after manual scroll or 30 seconds but Back still restores", async ({
  page,
}) => {
  await page.clock.install();
  await installMockBridge(page);
  await openReadingChannel(page);
  const scroller = await seedReadingConversation(page, false);
  const surface = page.getByTestId("channel-composer-overlay");
  const back = surface.getByTestId("send-scroll-back");
  await scrollReadingDistance(scroller, 0.55);
  await sendReadingMessage(surface, "Confirmed within one viewport");
  await expect(
    scroller.getByText("Confirmed within one viewport", { exact: true }),
  ).toBeInViewport();
  await expect(back).toHaveCount(0);
  for (const cause of ["manual", "timeout"]) {
    await scrollReadingDistance(scroller, 1.7);
    const anchor = await currentReadingAnchor(scroller);
    await sendReadingMessage(surface, `Confirmed before ${cause} dismissal`);
    await expect(back).toBeVisible();
    if (cause === "manual") {
      await scroller.hover({ position: { x: 80, y: 90 } });
      await page.mouse.wheel(0, -120);
    } else {
      await page.clock.fastForward(30_100);
    }
    await expect(back).toHaveCount(0);
    await page.evaluate(() => history.back());
    await expectReadingAnchor(scroller, anchor);
  }
});

for (const thread of [false, true]) {
  test(`Stay where I am when sending keeps the ${thread ? "thread" : "Timeline"} anchor`, async ({
    page,
  }) => {
    await page.addInitScript(() =>
      localStorage.setItem("buzz.channels.threadViewMode", "focus"),
    );
    await installMockBridge(page);
    await openReadingChannel(page);
    await openSettings(page, "appearance");
    const preference = page.getByRole("switch", {
      name: "Stay where I am when sending",
    });
    await expect(preference).not.toBeChecked();
    await preference.click();
    await expect(preference).toBeChecked();
    await page.getByTestId("settings-back-to-app").click();
    await expect(page.getByTestId("settings-view")).toHaveCount(0);
    const scroller = await seedReadingConversation(page, thread);
    const surface = page.getByTestId(
      thread ? "message-thread-panel" : "channel-composer-overlay",
    );
    await scrollReadingDistance(scroller, 1.55);
    const anchor = await currentReadingAnchor(scroller);
    const message = thread
      ? "Confirmed thread reply while staying"
      : "Confirmed Timeline send while staying";
    await sendReadingMessage(surface, message);
    if (thread) {
      // The mock records a published event only after its acceptance path.
      // Wait for that exact event before testing the strict Sent UI contract.
      await expect
        .poll(() =>
          page.evaluate(async ({ content, channelId }) => {
            const call = (window.__BUZZ_E2E_COMMAND_PAYLOADS__ ?? []).find(
              (entry) => {
                if (entry.command !== "publish_queued_message") return false;
                const event = (entry.payload as {
                  event?: { content: string; kind: number; tags: string[][] };
                }).event;
                return (
                  event?.kind === 9 &&
                  event.content === content &&
                  event.tags.some((tag) => tag[0] === "h" && tag[1] === channelId)
                );
              },
            );
            if (!call) return false;
            const event = (call.payload as { event: { id: string } }).event;
            const read = window.__BUZZ_E2E_INVOKE_MOCK_COMMAND__;
            if (!read) throw new Error("Missing mock event reader");
            let raw: unknown;
            try {
              raw = await read("get_event", { eventId: event.id });
            } catch (error) {
              if (String(error).includes(`Event not found: ${event.id}`))
                return false;
              throw error;
            }
            if (typeof raw !== "string") return false;
            const accepted = JSON.parse(raw) as { id: string; content: string };
            return accepted.id === event.id && accepted.content === content;
          }, { content: message, channelId: GENERAL_ID }),
        )
        .toBe(true);
    }
    const sent = surface.getByTestId("send-scroll-sent");
    await expect(sent).toHaveText("Sent ↓");
    await expectReadingAnchor(scroller, anchor);
    await sent.click();
    const back = surface.getByTestId("send-scroll-back");
    await expect(back).toBeVisible();
    await expect(scroller.getByText(message, { exact: true })).toBeInViewport();
    if (thread) await page.evaluate(() => history.back());
    else await back.click();
    await expectReadingAnchor(scroller, anchor);
  });
}

test("an expanded thread jumps to its confirmed reply and restores the original offset", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("buzz.channels.threadViewMode", "focus"),
  );
  await installMockBridge(page);
  await openReadingChannel(page);
  const scroller = await seedReadingConversation(page, true);
  const panel = page.getByTestId("message-thread-panel");
  await scrollReadingDistance(scroller, 1.55);
  const anchor = await currentReadingAnchor(scroller);
  const message = "Confirmed expanded thread reply";
  await sendReadingMessage(panel, message);
  const back = panel.getByTestId("send-scroll-back");
  await expect(back).toBeVisible();
  await expect(scroller.getByText(message, { exact: true })).toBeInViewport();
  await back.click();
  await expectReadingAnchor(scroller, anchor);
});

async function failNextReadingAdmission(page: Page) {
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
        throw new Error("Synthetic send rejected");
      }
      return Reflect.apply(original, this, args);
    };
    IDBDatabase.prototype.transaction = wrapped;
    (
      window as Window & { __readingAdmission?: typeof probe }
    ).__readingAdmission = probe;
  });
  return {
    count: () =>
      page.evaluate(
        () =>
          (window as Window & { __readingAdmission?: { count: number } })
            .__readingAdmission?.count,
      ),
    restore: () =>
      page.evaluate(() => {
        const current = window as Window & {
          __readingAdmission?: { restore(): void };
        };
        current.__readingAdmission?.restore();
        delete current.__readingAdmission;
      }),
  };
}

test("a failed Timeline send creates no receipt and leaves the draft and reading anchor", async ({
  page,
}) => {
  await installMockBridge(page, {}, { seedPreviewFeatures: false });
  await openReadingChannel(page);
  const scroller = await seedReadingConversation(page, false);
  const surface = page.getByTestId("channel-composer-overlay");
  await scrollReadingDistance(scroller, 1.55);
  const anchor = await currentReadingAnchor(scroller);
  const publishCountBefore = await page.evaluate(() =>
    (window.__BUZZ_E2E_COMMAND_PAYLOADS__ ?? []).filter(
      (call) => call.command === "publish_queued_message",
    ).length,
  );
  const admission = await failNextReadingAdmission(page);
  try {
    await sendReadingMessage(surface, "This synthetic draft must stay");
    await expect(
      page.getByText("Synthetic send rejected", { exact: false }),
    ).toBeVisible();
    await expect(surface.getByTestId("message-input")).toHaveText(
      "This synthetic draft must stay",
    );
    await expect(surface.getByTestId("send-scroll-back")).toHaveCount(0);
    await expect(surface.getByTestId("send-scroll-sent")).toHaveCount(0);
    expect(await admission.count()).toBe(1);
    expect(
      await page.evaluate(() =>
        (window.__BUZZ_E2E_COMMAND_PAYLOADS__ ?? []).filter(
          (call) => call.command === "publish_queued_message",
        ).length,
      ),
    ).toBe(publishCountBefore);
    await expectReadingAnchor(scroller, anchor);
  } finally {
    await admission.restore();
  }
});

test("an inline reply waits for ACK and returns through the containing Timeline", async ({
  page,
}) => {
  await installMockBridge(page);
  await openReadingChannel(page);
  const scroller = await seedReadingConversation(page, false);
  const root = await page.evaluate((pubkey) => {
    const emit = window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__;
    if (!emit) throw new Error("Missing mock messages");
    // Precede the reading samples while remaining inside the live window.
    const createdAt = Math.floor(Date.now() / 1000) - 110;
    const root = emit({
      channelName: "general",
      pubkey,
      createdAt,
      content: "Inline return root",
    });
    emit({
      channelName: "general",
      pubkey,
      createdAt: createdAt + 1,
      parentEventId: root.id,
      content: "Earlier inline reply",
    });
    return root.id;
  }, TEST_IDENTITIES.bob.pubkey);
  await wheelToReadingPosition(scroller, "start");
  await expect.poll(() => scroller.evaluate((node) => node.scrollTop)).toBe(0);
  await expect(
    scroller.locator(`[data-testid="message-row"][data-message-id="${root}"]`),
  ).toBeInViewport();
  const summary = scroller.locator(
    `[data-testid="message-thread-summary"][data-thread-head-id="${root}"]`,
  );
  await expect(summary).toBeVisible();
  if ((await summary.getAttribute("aria-expanded")) !== "true")
    await summary.click();
  const inline = scroller.locator(
    `[data-testid="inline-thread"][data-thread-head-id="${root}"]`,
  );
  const editor = inline.getByTestId("message-input");
  const back = page
    .getByTestId("channel-composer-overlay")
    .getByTestId("send-scroll-back");
  await editor.fill("Confirmed inline reply");
  await expect
    .poll(() =>
      scroller.evaluate(
        (node) =>
          (node.scrollHeight - node.clientHeight - node.scrollTop) /
          node.clientHeight,
      ),
    )
    .toBeGreaterThan(1);
  const anchor = await currentReadingAnchor(scroller);
  await page.evaluate(() => window.__BUZZ_E2E_HOLD_OUTBOX_PUBLISH__?.(true));
  try {
    await editor.press("Enter");
    await expect
      .poll(() =>
        page.evaluate(() => window.__BUZZ_E2E_HELD_OUTBOX_PUBLISHES__?.()),
      )
      .toBe(1);
    await expect(back).toHaveCount(0);
  } finally {
    await page.evaluate(() => window.__BUZZ_E2E_HOLD_OUTBOX_PUBLISH__?.(false));
  }
  await expect(back).toBeVisible();
  const delivered = inline
    .getByTestId("inline-thread-replies")
    .locator('article[data-message-id]:not([data-message-id^="pending-"])')
    .filter({ has: page.getByText("Confirmed inline reply", { exact: true }) });
  await expect(delivered).toHaveCount(1);
  await expect(delivered).toBeInViewport();
  await back.click();
  await expectReadingAnchor(scroller, anchor);
});
