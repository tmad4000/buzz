import { waitForMockChannelHeadReady } from "../helpers/channelHeadReady";
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import { installMockBridge, TEST_IDENTITIES } from "../helpers/bridge";

const shots =
  process.env.BUZZ_INLINE_SCREENSHOTS ?? "test-results/inline-threads";
test("held durable inline publish preserves queue height, anchor and real nested Reply hit testing", async ({
  page,
}, info) => {
  await installMockBridge(page);
  await page.goto("/");
  await page.getByTestId("channel-general").click();
  await waitForMockChannelHeadReady(
    page,
    "general",
    "9a1657ac-f7aa-5db0-b632-d8bbeb6dfb50",
  );
  await page.keyboard.press("ControlOrMeta+,");
  await page.getByTestId("settings-nav-appearance").click();
  await page.getByTestId("thread-display-channels-collapsed").click();
  await page.getByTestId("thread-display-replies-expanded").click();
  await page.getByTestId("settings-back-to-app").click();
  await page.getByTestId("channel-random").click();
  await page.getByTestId("channel-general").click();
  await waitForMockChannelHeadReady(
    page,
    "general",
    "9a1657ac-f7aa-5db0-b632-d8bbeb6dfb50",
  );
  const root = "f1".repeat(32),
    child = "f2".repeat(32),
    other = "f3".repeat(32);
  await page.evaluate(
    ({ root, child, other, pubkey }) => {
      const emit = window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__;
      if (!emit) throw new Error("Missing mock emitter");
      const createdAt = Math.floor(Date.now() / 1000) + 30;
      const messages: [string, string, string?][] = [
        [root, "Held inline root", undefined],
        [child, "Held inline nested target", root],
        ["f4".repeat(32), "Existing nested reply", child],
        [other, "Independent panel root", undefined],
        ["f5".repeat(32), "Independent panel reply", other],
      ];
      messages.forEach(([id, content, parentEventId], index) => {
        emit({
          id,
          content,
          parentEventId,
          pubkey,
          channelName: "general",
          createdAt: createdAt + index,
        });
      });
    },
    { root, child, other, pubkey: TEST_IDENTITIES.bob.pubkey },
  );
  const inline = page.locator(
    `[data-testid="inline-thread"][data-thread-head-id="${root}"]`,
  );
  await page
    .locator(
      `[data-testid="message-thread-summary"][data-thread-head-id="${root}"]`,
    )
    .click();
  await expect(inline).toContainText("Existing nested reply");
  await page
    .locator(
      `[data-testid="open-thread-side-panel"][data-thread-head-id="${other}"]`,
    )
    .click();
  const editor = inline.getByTestId("message-input");
  await editor.fill("Held pending inline reply");
  await page.evaluate(() => window.__BUZZ_E2E_HOLD_OUTBOX_PUBLISH__?.(true));
  try {
    await inline.getByTestId("send-message").click();
    await expect
      .poll(() =>
        page.evaluate(() => window.__BUZZ_E2E_HELD_OUTBOX_PUBLISHES__?.()),
      )
      .toBe(1);
    await expect(editor).toBeEmpty();
    const queued = inline
      .getByRole("article", { name: "Queued message" })
      .filter({
        has: page.getByText("Held pending inline reply", { exact: true }),
      });
    await expect(queued).toHaveCount(1);
    await expect(queued).toBeVisible();
    const target = inline.locator(`[data-message-id="${child}"]`);
    await target.hover();
    const before = await target.boundingBox();
    if (!before) throw new Error("Missing visible nested Reply target");
    const beforeInline = await inline.boundingBox();
    if (!beforeInline) throw new Error("Missing inline layout box");
    const height = beforeInline.height;
    const timeline = page.getByTestId("message-timeline");
    const estimates = Number(
      await timeline.getAttribute("data-virtua-estimate-call-count"),
    );
    const scroll = await timeline.evaluate((element) => element.scrollTop);
    // A real pointer click must succeed while delivery and the queue row are held.
    await inline.getByTestId(`reply-message-${child}`).click({ timeout: 5000 });
    await expect(queued).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => window.__BUZZ_E2E_HELD_OUTBOX_PUBLISHES__?.()),
      )
      .toBe(1);
    const samples = await target.evaluate(async (element) => {
      const scroller = element.closest('[data-testid="message-timeline"]');
      if (!(scroller instanceof HTMLElement))
        throw new Error("Missing timeline owner");
      const rows = [];
      for (let frame = 0; frame < 12; frame++) {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        rows.push({
          top: element.getBoundingClientRect().top,
          scrollTop: scroller.scrollTop,
          estimateCalls: Number(scroller.dataset.virtuaEstimateCallCount),
        });
      }
      return rows;
    });
    await info.attach("held-inline-layout-samples", {
      body: JSON.stringify({ before, height, estimates, scroll, samples }),
      contentType: "application/json",
    });
    expect(
      Math.max(...samples.map((row) => row.top)) -
        Math.min(...samples.map((row) => row.top)),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.max(...samples.map((row) => row.scrollTop)) -
        Math.min(...samples.map((row) => row.scrollTop)),
    ).toBeLessThanOrEqual(1);
    expect(samples.at(-1)?.estimateCalls).toBe(samples[0].estimateCalls);
    const afterInline = await inline.boundingBox();
    if (!afterInline) throw new Error("Inline layout disappeared during click");
    expect(Math.abs(afterInline.height - height)).toBeLessThanOrEqual(1);
    expect(
      Math.abs(samples[samples.length - 1].top - before.y),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(samples[samples.length - 1].scrollTop - scroll),
    ).toBeLessThanOrEqual(1);
    expect(
      await page.evaluate(() =>
        window.__BUZZ_E2E_HOLD_OUTBOX_PUBLISH__?.(false),
      ),
    ).toBe(1);
    const pendingBody = inline
      .getByTestId("message-body")
      .filter({ hasText: /^Held pending inline reply$/ });
    await expect(pendingBody).toBeVisible();
    await expect(queued).toHaveCount(0);
    await editor.fill("Nested send after held publish");
    await inline.getByTestId("send-message").click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window.__BUZZ_E2E_COMMAND_PAYLOADS__ ?? [])
            .filter((call) => call.command === "publish_queued_message")
            .map(
              (call) =>
                (call.payload as { event: { tags: string[][] } }).event.tags,
            ),
        ),
      )
      .toContainEqual(
        expect.arrayContaining([
          ["e", root, "", "root"],
          ["e", child, "", "reply"],
        ]),
      );
    await expect(page.getByTestId("message-thread-panel")).toContainText(
      "Independent panel root",
    );
  } finally {
    await page.evaluate(() => window.__BUZZ_E2E_HOLD_OUTBOX_PUBLISH__?.(false));
  }
});

