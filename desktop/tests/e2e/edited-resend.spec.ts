import { expect, test, type Page } from "@playwright/test";
import { installMockBridge, TEST_IDENTITIES } from "../helpers/bridge";
import { waitForMockChannelHeadReady } from "../helpers/channelHeadReady";
const PASEO =
  "38ba46f41d56ff5c71cfbfb856d00b209e6216a218260d2a30c4f1b712bdd1cb";
const ACTOR = "deadbeef".repeat(8),
  CHANNEL = "9a1657ac-f7aa-5db0-b632-d8bbeb6dfb50";
async function boot(page: Page, member: boolean) {
  await installMockBridge(page);
  await page.goto("/");
  await page.getByTestId("channel-general").click();
  await waitForMockChannelHeadReady(page, "general", CHANNEL);
  if (member)
    await page.evaluate(
      async ({ channel, paseo }) => {
        await window.__BUZZ_E2E_INVOKE_MOCK_COMMAND__?.("add_channel_members", {
          channelId: channel,
          pubkeys: [paseo],
          role: "bot",
        });
        await window.__BUZZ_E2E_QUERY_CLIENT__?.invalidateQueries({
          queryKey: ["channels", channel, "members"],
        });
      },
      { channel: CHANNEL, paseo: PASEO },
    );
}
async function emit(
  page: Page,
  id: string,
  content: string,
  pubkey = ACTOR,
  kind = 9,
  extraTags: string[][] = [],
  createdAt = Math.floor(Date.now() / 1000) + 30,
) {
  return page.evaluate(
    (input) =>
      window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__?.({
        ...input,
        channelName: "general",
      }),
    { id, content, pubkey, kind, extraTags, createdAt },
  );
}
async function triggers(page: Page) {
  return page.evaluate(() =>
    (window.__BUZZ_E2E_COMMAND_PAYLOADS__ ?? []).flatMap((call) => {
      if (call.command !== "plugin:websocket|send") return [];
      const msg = (call.payload as { message?: { type: string; data: string } })
        ?.message;
      if (msg?.type !== "Text") return [];
      const [type, event] = JSON.parse(msg.data);
      return type === "EVENT" &&
        event.kind === 7 &&
        event.tags.some(
          (t: string[]) => t[0] === "t" && t[1] === "paseo-resend-v1",
        )
        ? [event]
        : [];
    }),
  );
}
test("edited label exposes edit time; explicit resend stays Pending until Paseo eyes for the exact trigger", async ({
  page,
}, info) => {
  await boot(page, true);
  const id = "a1".repeat(32),
    edit = "a2".repeat(32),
    at = Math.floor(Date.now() / 1000) + 40;
  await emit(page, id, "Original edited resend test");
  await emit(
    page,
    edit,
    "Latest edited resend body",
    ACTOR,
    40003,
    [["e", id]],
    at,
  );
  const row = page
    .locator(`[data-testid="message-row"][data-message-id="${id}"]`)
    .first();
  await expect(row).toContainText("Latest edited resend body");
  const stamp = row.getByTestId("message-edited");
  await expect(stamp).toHaveText("(edited)");
  await expect(stamp).toHaveAttribute(
    "datetime",
    new Date(at * 1000).toISOString(),
  );
  await expect(stamp).toHaveAttribute("title", /^Edited /);
  expect(await triggers(page)).toHaveLength(0);
  await row.hover();
  await row.getByTestId(`more-actions-${id}`).click();
  await page
    .getByRole("menuitem", { name: "Resend to Paseo", exact: true })
    .click();
  await expect(row.getByTestId("paseo-resend-status")).toHaveText("Pending");
  await expect.poll(async () => (await triggers(page)).length).toBe(1);
  const [trigger] = await triggers(page);
  expect(trigger.pubkey).toBe(ACTOR);
  expect(trigger.content).toBe("🔁");
  expect(trigger.tags).toEqual([
    ["h", CHANNEL],
    ["e", id],
    ["edit", edit],
    ["t", "paseo-resend-v1"],
  ]);
  await emit(page, "a3".repeat(32), "👀", TEST_IDENTITIES.bob.pubkey, 7, [
    ["e", trigger.id],
  ]);
  await expect(row.getByTestId("paseo-resend-status")).toHaveText("Pending");
  await emit(page, "a4".repeat(32), "👀", PASEO, 7, [["e", id]]);
  await expect(row.getByTestId("paseo-resend-status")).toHaveText("Pending");
  await emit(page, "a5".repeat(32), "👀", PASEO, 7, [["e", trigger.id]]);
  await expect(row.getByTestId("paseo-resend-status")).toHaveText(
    "Sent to Paseo",
  );
  // Same body, new authorized edit: row memo must retain the new revision/time.
  const next = "a6".repeat(32);
  await emit(
    page,
    next,
    "Latest edited resend body",
    ACTOR,
    40003,
    [["e", id]],
    at + 10,
  );
  await expect(stamp).toHaveAttribute(
    "datetime",
    new Date((at + 10) * 1000).toISOString(),
  );
  await expect(row.getByTestId("paseo-resend-status")).toHaveCount(0);
  await row.hover();
  await row.getByTestId(`more-actions-${id}`).click();
  await page
    .getByRole("menuitem", { name: "Resend to Paseo", exact: true })
    .click();
  await expect.poll(async () => (await triggers(page)).length).toBe(2);
  const second = (await triggers(page))[1];
  expect(second.tags.find((t: string[]) => t[0] === "edit")).toEqual([
    "edit",
    next,
  ]);
  await expect(row.getByTestId("paseo-resend-status")).toHaveText("Pending");
  await emit(page, "a7".repeat(32), "👀", PASEO, 7, [["e", second.id]]);
  await expect(row.getByTestId("paseo-resend-status")).toHaveText(
    "Sent to Paseo",
  );
  await page.screenshot({
    path: info.outputPath("edited-resend-acknowledged.png"),
  });
});
test("no automatic resend and no action without Paseo membership or for another author's edit", async ({
  page,
}) => {
  await boot(page, false);
  const own = "b1".repeat(32),
    other = "b3".repeat(32);
  await emit(page, own, "Own original no Paseo");
  await emit(page, "b2".repeat(32), "Own edited no Paseo", ACTOR, 40003, [
    ["e", own],
  ]);
  const row = page
    .locator(`[data-testid="message-row"][data-message-id="${own}"]`)
    .first();
  await expect(row.getByTestId("message-edited")).toBeVisible();
  await row.hover();
  await row.getByTestId(`more-actions-${own}`).click();
  await expect(
    page.getByRole("menuitem", { name: "Resend to Paseo", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.evaluate(
    async ({ channel, paseo }) => {
      await window.__BUZZ_E2E_INVOKE_MOCK_COMMAND__?.("add_channel_members", {
        channelId: channel,
        pubkeys: [paseo],
        role: "bot",
      });
      await window.__BUZZ_E2E_QUERY_CLIENT__?.invalidateQueries({
        queryKey: ["channels", channel, "members"],
      });
    },
    { channel: CHANNEL, paseo: PASEO },
  );
  await emit(page, other, "Other original", TEST_IDENTITIES.bob.pubkey);
  await emit(
    page,
    "b4".repeat(32),
    "Other edited",
    TEST_IDENTITIES.bob.pubkey,
    40003,
    [["e", other]],
  );
  const otherRow = page
    .locator(`[data-testid="message-row"][data-message-id="${other}"]`)
    .first();
  await expect(otherRow.getByTestId("message-edited")).toBeVisible();
  await otherRow.hover();
  await otherRow.getByTestId(`more-actions-${other}`).click();
  await expect(
    page.getByRole("menuitem", { name: "Resend to Paseo", exact: true }),
  ).toHaveCount(0);
  expect(await triggers(page)).toHaveLength(0);
});

test("own edited DM with canonical Paseo member supports explicit resend and trigger acknowledgement", async ({
  page,
}) => {
  await boot(page, false);
  const dm = await page.evaluate(async (paseo) => {
    const channel = (await window.__BUZZ_E2E_INVOKE_MOCK_COMMAND__?.(
      "open_dm",
      { pubkeys: [paseo] },
    )) as { id: string; name: string };
    await window.__BUZZ_E2E_QUERY_CLIENT__?.invalidateQueries({
      queryKey: ["channels"],
    });
    return channel;
  }, PASEO);
  await page.evaluate(
    ({ channelId, channelName, paseo }) =>
      window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__?.({
        channelId,
        channelName,
        pubkey: paseo,
        id: "c0".repeat(32),
        content: "DM fixture context",
        createdAt: Math.floor(Date.now() / 1000) - 60,
      }),
    { channelId: dm.id, channelName: dm.name, paseo: PASEO },
  );
  await page
    .locator(`[data-testid="channel-${dm.name}"][data-channel-id="${dm.id}"]`)
    .click();
  await waitForMockChannelHeadReady(page, dm.name, dm.id);
  const id = "c1".repeat(32),
    edit = "c2".repeat(32),
    now = Math.floor(Date.now() / 1000) + 30;
  await page.evaluate(
    ({ id, edit, now, channelName, channelId, actor }) => {
      const emit = window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__;
      emit?.({
        id,
        content: "Own DM original",
        pubkey: actor,
        channelName,
        channelId,
        createdAt: now,
      });
      emit?.({
        id: edit,
        content: "Own DM edited",
        pubkey: actor,
        channelName,
        channelId,
        createdAt: now + 1,
        kind: 40003,
        extraTags: [["e", id]],
      });
    },
    { id, edit, now, channelName: dm.name, channelId: dm.id, actor: ACTOR },
  );
  const row = page
    .locator(`[data-testid="message-row"][data-message-id="${id}"]`)
    .first();
  await expect(row.getByTestId("message-edited")).toBeVisible();
  await row.hover();
  await row.getByTestId(`more-actions-${id}`).click();
  await page
    .getByRole("menuitem", { name: "Resend to Paseo", exact: true })
    .click();
  await expect(row.getByTestId("paseo-resend-status")).toHaveText("Pending");
  await expect.poll(async () => (await triggers(page)).length).toBe(1);
  const [trigger] = await triggers(page);
  expect(trigger.tags).toEqual([
    ["h", dm.id],
    ["e", id],
    ["edit", edit],
    ["t", "paseo-resend-v1"],
  ]);
  await page.evaluate(
    ({ trigger, channelName, channelId, paseo }) =>
      window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__?.({
        channelName,
        channelId,
        pubkey: paseo,
        kind: 7,
        content: "👀",
        extraTags: [["e", trigger]],
        createdAt: Math.floor(Date.now() / 1000) + 100,
      }),
    {
      trigger: trigger.id,
      channelName: dm.name,
      channelId: dm.id,
      paseo: PASEO,
    },
  );
  await expect(row.getByTestId("paseo-resend-status")).toHaveText(
    "Sent to Paseo",
  );
});
