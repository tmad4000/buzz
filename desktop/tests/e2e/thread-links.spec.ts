import { expect, test, type Page } from "@playwright/test";
import { finalizeEvent } from "nostr-tools/pure";
import fs from "node:fs";
import { installMockBridge } from "../helpers/bridge";
import type { RelayEvent } from "../../src/shared/api/types";
import { buildReplyTags } from "../../src/features/messages/lib/threading";

const key = new Uint8Array(32).fill(1); // Synthetic fixture, never a user key.
const shots =
  process.env.BUZZ_THREAD_LINK_SCREENSHOTS ??
  "test-results/thread-links/screenshots";
function signed(
  content: string,
  time: number,
  channelId: string,
  parent?: RelayEvent,
  root = parent,
) {
  return finalizeEvent(
    {
      kind: 9,
      created_at: time,
      content,
      tags:
        parent && root
          ? buildReplyTags(channelId, "", parent.id, root.id)
          : [["h", channelId]],
    },
    key,
  );
}
async function accept(page: Page, event: RelayEvent) {
  await page.evaluate((event) => {
    if (!window.__BUZZ_E2E_ACCEPT_MOCK_EVENT__)
      throw Error("Signed fixture ingress missing");
    window.__BUZZ_E2E_ACCEPT_MOCK_EVENT__({ channelName: "general", event });
  }, event);
}
async function setup(page: Page, options = {}) {
  await installMockBridge(page, {
    ...options,
    searchProfiles: [
      {
        pubkey: finalizeEvent(
          { kind: 9, created_at: 1, content: "", tags: [] },
          key,
        ).pubkey,
        displayName: "Morgan",
        isAgent: false,
      },
    ],
  });
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
  // Resolve the actual fixture channel ID from the existing mock emitter.
  const channelId = await page.evaluate(
    () =>
      window
        .__BUZZ_E2E_EMIT_MOCK_MESSAGE__?.({
          channelName: "general",
          content: "Fixture ready",
          pubkey: "deadbeef".repeat(8),
        })
        ?.tags.find((t) => t[0] === "h")?.[1],
  );
  if (!channelId) throw Error("Fixture channel unavailable");
  return channelId;
}

