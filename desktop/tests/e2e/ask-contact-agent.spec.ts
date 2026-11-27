import { expect, test, type Page } from "@playwright/test";

import { waitForAnimations } from "../helpers/animations";
import { installMockBridge } from "../helpers/bridge";

// Synthetic identities only: a contact (Rowan), the agent Rowan owns (Scout,
// NIP-OA owner = Rowan, opted in to answer anyone), and a second agent.
const ROWAN = "ab".repeat(32);
const SCOUT = "5c".repeat(32);
const BOOKER = "b0".repeat(32);
const STRANGER = "ee".repeat(32);
const GENERAL = "9a1657ac-f7aa-5db0-b632-d8bbeb6dfb50";
const CONTACT_LINE = "Morning! Happy to help with the launch.";

type AgentSeed = {
  pubkey: string;
  name: string;
  ownerPubkey?: string;
  respondTo?: "owner-only" | "allowlist" | "anyone";
  respondToAllowlist?: string[];
  status?: "online" | "away" | "offline";
};

async function install(page: Page, agents: AgentSeed[]) {
  await installMockBridge(page, {
    managedAgents: [],
    searchProfiles: [
      { pubkey: ROWAN, displayName: "Rowan" },
      ...agents.map((agent) => ({
        pubkey: agent.pubkey,
        displayName: agent.name,
        ownerPubkey: agent.ownerPubkey ?? ROWAN,
        isAgent: true,
      })),
    ],
    relayAgents: agents.map((agent) => ({
      pubkey: agent.pubkey,
      name: agent.name,
      ownerPubkey: agent.ownerPubkey ?? ROWAN,
      respondTo: agent.respondTo ?? "anyone",
      respondToAllowlist: agent.respondToAllowlist ?? [],
      channelNames: ["general"],
      status: agent.status ?? "online",
    })),
  });
  await page.goto("/");
  await page.getByTestId("channel-general").click();
  await expect(page.getByTestId("chat-title")).toHaveText("general");
  await page.evaluate(
    async ({ channelId, people, bots, line, rowan }) => {
      const invoke = window.__BUZZ_E2E_INVOKE_MOCK_COMMAND__;
      await invoke?.("add_channel_members", {
        channelId,
        pubkeys: people,
        role: "member",
      });
      if (bots.length > 0) {
        await invoke?.("add_channel_members", {
          channelId,
          pubkeys: bots,
          role: "bot",
        });
      }
      window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__?.({
        channelName: "general",
        content: line,
        pubkey: rowan,
      });
      const client = window.__BUZZ_E2E_QUERY_CLIENT__;
      await client?.invalidateQueries({ queryKey: ["channels"] });
      await client?.invalidateQueries({ queryKey: ["relay-agents"] });
    },
    {
      channelId: GENERAL,
      people: [ROWAN],
      bots: agents.map((agent) => agent.pubkey),
      line: CONTACT_LINE,
      rowan: ROWAN,
    },
  );
}

async function openRowanProfile(page: Page) {
  const row = page.getByTestId("message-row").filter({ hasText: CONTACT_LINE });
  await row.locator("button", { hasText: "Rowan" }).first().click();
  const panel = page.getByTestId("user-profile-panel");
  await expect(panel).toBeVisible();
  return panel;
}

// The question's exact recipients, from whichever send path the build used:
// JS-signed events, or the acknowledged native send command.
function sentRecipients(page: Page, content: string) {
  return page.evaluate((exact) => {
    const signed = (window.__BUZZ_E2E_SIGNED_EVENTS__ ?? [])
      .filter((event) => event.kind === 9 && event.content === exact)
      .map((event) =>
        event.tags.filter((tag) => tag[0] === "p").map((tag) => tag[1]),
      );
    if (signed.length) return signed;
    return (window.__BUZZ_E2E_COMMAND_LOG__ ?? []).flatMap((call) => {
      const payload = call.payload as {
        content?: string;
        mentionPubkeys?: string[];
      };
      return call.command === "send_channel_message" &&
        payload.content === exact
        ? [payload.mentionPubkeys ?? []]
        : [];
    });
  }, content);
}

