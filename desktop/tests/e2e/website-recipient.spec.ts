import { expect, type Locator, type Page, test } from "@playwright/test";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";

import { installMockBridge, openNewMessagePage } from "../helpers/bridge";

const SENDER = "deadbeef".repeat(8);
const OWN_AGENT = "0a".repeat(32);
const SITE_AGENT = "0b".repeat(32);
const HOST_AGENT = "0c".repeat(32);
const HOST_OWNER = "0d".repeat(32);
const DOMAIN_KEY = new Uint8Array(32).fill(12);
const DOMAIN_OWNER = getPublicKey(DOMAIN_KEY);
const SELF = "airline.example";
const DELEGATED = "rail.example";
const PLAIN = "library.example";
const INACCESSIBLE = "unavailable.example";
const FORGED = "forged.example";
const EXCERPT = "One checked bag is included.";
const GENERAL = "9a1657ac-f7aa-5db0-b632-d8bbeb6dfb50";

function delegation(domain: string, signer: Uint8Array) {
  const now = Math.floor(Date.now() / 1000);
  return finalizeEvent(
    {
      created_at: now - 60,
      kind: 30078,
      content: "",
      tags: [
        ["d", `buzz-website-agent:v1:${domain}`],
        ["p", HOST_AGENT],
        ["owner", HOST_OWNER],
        ["host", "agent-host.example"],
        ["expiration", String(now + 3600)],
      ],
    },
    signer,
  );
}

async function install(page: Page) {
  await installMockBridge(page, {
    managedAgents: [
      { pubkey: OWN_AGENT, name: "My research agent", status: "running" },
    ],
    relayAgents: [
      {
        pubkey: SITE_AGENT,
        name: "Airline desk",
        ownerPubkey: DOMAIN_OWNER,
        respondTo: "anyone",
        channelIds: [GENERAL],
      },
      {
        pubkey: HOST_AGENT,
        name: "Rail desk",
        ownerPubkey: HOST_OWNER,
        respondTo: "anyone",
        channelIds: [GENERAL],
      },
    ],
    websiteMetadata: {
      [`https://${SELF}`]: { names: { _: DOMAIN_OWNER, agent: SITE_AGENT } },
      [`https://${DELEGATED}`]: {
        names: { _: DOMAIN_OWNER, agent: HOST_AGENT },
        buzz_agent: {
          host: "agent-host.example",
          delegation: delegation(DELEGATED, DOMAIN_KEY),
        },
      },
      [`https://${PLAIN}`]: { names: { _: DOMAIN_OWNER } },
      [`https://${FORGED}`]: {
        names: { _: DOMAIN_OWNER, agent: HOST_AGENT },
        buzz_agent: {
          host: "agent-host.example",
          delegation: delegation(FORGED, new Uint8Array(32).fill(13)),
        },
      },
    },
    websitePages: {
      [`https://${SELF}/baggage`]: {
        url: `https://${SELF}/baggage`,
        text: EXCERPT,
      },
    },
  });
  await page.goto("/");
  await openNewMessagePage(page);
}

async function paste(target: Locator, content: string) {
  await target.evaluate((node, value) => {
    const data = new DataTransfer();
    data.setData("text/plain", value);
    node.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: data,
      }),
    );
  }, content);
}

async function commands(page: Page, ...names: string[]) {
  return page.evaluate(
    (requested) =>
      (window.__BUZZ_E2E_COMMAND_LOG__ ?? []).filter(({ command }) =>
        requested.includes(command),
      ),
    names,
  );
}

test("paste is inert and private help shares only a cited public excerpt with the personal agent", async ({
  page,
}) => {
  await install(page);
  const to = page.getByRole("combobox", { name: "To" });
  const url = `https://${SELF}/baggage?bookingRef=PRIVATE#signed`;
  await paste(to, url);
  await expect(to).toHaveValue(url);
  await expect(
    page.getByRole("button", { name: "Ask my agent", exact: true }),
  ).toBeVisible();
  expect(
    await commands(
      page,
      "read_website_recipient",
      "lookup_website_recipient",
      "open_dm",
      "send_channel_message",
    ),
  ).toEqual([]);
  await page.getByRole("button", { name: "Ask my agent", exact: true }).click();
  await expect(
    page.getByText(`Review excerpt from https://${SELF}/baggage`),
  ).toBeVisible();
  await page.getByText(`Review excerpt from https://${SELF}/baggage`).click();
  await expect(page.getByText(EXCERPT, { exact: true })).toBeVisible();
  await page
    .getByLabel("Question for your agent")
    .fill("What baggage is included?");
  await page.getByRole("button", { name: "Send to my agent" }).click();
  await expect
    .poll(() => commands(page, "send_channel_message"))
    .toHaveLength(1);
  const [send] = await commands(page, "send_channel_message");
  expect(send.payload).toMatchObject({
    mentionPubkeys: [OWN_AGENT],
    expectedSignerPubkey: SENDER,
  });
  expect(JSON.stringify(send.payload)).toContain(EXCERPT);
  expect(JSON.stringify(send.payload)).toContain("Cite a verbatim passage");
  expect(JSON.stringify(send.payload)).not.toContain("PRIVATE");
  expect(
    await commands(page, "read_website_recipient", "lookup_website_recipient"),
  ).toEqual([
    {
      command: "read_website_recipient",
      payload: { url: `https://${SELF}/baggage` },
    },
  ]);
});

