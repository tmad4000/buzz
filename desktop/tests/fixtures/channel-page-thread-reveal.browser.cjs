const { chromium, expect } = require("@playwright/test");

const origin = process.env.BUZZ_HOST_FIXTURE_ORIGIN;
if (!origin)
  throw new Error("Set BUZZ_HOST_FIXTURE_ORIGIN to the Vite origin.");

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.BUZZ_CHROME_PATH,
    chromiumSandbox: true,
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
    });
    await page.goto(
      `${origin}/tests/fixtures/full-conversation-hosts.html?pageHost=forum&repeat`,
    );
    const openReport = page.getByRole("button", {
      name: "Open bound forum report",
    });
    const report = page
      .getByRole("region", { name: "Forum posts" })
      .getByText("Bound agent report", { exact: true });
    const surface = page.getByRole("region", { name: "Channel Page" });
    const frame = surface.frameLocator("iframe");
    const openPage = () =>
      page.getByRole("button", { name: "Page", exact: true }).click();
    await openReport.click();
    await expect(report).toBeVisible();
    await openPage();
    await surface.getByRole("button", { name: "Expand" }).click();
    await expect(
      frame.getByRole("heading", { name: "Shared page" }),
    ).toBeVisible();
    await expect(report).toBeHidden();
    await openReport.click();
    await expect(surface).toBeHidden();
    await expect(report).toBeVisible();

    await openPage();
    await surface.getByRole("button", { name: "Expand" }).click();
    await surface.getByRole("button", { name: "Edit HTML" }).click();
    const editor = surface.getByRole("textbox");
    const draft = "<h1>Unsaved Page</h1>";
    await editor.fill(draft);
    await openReport.click();
    await expect(surface.getByRole("status")).toContainText("Save or cancel");
    await expect(editor).toHaveValue(draft);
    await expect(report).toBeHidden();

    await surface.getByRole("button", { name: "Save Page" }).click();
    await expect(editor).toBeDisabled();
    await openReport.click();
    await expect(surface.getByRole("status")).toContainText("Page is saving");
    await expect(editor).toHaveValue(draft);
    await expect(report).toBeHidden();
    console.log(
      "PASS: repeat forum selection reveals a clean Page and preserves dirty and saving drafts",
    );
  } finally {
    await browser.close();
  }
})();
