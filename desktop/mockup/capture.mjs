import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";

const [base, directory, ...scenarios] = process.argv.slice(2);
if (!base || !directory || !scenarios.length) {
  throw new Error(
    "Usage: pnpm mockup:shots <private preview URL> <output directory> <scenario[:view]> …",
  );
}
const origin = new URL(base).origin;
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({
  channel: "chrome",
  chromiumSandbox: true,
});
try {
  for (const spec of scenarios) {
    const [scenario, view] = spec.split(":");
    if (
      !/^[a-z][a-z0-9-]*$/.test(scenario) ||
      (view && !/^[a-z][a-z0-9-]*$/.test(view))
    ) {
      throw new Error(`Invalid scenario or view: ${spec}`);
    }
    for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 960 },
        deviceScaleFactor: 1,
        reducedMotion: "reduce",
        colorScheme: theme,
      });
      const page = await context.newPage();
      const failures = [];
      page.on("pageerror", (error) => failures.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") failures.push(message.text());
      });
      page.on("websocket", (socket) =>
        failures.push(`Unexpected WebSocket: ${socket.url()}`),
      );
      await context.route(/^https?:/, (route) => {
        if (new URL(route.request().url()).origin === origin)
          return route.continue();
        failures.push(`Unexpected external request: ${route.request().url()}`);
        return route.abort();
      });
      const url = new URL(
        "mockup.html",
        base.endsWith("/") ? base : `${base}/`,
      );
      url.searchParams.set("scenario", scenario);
      url.searchParams.set("theme", theme);
      if (view) url.searchParams.set("view", view);
      try {
        const response = await page.goto(url.href);
        if (!response?.ok())
          throw new Error(`Preview returned HTTP ${response?.status()}`);
        await page
          .locator("html[data-mockup-ready]")
          .waitFor({ state: "attached", timeout: 25_000 });
        if (
          (await page.locator("html").getAttribute("data-mockup-ready")) !==
          "true"
        ) {
          throw new Error("Scenario preparation failed");
        }
        await page.getByTestId("app-sidebar").waitFor();
        await page.waitForFunction(
          (theme) => document.documentElement.classList.contains(theme),
          theme,
        );
        await page.evaluate(() => document.fonts.ready);
        const filename = resolve(
          directory,
          `${spec.replace(":", "-")}-${theme}.png`,
        );
        await page.screenshot({ path: filename, animations: "disabled" });
        if (failures.length) throw new Error(failures.join("\n"));
        console.log(filename);
      } catch (error) {
        throw new Error(
          `${spec} (${theme}): ${[String(error), ...failures].join("\n")}`,
        );
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}
