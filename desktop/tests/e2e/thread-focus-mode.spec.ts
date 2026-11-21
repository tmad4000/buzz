import { expect, test, type Locator } from "@playwright/test";

import { installMockBridge } from "../helpers/bridge";
import { waitForMockChannelHeadReady } from "../helpers/channelHeadReady";
import { syntheticComposerPaste } from "../helpers/syntheticComposerPaste";

async function seedLongThread(page: import("@playwright/test").Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => typeof window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__ === "function",
      ),
    )
    .toBe(true);
  return page.evaluate(() => {
    const root = window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__?.({
      channelName: "general",
      content: "Focus mode integration thread",
      createdAt: 1_700_900_000,
    });
    if (!root) throw new Error("Failed to seed focus thread root");

    for (let index = 0; index < 48; index += 1) {
      window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__?.({
        channelName: "general",
        content: `Focus reply ${index}: this deliberately wraps across several lines so changing the thread measure causes real layout reflow.`,
        parentEventId: root.id,
        createdAt: 1_700_900_001 + index,
      });
    }
    return root.id;
  });
}

async function scrollToMiddleVisibleMessage(
  body: import("@playwright/test").Locator,
  threadRootId: string,
): Promise<string> {
  let anchorId: string | null = null;
  await expect
    .poll(async () => {
      anchorId = await body.evaluate((element) => {
        const maxScrollTop = element.scrollHeight - element.clientHeight;
        if (maxScrollTop <= 0) return null;

        const targetScrollTop = Math.floor(maxScrollTop * 0.4);
        element.scrollTop = targetScrollTop;
        element.dispatchEvent(new Event("scroll", { bubbles: true }));

        if (Math.abs(element.scrollTop - targetScrollTop) > 1) return null;
        const bounds = element.getBoundingClientRect();
        const row = Array.from(
          element.querySelectorAll<HTMLElement>("[data-message-id]"),
        ).find((candidate) => {
          const rect = candidate.getBoundingClientRect();
          return rect.bottom > bounds.top && rect.top < bounds.bottom;
        });
        return row?.dataset.messageId ?? null;
      });
      return anchorId !== null && anchorId !== threadRootId;
    })
    .toBe(true);

  if (!anchorId) throw new Error("No visible middle-thread anchor");
  return anchorId;
}

/**
 * The channel header must own its pixels, not merely be "visible".
 *
 * Regression guard for the focus-mode launch: a `z-0` on the channel section
 * created a stacking context that flattened the header's `z-30` beneath the
 * sibling shared header backdrop (also `z-30`), painting the backdrop over the
 * name and actions. Neither `toBeVisible()` nor `elementFromPoint` can catch
 * this — the backdrop is `pointer-events-none`, so hit-testing skips it. We
 * compare CSS paint order directly: walk each element's stacking-context
 * chain, find the branches under their common stacking context, and check the
 * header's branch wins (higher z-index, or later in DOM order on a tie).
 */
async function expectChannelHeaderUnobscured(
  page: import("@playwright/test").Page,
) {
  const title = page.getByTestId("chat-title");
  await expect(title).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const titleEl = document.querySelector('[data-testid="chat-title"]');
        const backdropEl = document.querySelector(
          '[data-testid="channel-shared-header-backdrop"]',
        );
        if (!titleEl) return "missing title";
        if (!backdropEl) return "missing backdrop";

        const createsStackingContext = (el: Element): boolean => {
          const style = getComputedStyle(el);
          if (style.position !== "static" && style.zIndex !== "auto")
            return true;
          if (parseFloat(style.opacity) < 1) return true;
          if (style.transform !== "none") return true;
          if (style.filter !== "none") return true;
          const backdropFilter =
            style.backdropFilter ??
            (style as unknown as { webkitBackdropFilter?: string })
              .webkitBackdropFilter;
          if (backdropFilter && backdropFilter !== "none") return true;
          if (style.isolation === "isolate") return true;
          if (
            style.contain.includes("paint") ||
            style.contain.includes("strict")
          )
            return true;
          return false;
        };

        // Chain of stacking-context roots from the element up to <html>.
        const stackingChain = (el: Element): Element[] => {
          const chain: Element[] = [el];
          let current: Element | null = el.parentElement;
          while (current) {
            if (
              createsStackingContext(current) ||
              current === document.documentElement
            ) {
              chain.push(current);
            }
            current = current.parentElement;
          }
          return chain;
        };

        const titleChain = stackingChain(titleEl);
        const backdropChain = stackingChain(backdropEl);
        const common = titleChain.find((el) => backdropChain.includes(el));
        if (!common) return "no common stacking context";

        // Branch = the child-of-common entry each element paints through.
        const titleBranch = titleChain[titleChain.indexOf(common) - 1];
        const backdropBranch = backdropChain[backdropChain.indexOf(common) - 1];
        if (!titleBranch || !backdropBranch) return "degenerate chain";

        const effectiveZ = (el: Element): number => {
          const z = getComputedStyle(el).zIndex;
          return z === "auto" ? 0 : parseInt(z, 10);
        };
        const titleZ = effectiveZ(titleBranch);
        const backdropZ = effectiveZ(backdropBranch);
        if (titleZ !== backdropZ) {
          return titleZ > backdropZ ? true : "backdrop paints above header";
        }
        // Tie: later in DOM order paints on top.
        const order = backdropBranch.compareDocumentPosition(titleBranch);
        return (order & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
          ? true
          : "backdrop paints above header";
      }),
    )
    .toBe(true);
}

