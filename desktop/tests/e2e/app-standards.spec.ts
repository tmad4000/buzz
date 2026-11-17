import { expect, test } from "@playwright/test";
import { installMockBridge } from "../helpers/bridge";
import { openSettings } from "../helpers/settings";
import fs from "node:fs";
const shots = process.env.BUZZ_STANDARDS_SCREENSHOTS ?? "test-results/app-standards";
test("real Settings stamp matches metadata; Enter/Space stay inside; fork notice is isolated", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await installMockBridge(page);
  await page.route(
    "https://api.github.com/repos/tmad4000/buzz/releases?per_page=100",
    (route) =>
      route.fulfill({
        json: [
          {
            tag_name: "buzz-ideaflow-v0.5.28-ideaflow.99",
            html_url:
              "https://github.com/tmad4000/buzz/releases/tag/buzz-ideaflow-v0.5.28-ideaflow.99",
            assets: [
              { name: "Buzz.Ideaflow.dmg" },
              { name: "Buzz.Ideaflow.AppImage" },
            ],
          },
        ],
      }),
  );
  await page.goto("/");
  await expect(
    page.getByText("New Buzz Ideaflow version available", { exact: true }),
  ).toBeVisible();
  await openSettings(page, "updates");
  const info = await (await page.request.get("/version.json")).json();
  const stamp = page.getByTestId("settings-version");
  await expect(stamp).toContainText(`v${info.version}`);
  await expect(stamp).toContainText("Updated");
  await expect(stamp.locator("time")).toHaveAttribute(
    "datetime",
    info.event === "commit" ? info.commitTime : info.buildTime,
  );
  await stamp.focus();
  await page.keyboard.press("Enter");
  await expect(stamp).toContainText(`commit ${info.commit.slice(0, 9)}`);
  await page.keyboard.press("Space");
  await expect(stamp).toContainText("Updated");
  expect(errors).toEqual([]);
  fs.mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/desktop-updates.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(stamp).toBeVisible();
  await stamp.click();
  await expect(stamp).toContainText("commit");
  await page.screenshot({ path: `${shots}/phone-settings-exact.png` });
});