test("actual timeline/sidebar union: before/after, canonical reply after move and explicit collapse on revisit", async ({
  page,
}) => {
  const channelId = await setup(page);
  let tick = Math.floor(Date.now() / 1000) + 5;
  const a = signed("Release plan — packaging belongs here", tick++, channelId);
  const c = signed(
    "Packaging notes — previously a separate message",
    tick++,
    channelId,
  );
  const detail = signed(
    "Native packaging reply: verify the signed artifact",
    tick++,
    channelId,
    c,
  );
  await accept(page, a);
  await accept(page, c);
  await accept(page, detail);
  await expect(page.getByTestId("message-timeline")).toContainText(c.content);
  fs.mkdirSync(shots, { recursive: true });
  await page.mouse.move(5, 5);
  await page.screenshot({ path: `${shots}/before-native-positions.png` });
  const move = finalizeEvent(
    {
      kind: 9,
      created_at: tick++,
      content:
        "Thread organization: packaging notes are a reply to the release plan.",
      tags: [
        ["h", channelId],
        ["t", "buzz-thread-link-v1"],
        ["buzz-thread-op", "link"],
        ["buzz-thread-child", c.id],
        ["buzz-thread-parent", a.id],
        ["buzz-thread-previous", "none"],
      ],
    },
    key,
  );
  await accept(page, move);
  const summary = page.locator(
    `[data-testid="message-thread-summary"][data-thread-head-id="${a.id}"]`,
  );
  await expect(summary).toBeVisible();
  if ((await summary.getAttribute("aria-expanded")) !== "true")
    await summary.click();
  const inline = page.locator(
    `[data-testid="inline-thread"][data-thread-head-id="${a.id}"]`,
  );
  await expect(inline.getByText(c.content, { exact: true })).toBeVisible();
  const inlineBranch = inline.locator(
    `[data-testid="inline-branch-toggle"][data-thread-head-id="${c.id}"]`,
  );
  if ((await inlineBranch.getAttribute("aria-expanded")) !== "true")
    await inlineBranch.click();
  await expect(inline.getByText(detail.content, { exact: true })).toBeVisible();
  await page
    .locator(
      `[data-testid="open-thread-side-panel"][data-thread-head-id="${a.id}"]`,
    )
    .click();
  const panel = page.getByTestId("message-thread-panel");
  await expect(panel).toBeVisible();
  const rootCollapsed = panel.locator(
    `[data-testid="sidebar-read-branch"][data-thread-head-id="${a.id}"]`,
  );
  if (await rootCollapsed.count()) await rootCollapsed.click();
  await expect(panel.getByText(c.content, { exact: true })).toBeVisible();
  // A new unread descendant auto-expands; if it was already seen, expand its
  // one-line row explicitly without changing the ancestry being tested.
  const hidden = panel.locator(
    `[data-testid="sidebar-read-branch"][data-thread-head-id="${c.id}"]`,
  );
  if (await hidden.count()) await hidden.click();
  await expect(panel.getByText(detail.content, { exact: true })).toBeVisible();
  await panel
    .getByTestId("thread-organization-badge")
    .getByText("Organized reply", { exact: true })
    .click();
  await expect(
    page
      .getByTestId("thread-organization-audit")
      .getByText("Channel top level", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByTestId("thread-organization-audit")
      .getByText(move.id, { exact: true }),
  ).toBeVisible();
  await page.mouse.move(5, 5);
  await page.screenshot({ path: `${shots}/after-audit-receipt.png` });
  await page.keyboard.press("Escape");
  await page.screenshot({ path: `${shots}/after-organized-union.png` });
  // Native reply still names C as the canonical root, and is displayed in A.
  const after = signed(
    "Reply after move: canonical packaging thread retained",
    tick++,
    channelId,
    detail,
    c,
  );
  await accept(page, after);
  await expect(panel.getByText(after.content, { exact: true })).toBeVisible();
  expect(after.tags.find((t) => t[3] === "root")?.[1]).toBe(c.id);
  expect(after.tags.find((t) => t[3] === "reply")?.[1]).toBe(detail.id);
  const collapse = panel.locator(
    `[data-testid="sidebar-hide-branch"][data-thread-head-id="${c.id}"]`,
  );
  await collapse.click();
  await expect(panel.getByText(after.content, { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Close panel", exact: true }).click();
  await page
    .locator(
      `[data-testid="open-thread-side-panel"][data-thread-head-id="${a.id}"]`,
    )
    .click();
  await expect(panel.getByText(after.content, { exact: true })).toHaveCount(0);
  await expect(
    panel.locator(
      `[data-testid="sidebar-read-branch"][data-thread-head-id="${c.id}"]`,
    ),
  ).toBeVisible();
  await page.mouse.move(5, 5);
  await page.screenshot({
    path: `${shots}/after-revisit-explicit-collapse.png`,
  });
  // Exercise the actual composer/send mutation, then inspect its native bridge
  // request and stored reply. The mock backend's normal sends are unsigned;
  // this assertion concerns transport ancestry, not accepting mock signatures.
  await panel
    .locator(
      `[data-testid="sidebar-read-branch"][data-thread-head-id="${c.id}"]`,
    )
    .click();
  await panel.locator(`[data-message-id="${c.id}"]`).first().hover();
  await panel.getByTestId(`reply-message-${c.id}`).click();
  await panel
    .getByTestId("message-input")
    .fill("Composer reply preserves native ancestry");
  await panel.getByTestId("send-message").click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__BUZZ_E2E_COMMAND_PAYLOADS__?.filter(
            (call) => call.command === "send_channel_message",
          ).length ?? 0,
      ),
    )
    .toBeGreaterThan(0);
  const request = (await page.evaluate(
    () =>
      window.__BUZZ_E2E_COMMAND_PAYLOADS__
        ?.filter((call) => call.command === "send_channel_message")
        .at(-1)?.payload,
  )) as { parentEventId: string; rootEventId?: string | null };
  expect(request.parentEventId).toBe(c.id);
  expect(
    request.rootEventId === null ||
      request.rootEventId === undefined ||
      request.rootEventId === c.id,
  ).toBe(true);
  const stored = (await page.evaluate(
    async ({ root, channelId }) =>
      window.__BUZZ_E2E_INVOKE_MOCK_COMMAND__?.("get_thread_replies", {
        rootEventId: root,
        channelId,
        limit: 200,
      }),
    { root: c.id, channelId },
  )) as { events: RelayEvent[] };
  const sent = stored.events.find(
    (event) => event.content === "Composer reply preserves native ancestry",
  );
  expect(sent?.tags.find((tag) => tag[3] === "reply")?.[1]).toBe(c.id);
  expect(sent?.tags.find((tag) => tag[3] === "root")?.[1] ?? c.id).toBe(c.id);
});

test("missing and unauthorized annotations stay visible ordinary content without invented grouping", async ({
  page,
}) => {
  const channelId = await setup(page);
  const tick = Math.floor(Date.now() / 1000) + 5;
  const parent = signed("Review parent", tick, channelId),
    child = signed("Original child stays at top level", tick + 1, channelId);
  await accept(page, parent);
  await accept(page, child);
  const otherKey = new Uint8Array(32).fill(2);
  const invalid = finalizeEvent(
    {
      kind: 9,
      created_at: tick + 2,
      content: "Unauthorized organization remains visible",
      tags: [
        ["h", channelId],
        ["t", "buzz-thread-link-v1"],
        ["buzz-thread-op", "link"],
        ["buzz-thread-child", child.id],
        ["buzz-thread-parent", parent.id],
        ["buzz-thread-previous", "none"],
      ],
    },
    otherKey,
  );
  const missing = finalizeEvent(
    {
      kind: 9,
      created_at: tick + 3,
      content: "Missing-source organization remains visible",
      tags: [
        ["h", channelId],
        ["t", "buzz-thread-link-v1"],
        ["buzz-thread-op", "link"],
        ["buzz-thread-child", "f".repeat(64)],
        ["buzz-thread-parent", parent.id],
        ["buzz-thread-previous", "none"],
      ],
    },
    key,
  );
  await accept(page, invalid);
  await accept(page, missing);
  await expect(page.getByTestId("message-timeline")).toContainText(
    invalid.content,
  );
  await expect(page.getByTestId("message-timeline")).toContainText(
    missing.content,
  );
  await expect(page.getByTestId("thread-organization-notice")).toContainText(
    "review",
  );
  await expect(
    page.locator(
      `[data-testid="message-thread-summary"][data-thread-head-id="${parent.id}"]`,
    ),
  ).toHaveAttribute("aria-label", /0 replies inline$/);
  await page.mouse.move(5, 5);
  await page.screenshot({ path: `${shots}/rejected-and-missing-audit.png` });
});

test("late native-union completion cannot leak a previous channel's organization", async ({
  page,
}) => {
  const channelId = await setup(page, { deferThreadReplies: true });
  const tick = Math.floor(Date.now() / 1000) + 5;
  const a = signed("Previous channel parent", tick, channelId),
    c = signed("Previous channel child", tick + 1, channelId);
  await accept(page, a);
  await accept(page, c);
  const move = finalizeEvent(
    {
      kind: 9,
      created_at: tick + 2,
      content: "Previous channel organization",
      tags: [
        ["h", channelId],
        ["t", "buzz-thread-link-v1"],
        ["buzz-thread-op", "link"],
        ["buzz-thread-child", c.id],
        ["buzz-thread-parent", a.id],
        ["buzz-thread-previous", "none"],
      ],
    },
    key,
  );
  await accept(page, move);
  await expect
    .poll(() =>
      page.evaluate(() => window.__BUZZ_E2E_THREAD_REPLIES_PENDING__?.() ?? 0),
    )
    .toBeGreaterThan(0);
  await page.getByTestId("channel-random").click();
  await expect(page.getByTestId("chat-title")).toHaveText("random");
  await page.evaluate(() => window.__BUZZ_E2E_RELEASE_THREAD_REPLIES__?.());
  await expect(page.getByTestId("message-timeline")).not.toContainText(
    c.content,
  );
  await expect(page.getByTestId("thread-organization-badge")).toHaveCount(0);
  await expect(page.getByTestId("thread-organization-notice")).toHaveCount(0);
  await page.screenshot({ path: `${shots}/stale-scope-contained.png` });
});