test("focus and split preserve reading context and interaction ownership", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(() => {
    localStorage.setItem("buzz.channels.threadViewMode", "focus");
  });
  await installMockBridge(page, {
    managedAgents: [
      {
        pubkey:
          "953d3363262e86b770419834c53d2446409db6d918a57f8f339d495d54ab001f",
        name: "alice",
        status: "stopped",
      },
    ],
  });
  await page.goto("/");
  const rootId = await seedLongThread(page);

  await page.getByTestId("channel-general").click();
  await expectChannelHeaderUnobscured(page);
  const summary = page.locator(
    `[data-testid="message-thread-summary"][data-thread-head-id="${rootId}"]`,
  );
  await expect(summary).toBeVisible();
  await summary.click();

  const channel = page.getByTestId("channel-drop-zone");
  const drawer = page.getByTestId("focus-thread-drawer");
  const body = page.getByTestId("message-thread-body");
  await expect(drawer).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean(
          document
            .querySelector('[data-testid="focus-thread-drawer"]')
            ?.contains(document.activeElement),
        ),
      ),
    )
    .toBe(true);
  await expect(channel).toHaveAttribute("inert", "");

  const anchorId = await scrollToMiddleVisibleMessage(body, rootId);

  const focusModeToggle = page.getByRole("button", {
    name: "Show thread beside channel",
  });
  await focusModeToggle.hover();
  await expect(
    page.getByRole("tooltip", { name: "Show thread beside channel" }),
  ).toBeVisible();
  await focusModeToggle.click();
  await expect(drawer).toHaveCount(0);
  await expect(channel).not.toHaveAttribute("inert", "");
  await expectChannelHeaderUnobscured(page);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(page.getByTestId("message-thread-body")).toBeFocused();
  await expect(summary).not.toBeFocused();
  await expect(
    body.locator(`[data-message-id="${anchorId}"]`),
  ).toBeInViewport();
  await expect(
    body.locator(`[data-message-id="${anchorId}"]`),
  ).not.toHaveAttribute("data-highlighted", "true");

  // Sidebar background dismissal belongs to the overlay presentation only.
  await page
    .getByTestId("app-sidebar-scroll-anchor")
    .evaluate((element) => (element as HTMLElement).click());
  await expect(page.getByTestId("message-thread-panel")).toBeVisible();

  const splitModeToggle = page.getByRole("button", { name: "Expand thread" });
  await splitModeToggle.focus();
  await splitModeToggle.press("Enter");
  await expect(drawer).toBeVisible();
  await expect(channel).toHaveAttribute("inert", "");
  await expect(page.getByTestId("thread-view-mode-toggle")).toBeFocused();
  await expect(
    body.locator(`[data-message-id="${anchorId}"]`),
  ).toBeInViewport();

  // Focus mode owns Escape even while the rich-text composer and one of its
  // nested controls has focus: one press exits the focused thread.
  const threadInput = page
    .getByTestId("message-thread-panel")
    .getByTestId("message-input");
  await threadInput.click();
  await threadInput.pressSequentially("@al");
  await expect(
    page
      .getByTestId("message-thread-panel")
      .getByTestId("mention-autocomplete"),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("focus-thread-drawer-overlay")).toHaveCount(0);
  await expect(channel).not.toHaveAttribute("inert", "");

  await summary.click();
  await expect(drawer).toBeVisible();
  const profileCard = page.getByTestId("sidebar-profile-card");
  await profileCard.click({ position: { x: 8, y: 8 } });
  await expect(page.getByTestId("profile-popover")).toBeVisible();
  await expect(drawer).toBeVisible();
  await profileCard.click({ position: { x: 8, y: 8 } });
  await expect(page.getByTestId("profile-popover")).toHaveCount(0);
  await page
    .getByTestId("app-sidebar-scroll-anchor")
    .evaluate((element) => (element as HTMLElement).click());
  await expect(page.getByTestId("focus-thread-drawer-overlay")).toHaveCount(0);

  await summary.click();
  await expect(drawer).toBeVisible();
  await page.getByTestId("focus-thread-drawer-scrim").click({
    position: { x: 24, y: 200 },
  });
  await expect(page.getByTestId("focus-thread-drawer-overlay")).toHaveCount(0);
  await expect(channel).not.toHaveAttribute("inert", "");
});

