import { expect, test } from "@playwright/test";
import { installMockBridge } from "../helpers/bridge";
import { openSettings } from "../helpers/settings";
import fs from "node:fs";
const shots =
  process.env.BUZZ_STANDARDS_SCREENSHOTS ?? "test-results/app-standards";
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
  await page.evaluate(() => {
    const host = window as Window & { stampHotkeys?: number };
    host.stampHotkeys = 0;
    window.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ")
        host.stampHotkeys = (host.stampHotkeys || 0) + 1;
    });
  });
  await stamp.focus();
  await page.keyboard.press("Enter");
  await expect(stamp).toContainText(`commit ${info.commit.slice(0, 9)}`);
  await page.keyboard.press("Space");
  await expect(stamp).toContainText("Updated");
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => (window as Window & { stampHotkeys?: number }).stampHotkeys,
    ),
  ).toBe(0);
  fs.mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/desktop-updates.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(stamp).toBeVisible();
  await stamp.click();
  await expect(stamp).toContainText("commit");
  await page.screenshot({ path: `${shots}/phone-settings-exact.png` });
});

test("fresh theme follows the OS and feedback loads only after its own menu action", async ({
  page,
}) => {
  await installMockBridge(page);
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("worldissuetracker.com"))
      requests.push(request.url());
  });
  await page.route(
    "https://api.github.com/repos/tmad4000/buzz/releases?per_page=100",
    (route) => route.fulfill({ json: [] }),
  );
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await page.getByTestId("channel-general").click();
  await expect(page).toHaveTitle("general · Buzz Ideaflow");
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    "general · Buzz Ideaflow",
  );
  await expect(page.locator("html")).toHaveClass(/light/);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  expect(requests).toEqual([]);
  await page.getByTestId("open-settings").click();
  await page.getByText("Send feedback", { exact: true }).click();
  const loader = page.locator(
    'script[src="https://worldissuetracker.com/widget/wit-feedback.js"]',
  );
  await expect(loader).toHaveAttribute("data-trigger", "none");
  await expect(loader).toHaveAttribute("data-tracker-slug", "buzz-ideaflow");
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  await expect(page.locator("#wit-feedback-widget")).toBeAttached({
    timeout: 30000,
  });
  await expect(page.getByTestId("profile-popover")).not.toBeVisible();
  await page.screenshot({ path: `${shots}/desktop-feedback-dark.png` });
  await page.getByRole("button", { name: "Close (Esc)", exact: true }).click();
  const closed = await page
    .locator("#wit-feedback-widget")
    .evaluate((host) => ({
      position: getComputedStyle(host).position,
      trigger:
        host.shadowRoot?.querySelector(".trigger")?.getBoundingClientRect()
          .width || 0,
    }));
  expect(closed.position).not.toBe("fixed");
  expect(closed.trigger).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${shots}/phone-feedback-closed.png` });
});