test("site-hosted contact reuses its DM and sends only reviewed page context", async ({
  page,
}) => {
  await install(page);
  for (const path of ["/baggage", "/carry-on"]) {
    await paste(
      page.getByRole("combobox", { name: "To" }),
      `${SELF}${path}?token=PRIVATE`,
    );
    await page
      .getByRole("button", { name: "Look up official contact" })
      .click();
    await expect(
      page.getByText(`Verified representative for ${SELF}`),
    ).toBeVisible();
    await expect(
      page.getByText(`Airline desk · Hosted by ${SELF}`),
    ).toBeVisible();
    await expect(page.getByText(`Contact key ${DOMAIN_OWNER}`)).toBeVisible();
    await expect(
      page.getByText(`Website context included · ${SELF}`, { exact: true }),
    ).toBeVisible();
    await page.getByLabel(`Include page path ${path}`).check();
    await expect(
      page.getByText(`Website context included · ${SELF}${path}`, {
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByLabel(`Message for ${SELF}`)
      .fill("Please explain your policy.");
    await page
      .getByRole("button", { name: `Message ${SELF}`, exact: true })
      .click();
    await expect(page.getByTestId("new-message-page")).toHaveCount(0);
    if (path === "/baggage") await openNewMessagePage(page);
  }
  const sends = await commands(page, "send_channel_message");
  expect(sends).toHaveLength(2);
  expect(
    sends.map(({ payload }) => (payload as { channelId: string }).channelId)[0],
  ).toBe((sends[1].payload as { channelId: string }).channelId);
  expect(sends[0].payload).toMatchObject({
    mentionPubkeys: [SITE_AGENT],
    content: `Please explain your policy.\n\nWebsite context: ${SELF}/baggage`,
  });
  expect(sends[1].payload).toMatchObject({
    mentionPubkeys: [SITE_AGENT],
    content: `Please explain your policy.\n\nWebsite context: ${SELF}/carry-on`,
  });
  expect(await commands(page, "lookup_website_recipient")).toHaveLength(4);
  expect(await commands(page, "read_website_recipient")).toEqual([]);
});

test("signed hosting delegation verifies and an invalid binding stays private", async ({
  page,
}) => {
  await install(page);
  const to = page.getByRole("combobox", { name: "To" });
  const lookup = page.getByRole("button", { name: "Look up official contact" });
  await paste(to, DELEGATED);
  await lookup.click();
  await expect(
    page.getByText(`Verified representative for ${DELEGATED}`),
  ).toBeVisible();
  await expect(
    page.getByText("Rail desk · Hosted by agent-host.example"),
  ).toBeVisible();
  await paste(to, FORGED);
  await lookup.click();
  await expect(page.getByRole("alert")).toHaveText(
    "Couldn't verify the site's signed agent delegation.",
  );
  await expect(
    page.getByRole("button", { name: "Ask my agent", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Message ${FORGED}` }),
  ).toHaveCount(0);
  expect(await commands(page, "open_dm", "send_channel_message")).toEqual([]);
});

test("an ordinary domain and an unreadable page offer private pasted text", async ({
  page,
}) => {
  await install(page);
  const to = page.getByRole("combobox", { name: "To" });
  await paste(to, PLAIN);
  await page.getByRole("button", { name: "Look up official contact" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "This site hasn't designated an official Buzz agent.",
  );
  await paste(to, `https://${INACCESSIBLE}/policy`);
  await page.getByRole("button", { name: "Ask my agent", exact: true }).click();
  await page
    .getByLabel(
      "Couldn't read this page. Paste the text you want your agent to use.",
    )
    .fill("Text I chose to share.");
  await page.getByLabel("Question for your agent").fill("Please summarize.");
  await page.getByRole("button", { name: "Send to my agent" }).click();
  await expect
    .poll(() => commands(page, "send_channel_message"))
    .toHaveLength(1);
  const [send] = await commands(page, "send_channel_message");
  expect(send.payload).toMatchObject({ mentionPubkeys: [OWN_AGENT] });
  expect(JSON.stringify(send.payload)).toContain("Text I chose to share.");
});

test("a changed designation requires a fresh review and sends nothing", async ({
  page,
}) => {
  await install(page);
  await paste(page.getByRole("combobox", { name: "To" }), SELF);
  await page.getByRole("button", { name: "Look up official contact" }).click();
  await expect(
    page.getByText(`Verified representative for ${SELF}`),
  ).toBeVisible();
  await page
    .getByLabel(`Message for ${SELF}`)
    .fill("Please explain your policy.");
  await page.evaluate(
    ({ domain, owner, agent }) => {
      const metadata = window.__BUZZ_E2E__?.mock?.websiteMetadata;
      if (!metadata) throw new Error("Missing website fixture");
      metadata[`https://${domain}`] = {
        names: { _: owner, agent },
      };
    },
    { domain: SELF, owner: HOST_OWNER, agent: HOST_AGENT },
  );
  await page
    .getByRole("button", { name: `Message ${SELF}`, exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveText(
    "The site's representative changed. Look up the contact again to review the new recipient.",
  );
  expect(await commands(page, "open_dm", "send_channel_message")).toEqual([]);
});

test("a website link pasted into an existing composer remains message text", async ({
  page,
}) => {
  await install(page);
  await page.getByTestId("channel-general").click();
  const composer = page.getByTestId("message-input").first();
  await composer.focus();
  await paste(composer, `https://${SELF}/baggage`);
  await expect(composer).toContainText(`https://${SELF}/baggage`);
  await expect(
    page.getByRole("region", { name: "Website recipient" }),
  ).toHaveCount(0);
  expect(
    await commands(
      page,
      "read_website_recipient",
      "lookup_website_recipient",
      "open_dm",
      "send_channel_message",
    ),
  ).toEqual([]);
});