test("narrow threads do not offer an unavailable layout switch", async ({
  page,
}) => {
  await page.setViewportSize({ width: 860, height: 720 });
  await installMockBridge(page);
  await page.goto("/");
  const rootId = await seedLongThread(page);
  await page.getByTestId("channel-general").click();
  const summary = page.locator(
    `[data-testid="message-thread-summary"][data-thread-head-id="${rootId}"]`,
  );
  await expect(summary).toBeVisible();
  await summary.click();
  await expect(page.getByTestId("message-thread-panel")).toBeVisible();
  await expect(page.getByTestId("thread-view-mode-toggle")).toHaveCount(0);
});

const PASTE_PREFIX = "draft-before:";
const PASTE_SUFFIX = `:draft-after${"s".repeat(8_000)}`;
const PASTE_REPLY = "Reply target for large synthetic drafts";

async function exerciseComposerPaste(
  editor: Locator,
  text: string,
  html: string,
  suffix: string,
) {
  await editor.fill(PASTE_PREFIX + suffix);
  const inserted = text.replaceAll("\n", "");
  const result = await editor.evaluate(
    async (node, fixture) => {
      const input = node as HTMLElement;
      const viewport = input.closest<HTMLElement>(
        '[data-testid="message-input-scroll"]',
      );
      const selection = document.getSelection();
      const start = document
        .createTreeWalker(input, NodeFilter.SHOW_TEXT)
        .nextNode();
      if (!viewport || !selection || !start) {
        throw new Error("Expanded reply composer has no selectable draft");
      }

      selection.collapse(start, fixture.prefix.length);
      // Let ProseMirror observe the real DOM selection before pasting, then
      // wait past the old deferred-scroll frame before measuring the result.
      const frame = () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await frame();
      await frame();
      const expectedBeforeCaret = fixture.prefix + fixture.inserted;
      const selectionRangeAtInsertion = () => {
        const anchor = selection.anchorNode;
        if (!selection.isCollapsed || !anchor || !input.contains(anchor))
          return null;
        const range = document.createRange();
        range.selectNodeContents(input);
        range.setEnd(anchor, selection.anchorOffset);
        return range.toString() === expectedBeforeCaret ? range : null;
      };
      const data = new DataTransfer();
      data.setData("text/plain", fixture.text);
      if (fixture.html) data.setData("text/html", fixture.html);
      const consumed = !input.dispatchEvent(
        new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: data,
        }),
      );
      const immediateCaret = selectionRangeAtInsertion() !== null;
      const immediateFocus = document.activeElement === input;
      await frame();
      await frame();

      const sameInput =
        input.isConnected &&
        viewport.querySelector('[data-testid="message-input"]') === input;
      const range = selectionRangeAtInsertion();
      range?.collapse(false);
      let caret = range?.getBoundingClientRect();
      if (range && !caret?.height) {
        // At a mark boundary Chromium can expose an element-level caret.
        // Measure the last inserted glyph without moving the live selection.
        const textNodes = document.createTreeWalker(
          input,
          NodeFilter.SHOW_TEXT,
        );
        let remaining = expectedBeforeCaret.length;
        for (
          let leaf = textNodes.nextNode();
          leaf;
          leaf = textNodes.nextNode()
        ) {
          const length = leaf.textContent?.length ?? 0;
          if (remaining <= length) {
            range.setStart(leaf, remaining - 1);
            range.setEnd(leaf, remaining);
            caret = range.getBoundingClientRect();
            break;
          }
          remaining -= length;
        }
      }
      const bounds = viewport.getBoundingClientRect();
      const visible = Boolean(
        caret &&
          caret.height > 0 &&
          caret.top >= bounds.top - 1 &&
          caret.bottom <= bounds.bottom + 1,
      );
      return {
        consumed,
        immediateCaret,
        immediateFocus,
        sameInput,
        focused: document.activeElement === input,
        exactContent:
          input.textContent ===
          fixture.prefix + fixture.inserted + fixture.suffix,
        insertionEndsAtCaret: range !== null,
        visible,
        scrolled: viewport.scrollTop > 0,
        hasRichMark: Boolean(input.querySelector("strong")),
      };
    },
    { text, html, suffix, inserted, prefix: PASTE_PREFIX },
  );
  expect(result).toEqual({
    consumed: true,
    immediateCaret: true,
    immediateFocus: true,
    sameInput: true,
    focused: true,
    exactContent: true,
    insertionEndsAtCaret: true,
    visible: true,
    scrolled: true,
    hasRichMark: Boolean(html),
  });
  await editor.page().keyboard.insertText("!");
  expect(
    await editor.evaluate(
      (input, expected) => input.textContent === expected,
      `${PASTE_PREFIX}${inserted}!${suffix}`,
    ),
  ).toBe(true);
}

