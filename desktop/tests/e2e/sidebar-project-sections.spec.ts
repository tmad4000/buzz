import { expect, test } from "@playwright/test";
import { waitForAnimations } from "../helpers/animations";
import { installMockBridge } from "../helpers/bridge";

const PK = "deadbeef".repeat(8);
const DM = "d1ec7000-d000-4000-8000-000000000001";

test("assigned DM shares a collapsible section with channels and can move back", async ({
  page,
}, testInfo) => {
  await page.addInitScript(
    ({ pk, dm }) => {
      const key = `buzz-channel-sections.v1:${pk}`;
      if (localStorage.getItem("sections-test-seeded")) return;
      localStorage.setItem("sections-test-seeded", "true");
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          sections: [{ id: "paseo", name: "Paseo", order: 0 }],
          assignments: {
            [dm]: "paseo",
            "1c7e1c02-87bb-5e88-b2da-5a7a9432d0c9": "paseo",
          },
        }),
      );
    },
    { pk: PK, dm: DM },
  );
  await installMockBridge(page);
  await page.goto("/");
  const section = page.locator("#sidebar-section-paseo");
  await expect(section.getByTestId("channel-DM")).toBeVisible();
  await expect(section.getByTestId("channel-DM")).toContainText(/charlie/i);
  await expect(section.getByTestId("channel-engineering")).toBeVisible();
  await expect(
    page.getByTestId("dm-list").getByTestId("channel-DM"),
  ).toHaveCount(0);
  await waitForAnimations(page);
  await page
    .getByTestId("app-sidebar")
    .screenshot({ path: testInfo.outputPath("sidebar-project-sections.png") });
  const disclosure = page.getByRole("button", { name: "Paseo", exact: true });
  await disclosure.click();
  await expect(section).toHaveCount(0);
  await disclosure.click();
  await section.getByTestId("channel-DM").click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Move to section", exact: true })
    .hover();
  await page
    .getByRole("menuitem", { name: "Remove from section", exact: true })
    .click();
  await expect(
    page.getByTestId("dm-list").getByTestId("channel-DM"),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByTestId("dm-list").getByTestId("channel-DM"),
  ).toBeVisible();
  await page
    .getByTestId("dm-list")
    .getByTestId("channel-DM")
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Move to section", exact: true })
    .hover();
  await page.getByRole("menuitem", { name: "Paseo", exact: true }).click();
  await expect(section.getByTestId("channel-DM")).toBeVisible();
  await expect(
    page.getByTestId("dm-list").getByTestId("channel-DM"),
  ).toHaveCount(0);
});
