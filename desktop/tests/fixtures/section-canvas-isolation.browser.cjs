const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect: baseExpect } = require("@playwright/test");
const expect = baseExpect.configure({ timeout: 30000 });
const origin = process.env.BUZZ_HOST_FIXTURE_ORIGIN;
if (!origin) throw new Error("Set BUZZ_HOST_FIXTURE_ORIGIN");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.BUZZ_CHROME_PATH,
    chromiumSandbox: true,
    headless: true,
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1700, height: 1000 },
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(
      `${origin}/tests/fixtures/full-conversation-hosts.html?layout=1&drag=1&sections=1`,
      { timeout: 90000 },
    );
    const sidebar = page.getByRole("complementary", {
      name: "Section integration sidebar",
    });
    const row = () =>
      sidebar
        .locator('button[data-testid^="channel-"]')
        .filter({ hasText: "Section DM participant" });
    await expect(row()).toBeVisible();
    const dm = await page.evaluate(async () => {
      const { getChannels } = await import("/src/shared/api/tauriChannels.ts");
      return (await getChannels(null)).channels.find(
        (channel) => channel.channelType === "dm",
      ).id;
    });
    const membership = () =>
      page.evaluate(() =>
        window.dragEvents.filter(
          (event) => event.type === "assign" || event.type === "unassign",
        ),
      );
    const model = () => page.evaluate(() => window.layoutSnapshot());
    const menuMove = async (section) => {
      await row().click({ button: "right" });
      await page
        .getByRole("menuitem", { name: "Move to section", exact: true })
        .hover();
      await page.getByRole("menuitem", { name: section, exact: true }).click();
    };
    await menuMove("Work");
    await expect(
      sidebar
        .locator("[data-section-integration=work]")
        .locator('button[data-testid^="channel-"]')
        .filter({ hasText: "Section DM participant" }),
    ).toBeVisible();
    await expect(
      sidebar
        .getByTestId("section-integration-dms")
        .locator('button[data-testid^="channel-"]')
        .filter({ hasText: "Section DM participant" }),
    ).toHaveCount(0);
    assert.deepEqual(await membership(), [
      { type: "assign", channelId: dm, sectionId: "work" },
    ]);
    const begin = async () => {
      const button = row();
      const box = await button.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2);
      await expect(page.getByTestId("sidebar-channel-drag-overlay")).toHaveText(
        "Section DM participant",
      );
    };
    await begin();
    let box = await sidebar
      .locator("[data-section-integration=other]")
      .boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 12, {
      steps: 12,
    });
    await page.mouse.up();
    await expect.poll(async () => (await membership()).length).toBe(2);
    assert.deepEqual((await membership())[1], {
      type: "assign",
      channelId: dm,
      sectionId: "other",
    });
    const baseline = await membership();
    const dropCanvas = async (paneId, edge) => {
      await begin();
      const target = await page
        .locator(`[data-conversation-drop-target="${paneId}"]`)
        .boundingBox();
      await page.mouse.move(
        edge === "right"
          ? target.x + target.width - 12
          : target.x + target.width / 2,
        edge === "bottom"
          ? target.y + target.height - 12
          : target.y + target.height / 2,
        { steps: 12 },
      );
      await expect(page.getByTestId("conversation-drop-preview")).toBeVisible();
      await page.mouse.up();
    };
    const first = await model();
    await dropCanvas(first.root.id, "right");
    await expect
      .poll(async () => Object.keys((await model()).views).length)
      .toBe(2);
    assert.deepEqual(
      await membership(),
      baseline,
      "grouping-enabled DM canvas split cannot change section membership",
    );
    const split = await model();
    const general = split.root.children.find(
      (pane) => split.views[pane.viewInstanceId].channelId !== dm,
    );
    await dropCanvas(general.id, "bottom");
    await expect
      .poll(
        async () =>
          Object.values((await model()).views).filter(
            (view) => view.channelId === dm,
          ).length,
      )
      .toBe(2);
    const replaced = await model();
    assert.equal(
      new Set(Object.values(replaced.views).map((view) => view.id)).size,
      2,
    );
    assert.deepEqual(
      await membership(),
      baseline,
      "DM canvas replacement cannot change section membership",
    );
    if (process.env.BUZZ_SECTION_SCREENSHOTS) {
      fs.mkdirSync(process.env.BUZZ_SECTION_SCREENSHOTS, { recursive: true });
      await page.screenshot({
        path: path.join(
          process.env.BUZZ_SECTION_SCREENSHOTS,
          "section-dm-two-views.png",
        ),
      });
    }
    await begin();
    box = await sidebar
      .locator("[data-section-integration-ungrouped]")
      .boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
      steps: 12,
    });
    await page.mouse.up();
    await expect.poll(async () => (await membership()).length).toBe(3);
    assert.deepEqual((await membership())[2], {
      type: "unassign",
      channelId: dm,
    });
    await expect(
      sidebar
        .getByTestId("section-integration-dms")
        .locator('button[data-testid^="channel-"]')
        .filter({ hasText: "Section DM participant" }),
    ).toContainText("Section DM participant");
    assert.deepEqual(
      await page.evaluate(() =>
        (window.__BUZZ_E2E_COMMAND_PAYLOADS__ ?? [])
          .map((entry) => entry.command)
          .filter((command) =>
            /^(send_channel_message|create_dm|open_dm|join_channel|invite_channel_member)$/.test(
              command,
            ),
          ),
      ),
      [],
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS actual sidebar DM menu assigns once, grouped DM drag reassigns/unassigns canonically, participant drag label retained, grouping-enabled DM canvas split/replacement make zero membership writes, two fresh view identities; mock bridge and Chrome sandbox, no native bootstrap/full workspace claim.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