for (const bytes of [20_000, 100_000]) {
  for (const flavor of ["plain", "rich"] as const) {
    test(`expanded thread reply keeps the caret after a ${bytes}-byte ${flavor} paste`, async ({
      page,
    }) => {
      // Allow cold app startup and two complete 100 KB pastes on slower hosts.
      // The immediate and next-frame caret assertions still have no retry.
      test.setTimeout(60_000);
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.addInitScript(() => {
        localStorage.setItem("buzz.channels.threadViewMode", "focus");
      });
      await installMockBridge(page);
      await page.goto("/");
      await page.getByTestId("channel-general").click();
      await waitForMockChannelHeadReady(
        page,
        "general",
        "9a1657ac-f7aa-5db0-b632-d8bbeb6dfb50",
      );

      const { rootId, replyId } = await page.evaluate((replyText) => {
        const emit = window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__;
        if (!emit) throw new Error("Missing mock message emitter");
        const createdAt = Math.floor(Date.now() / 1000) + 10;
        const thread = emit({
          channelName: "general",
          content: "Large paste test thread",
          createdAt,
        });
        const reply = emit({
          channelName: "general",
          content: replyText,
          parentEventId: thread.id,
          createdAt: createdAt + 1,
        });
        return { rootId: thread.id, replyId: reply.id };
      }, PASTE_REPLY);

      await page
        .locator(
          `[data-testid="open-thread-side-panel"][data-thread-head-id="${rootId}"]`,
        )
        .click();
      const drawer = page.getByTestId("focus-thread-drawer");
      await expect(drawer).toBeVisible();
      const reply = drawer.locator(
        `[data-message-id="${replyId}"][data-testid="message-row"]`,
      );
      await reply.hover();
      await reply.getByTestId(`reply-message-${replyId}`).click();
      const replyTarget = drawer.getByTestId("reply-target");
      await expect(replyTarget).toContainText(PASTE_REPLY);

      const editor = drawer.getByTestId("message-input");
      const fixture = syntheticComposerPaste(bytes);
      const html = flavor === "rich" ? fixture.html : "";
      await exerciseComposerPaste(editor, fixture.text, html, "");
      await exerciseComposerPaste(editor, fixture.text, html, PASTE_SUFFIX);
      await expect(replyTarget).toContainText(PASTE_REPLY);
    });
  }
}
