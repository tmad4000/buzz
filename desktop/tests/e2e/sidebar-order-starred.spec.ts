import { expect, test } from "@playwright/test";
import { installMockBridge } from "../helpers/bridge";
const PK = "deadbeef".repeat(8);
const ENGINEERING = "1c7e1c02-87bb-5e88-b2da-5a7a9432d0c9";
const DM = "d1ec7000-d000-4000-8000-000000000001";
async function setup(page: import("@playwright/test").Page, pin = false) {
  await page.addInitScript(
    ({ pk, engineering, dm, pin }) => {
      if (localStorage.getItem("order-starred-fixture")) return;
      localStorage.setItem("order-starred-fixture", "true");
      if (pin)
        localStorage.setItem(
          `buzz-channel-sections.v1:${pk}`,
          JSON.stringify({
            version: 1,
            sections: [{ id: "pin-section", name: "Pin", order: 0 }],
            assignments: { [engineering]: "pin-section", [dm]: "pin-section" },
          }),
        );
    },
    { pk: PK, engineering: ENGINEERING, dm: DM, pin },
  );
  await installMockBridge(page);
  await page.goto("/");
  await expect(page.getByTestId("section-actions-dms")).toBeVisible();
}
const order = (page: import("@playwright/test").Page) =>
  page
    .locator(
      '[data-testid="sidebar-scroll-content"] [data-sidebar-section-title]',
    )
    .allTextContents();
test("built-in DM moves above Starred through menu and persists after reload", async ({
  page,
}) => {
  await setup(page);
  expect((await order(page)).slice(-4)).toEqual([
    "Starred",
    "Channels",
    "Forums",
    "Direct messages",
  ]);
  for (let i = 0; i < 3; i++) {
    await page.getByTestId("section-actions-dms").click();
    await page.getByRole("menuitem", { name: "Move up", exact: true }).click();
  }
  await expect
    .poll(
      async () =>
        (await order(page)).indexOf("Direct messages") <
        (await order(page)).indexOf("Starred"),
    )
    .toBe(true);
  await page.reload();
  await expect
    .poll(
      async () =>
        (await order(page)).indexOf("Direct messages") <
        (await order(page)).indexOf("Starred"),
    )
    .toBe(true);
  await page.getByTestId("section-actions-dms").click();
  await page.getByRole("menuitem", { name: "Move down", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await order(page)).indexOf("Starred") <
        (await order(page)).indexOf("Direct messages"),
    )
    .toBe(true);
});
test("official Starred is always visible; channel hover and DM context toggles are independent of pins", async ({
  page,
}) => {
  await setup(page);
  await expect(
    page.getByText("Star a channel or direct message to keep it here."),
  ).toBeVisible();
  const engineering = page
    .getByTestId("stream-list")
    .getByTestId("channel-engineering");
  await engineering.hover();
  await engineering
    .locator("..")
    .getByRole("button", { name: "Star engineering", exact: true })
    .click();
  await expect(
    page.getByTestId("starred-list").getByTestId("channel-engineering"),
  ).toBeVisible();
  const dm = page.getByTestId("dm-list").getByTestId("channel-DM");
  await dm.click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Star direct message", exact: true })
    .click();
  await expect(
    page.getByTestId("starred-list").getByTestId("channel-DM"),
  ).toBeVisible();
  const favoriteDm = page.getByTestId("starred-list").getByTestId("channel-DM");
  await favoriteDm.hover();
  await favoriteDm
    .locator("..")
    .getByRole("button", { name: /Unstar charlie/i })
    .click();
  await expect(
    page.getByTestId("starred-list").getByTestId("channel-DM"),
  ).toHaveCount(0);
  await page.getByTestId("dm-list").getByTestId("channel-DM").hover();
  await page
    .getByTestId("dm-list")
    .getByRole("button", { name: /Star charlie/i })
    .click();
  await page.reload();
  await expect(
    page.getByTestId("starred-list").getByTestId("channel-DM"),
  ).toBeVisible();
  await page
    .getByTestId("starred-list")
    .getByTestId("channel-DM")
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Unstar direct message", exact: true })
    .click();
  await expect(
    page.getByTestId("starred-list").getByTestId("channel-DM"),
  ).toHaveCount(0);
});
test("Pin conversion is optional, additive and offered only once", async ({
  page,
}) => {
  await setup(page, true);
  await expect(
    page.getByRole("region", { name: "Convert Pin to Starred" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Convert Pin → Starred", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Convert Pin to Starred" }),
  ).toHaveCount(0);
  await expect(
    page.getByTestId("starred-list").getByTestId("channel-engineering"),
  ).toBeVisible();
  await expect(
    page.getByTestId("starred-list").getByTestId("channel-DM"),
  ).toBeVisible();
  await expect(
    page
      .locator("#sidebar-section-pin-section")
      .getByTestId("channel-engineering"),
  ).toBeVisible();
  await expect(page.getByTestId("section-title-pin-section")).toHaveText("Pin");
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Convert Pin to Starred" }),
  ).toHaveCount(0);
  await expect(
    page.locator("#sidebar-section-pin-section").getByTestId("channel-DM"),
  ).toBeVisible();
});
test("keeping Pin dismisses the offer without starring or deleting anything", async ({
  page,
}) => {
  await setup(page, true);
  await page
    .getByRole("button", { name: "Keep section as is", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Convert Pin to Starred" }),
  ).toHaveCount(0);
  await expect(page.getByTestId("section-title-pin-section")).toHaveText("Pin");
  await expect(page.getByTestId("starred-list")).toHaveCount(0);
});

test("built-in Direct messages header drags above Starred and persists", async ({
  page,
}) => {
  await setup(page);
  await page.getByTestId("stream-list-section-label").click();
  await page.getByTestId("forum-list-section-label").click();
  const from = await page.getByTestId("dm-list-section-label").boundingBox();
  const to = await page.getByTestId("starred-list-section-label").boundingBox();
  if (!from || !to) throw new Error("Section headers unavailable");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    from.x + from.width / 2,
    from.y + from.height / 2 - 10,
    { steps: 3 },
  );
  await expect(page.getByTestId("sidebar-section-drag-overlay")).toBeVisible();
  await page.mouse.move(to.x + to.width / 2, to.y + 2, { steps: 12 });
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        (await order(page)).indexOf("Direct messages") <
        (await order(page)).indexOf("Starred"),
    )
    .toBe(true);
  await page.reload();
  await expect
    .poll(
      async () =>
        (await order(page)).indexOf("Direct messages") <
        (await order(page)).indexOf("Starred"),
    )
    .toBe(true);
});