test("ask a contact's agent from their profile and see its attributed reply in the thread", async ({
  page,
}) => {
  await install(page, [{ pubkey: SCOUT, name: "Scout" }]);
  const panel = await openRowanProfile(page);

  const entry = panel.getByTestId("profile-ask-agent");
  await expect(entry).toContainText("Ask Rowan's agent");
  await expect(entry).toContainText("Scout · #general");
  await expect(entry).toContainText(
    "Replies come from the agent, not from Rowan.",
  );
  await waitForAnimations(page);
  await page.screenshot({ path: "test-results/ask-agent-1-profile.png" });

  await entry.getByTestId(`ask-contact-agent-${SCOUT}-${GENERAL}`).click();
  const input = page.getByTestId("message-input").first();
  await expect(input).toContainText("Scout");
  await waitForAnimations(page);
  await page.screenshot({ path: "test-results/ask-agent-2-addressed.png" });
  // Repeating the explicit action never stacks a second mention.
  const again = await openRowanProfile(page);
  await again.getByTestId(`ask-contact-agent-${SCOUT}-${GENERAL}`).click();
  await expect
    .poll(() =>
      input.evaluate(
        (node) => (node.textContent ?? "").split("Scout").length - 1,
      ),
    )
    .toBe(1);

  await input.click();
  await page.keyboard.press("End");
  await page.keyboard.type("when is the launch review?");
  await page.getByTestId("send-message").first().click();

  const QUESTION = "@Scout when is the launch review?";
  await expect.poll(() => sentRecipients(page, QUESTION)).toHaveLength(1);
  const [recipients] = await sentRecipients(page, QUESTION);
  expect(recipients).toContain(SCOUT);
  expect(recipients).not.toContain(ROWAN);
  const questionRow = page
    .getByTestId("message-timeline")
    .getByTestId("message-row")
    .filter({ hasText: "when is the launch review?" });
  await expect(questionRow).toHaveCount(1);
  // Wait for the outbox row to become the relay-acknowledged event.
  await expect
    .poll(() => questionRow.getAttribute("data-message-id"))
    .toMatch(/^[0-9a-f]{64}$/);
  const questionId = await questionRow.getAttribute("data-message-id");
  if (!questionId) throw new Error("question row has no message id");
  const question = { id: questionId };

  // The agent answers in the question's thread under its own key.
  await page.evaluate(
    ({ parentEventId, pubkey }) =>
      window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__?.({
        channelName: "general",
        content:
          "Launch review is Thursday 10:00 (from Rowan's shared calendar).",
        parentEventId,
        pubkey,
      }),
    { parentEventId: question.id, pubkey: SCOUT },
  );

  const summary = page.locator(
    `[data-testid="message-thread-summary"][data-thread-head-id="${question.id}"]`,
  );
  await expect(summary).toBeVisible();
  await expect(summary).toContainText("1 reply");
  await page
    .locator(
      `[data-testid="open-thread-side-panel"][data-thread-head-id="${question.id}"]`,
    )
    .click();
  const thread = page.getByTestId("message-thread-panel");
  await expect(thread.getByTestId("message-thread-head")).toContainText(
    "when is the launch review?",
  );
  const reply = thread
    .getByTestId("message-row")
    .filter({ hasText: "Launch review is Thursday" });
  await expect(reply).toHaveCount(1);
  await expect(reply).toContainText("Scout");
  const owner = reply.getByTestId("message-agent-owner");
  await expect(owner).toContainText("managed by");
  await expect(owner.locator(".font-semibold")).toHaveText("Rowan");
  await waitForAnimations(page);
  await page.screenshot({ path: "test-results/ask-agent-3-reply.png" });
});

test("several agents are offered as explicit choices, never guessed", async ({
  page,
}) => {
  await install(page, [
    { pubkey: SCOUT, name: "Scout" },
    { pubkey: BOOKER, name: "Booker", status: "offline" },
  ]);
  const panel = await openRowanProfile(page);
  const choices = panel.getByTestId("profile-ask-agent-choices");
  await expect(choices.getByRole("button")).toHaveCount(2);
  await expect(choices).toContainText("Ask Booker in #general");
  await expect(choices).toContainText("Offline, may answer later");
  await expect(choices).toContainText("Ask Scout in #general");
  await waitForAnimations(page);
  await page.screenshot({ path: "test-results/ask-agent-4-choose.png" });

  await choices.getByTestId(`ask-contact-agent-${BOOKER}-${GENERAL}`).click();
  const input = page.getByTestId("message-input").first();
  await expect(input).toContainText("@Booker");
  await expect(input).not.toContainText("@Scout");
});

test("an agent that has not opted in for the viewer is explained, not offered", async ({
  page,
}) => {
  await install(page, [
    { pubkey: SCOUT, name: "Scout", respondTo: "owner-only" },
    {
      pubkey: BOOKER,
      name: "Booker",
      respondTo: "allowlist",
      respondToAllowlist: [STRANGER],
    },
  ]);
  const panel = await openRowanProfile(page);
  const entry = panel.getByTestId("profile-ask-agent");
  await expect(entry.getByRole("button")).toHaveCount(0);
  await expect(panel.getByTestId("profile-ask-agent-status")).toHaveText(
    "Rowan's agents haven't opted in to answer you in a channel you share.",
  );
  await waitForAnimations(page);
  await page.screenshot({ path: "test-results/ask-agent-5-not-opted-in.png" });
});

test("an agent claiming the contact without verified ownership is not offered", async ({
  page,
}) => {
  await install(page, [
    { pubkey: SCOUT, name: "Rowan's agent", ownerPubkey: STRANGER },
  ]);
  const panel = await openRowanProfile(page);
  await expect(panel.getByTestId("user-profile-primary-actions")).toBeVisible();
  await expect(panel.getByTestId("profile-ask-agent")).toHaveCount(0);
});