test("incoming replies above and below a scrolled reader preserve anchor, focused draft and exact caret", async ({
  page,
}, info) => {
  await installMockBridge(page);
  await page.goto("/");
  await page.getByTestId("channel-general").click();
  await waitForMockChannelHeadReady(
    page,
    "general",
    "9a1657ac-f7aa-5db0-b632-d8bbeb6dfb50",
  );
  await page.keyboard.press("ControlOrMeta+,");
  await page.getByTestId("settings-nav-appearance").click();
  await page.getByTestId("thread-display-channels-smart").click();
  await page.getByTestId("thread-display-replies-expanded").click();
  await page.getByTestId("settings-back-to-app").click();
  await page.getByTestId("channel-random").click();
  await page.getByTestId("channel-general").click();
  await waitForMockChannelHeadReady(
    page,
    "general",
    "9a1657ac-f7aa-5db0-b632-d8bbeb6dfb50",
  );
  const ids = {
    closed: "e1".repeat(32),
    above: "e2".repeat(32),
    anchor: "e3".repeat(32),
    below: "e4".repeat(32),
  };
  await page.evaluate(
    ({ ids, pubkey }) => {
      const emit = window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__;
      if (!emit) throw new Error("Missing mock emitter");
      const createdAt = Math.floor(Date.now() / 1000) + 30;
      emit({
        id: ids.closed,
        content: "Quiet thread above reader",
        pubkey,
        createdAt,
        channelName: "general",
      });
      emit({
        id: ids.above,
        content: "Expanded above reader",
        pubkey,
        createdAt: createdAt + 1,
        channelName: "general",
      });
      emit({
        id: "e5".repeat(32),
        parentEventId: ids.above,
        content: "Existing above reply",
        pubkey,
        createdAt: createdAt + 2,
        channelName: "general",
      });
      for (let index = 0; index < 3; index++) {
        emit({
          id: (8800 + index).toString(16).padStart(64, "0"),
          content: `Earlier spacer row ${index}`,
          pubkey,
          createdAt: createdAt + 3 + index,
          channelName: "general",
        });
      }
      emit({
        id: ids.anchor,
        content: "Reader anchor message",
        pubkey,
        createdAt: createdAt + 6,
        channelName: "general",
      });
      for (let index = 0; index < 18; index++)
        emit({
          id: (9000 + index).toString(16).padStart(64, "0"),
          content: `Middle reading row ${index}`,
          pubkey,
          createdAt: createdAt + 7 + index,
          channelName: "general",
        });
      emit({
        id: ids.below,
        content: "Expanded below reader",
        pubkey,
        createdAt: createdAt + 25,
        channelName: "general",
      });
      emit({
        id: "e6".repeat(32),
        parentEventId: ids.below,
        content: "Existing below reply",
        pubkey,
        createdAt: createdAt + 26,
        channelName: "general",
      });
      for (let index = 0; index < 17; index++)
        emit({
          id: (10000 + index).toString(16).padStart(64, "0"),
          content: `Later reading row ${index}`,
          pubkey,
          createdAt: createdAt + 27 + index,
          channelName: "general",
        });
    },
    { ids, pubkey: TEST_IDENTITIES.bob.pubkey },
  );
  const timeline = page.getByTestId("message-timeline");
  await timeline.evaluate((element) => {
    element.scrollTop = 0;
  });
  const anchor = timeline.locator(
    `[data-testid="message-row"][data-message-id="${ids.anchor}"]`,
  );
  await expect(anchor).toHaveCount(1);
  await anchor.evaluate((element) => {
    const scroller = element.closest('[data-testid="message-timeline"]');
    if (!(scroller instanceof HTMLElement))
      throw new Error("Missing scroll owner");
    scroller.scrollTop +=
      element.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top -
      120;
  });
  await timeline.hover();
  await page.mouse.wheel(0, -20);
  const aboveInline = timeline.locator(
    `[data-testid="inline-thread"][data-thread-head-id="${ids.above}"]`,
  );
  const belowInline = timeline.locator(
    `[data-testid="inline-thread"][data-thread-head-id="${ids.below}"]`,
  );
  await expect(aboveInline).toContainText("Existing above reply");
  await expect(belowInline).toContainText("Existing below reply");
  const assertOffscreenBaseline = async () => {
    const viewport = await timeline.boundingBox();
    const aboveBox = await aboveInline.boundingBox();
    const belowBox = await belowInline.boundingBox();
    if (!viewport || !aboveBox || !belowBox)
      throw new Error("Missing above/below reading geometry");
    expect(aboveBox.y + aboveBox.height).toBeLessThanOrEqual(viewport.y);
    expect(belowBox.y).toBeGreaterThanOrEqual(viewport.y + viewport.height);
    const bottomGap = await timeline.evaluate(
      (element) =>
        element.scrollHeight - element.scrollTop - element.clientHeight,
    );
    expect(bottomGap).toBeGreaterThan(32);
    return { viewport, aboveBox, belowBox, bottomGap };
  };
  await assertOffscreenBaseline();
  const main = page
    .getByTestId("message-composer")
    .filter({ has: page.getByTestId("send-to-thread") });
  const editor = main.getByTestId("message-input");
  const draft = "Keep this exact draft and middle caret";
  await editor.fill(draft);
  await editor.evaluate((element) => {
    element.focus();
    const node = document
      .createTreeWalker(element, NodeFilter.SHOW_TEXT)
      .nextNode();
    if (!node) throw new Error("Missing authored text node");
    const range = document.createRange();
    range.setStart(node, 7);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  const baselineBoxes = await assertOffscreenBaseline();
  const readingAnchor = await timeline.evaluate((container) => {
    const viewport = container.getBoundingClientRect();
    const rows = [
      ...container.querySelectorAll<HTMLElement>(
        '[data-testid="message-row"][data-message-id]',
      ),
    ]
      .filter((row) => {
        const rect = row.getBoundingClientRect();
        return rect.bottom > viewport.top && rect.top < viewport.bottom;
      })
      .sort(
        (a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top,
      );
    return rows[0]?.dataset.messageId;
  });
  if (!readingAnchor) throw new Error("Missing first visible reading anchor");
  const capture = () =>
    editor.evaluate((element, anchorId) => {
      const row = document.querySelector(
        `[data-testid="message-row"][data-message-id="${anchorId}"]`,
      );
      const scroller = row?.closest('[data-testid="message-timeline"]');
      if (!(row instanceof HTMLElement) || !(scroller instanceof HTMLElement))
        throw new Error("Reading anchor left the mounted window");
      const selection = window.getSelection();
      return {
        top: row.getBoundingClientRect().top,
        scrollTop: scroller.scrollTop,
        focused: document.activeElement === element,
        text: element.textContent,
        anchorText: selection?.anchorNode?.textContent,
        anchorOffset: selection?.anchorOffset,
        focusText: selection?.focusNode?.textContent,
        focusOffset: selection?.focusOffset,
        collapsed: selection?.isCollapsed,
      };
    }, readingAnchor);
  const before = await capture();
  expect(before.focused).toBe(true);
  expect(before.text).toBe(draft);
  expect(before.anchorOffset).toBe(7);
  expect(before.collapsed).toBe(true);
  const snapshots = [];
  for (const [index, parent] of [ids.above, ids.below, ids.closed].entries()) {
    const arrivalBoxes = await assertOffscreenBaseline();
    const beforeArrival = await capture();
    await page.evaluate(
      ({ parent, index, pubkey }) =>
        window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__?.({
          id: (11000 + index).toString(16).padStart(64, "0"),
          parentEventId: parent,
          content: `Incoming scoped reply ${index}`,
          pubkey,
          createdAt: Math.floor(Date.now() / 1000) + 100 + index,
          channelName: "general",
        }),
      { parent, index, pubkey: TEST_IDENTITIES.bob.pubkey },
    );
    const summary = timeline.locator(
      `[data-testid="message-thread-summary"][data-thread-head-id="${parent}"]`,
    );
    await expect(summary).toHaveAttribute("data-unseen", "true");
    await expect(summary).toContainText(
      parent === ids.closed ? "1 reply" : "2 replies",
    );
    // Check visual anchoring, not raw scrollTop: height growth above may require exact compensation.
    for (let frame = 0; frame < 12; frame++) {
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          ),
      );
      const current = await capture();
      snapshots.push({ parent, arrivalBoxes, ...current });
      expect(Math.abs(current.top - before.top)).toBeLessThanOrEqual(1);
      if (parent !== ids.above) {
        expect(
          Math.abs(current.scrollTop - beforeArrival.scrollTop),
        ).toBeLessThanOrEqual(1);
      }
      expect({
        ...current,
        top: before.top,
        scrollTop: before.scrollTop,
      }).toEqual(before);
    }
  }
  const closedSummary = timeline.locator(
    `[data-testid="message-thread-summary"][data-thread-head-id="${ids.closed}"]`,
  );
  await expect(closedSummary).toHaveAttribute("aria-expanded", "false");
  await expect(closedSummary).toContainText("1 new");
  await expect(
    timeline.locator(
      `[data-testid="inline-thread"][data-thread-head-id="${ids.closed}"]`,
    ),
  ).toHaveCount(0);
  await info.attach("incoming-reader-anchor-and-selection", {
    body: JSON.stringify({ before, baselineBoxes, readingAnchor, snapshots }),
    contentType: "application/json",
  });
});

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
    await waitForMockChannelHeadReady(
      page,
      "general",
      "9a1657ac-f7aa-5db0-b632-d8bbeb6dfb50",
    );
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
  await expect(inline(fresh.id)).not.toContainText("No replies yet.");
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
  await waitForMockChannelHeadReady(
    page,
    "general",
    "9a1657ac-f7aa-5db0-b632-d8bbeb6dfb50",
  );
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
  await waitForMockChannelHeadReady(
    page,
    "general",
    "9a1657ac-f7aa-5db0-b632-d8bbeb6dfb50",
  );
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
