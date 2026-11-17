import { defineConfig, devices } from "@playwright/test";

// Dedicated synthetic browser fixture; no live relay/Mac connection.
const port = Number(process.env.BUZZ_THREAD_LINK_PORT ?? 8873);
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "thread-links.spec.ts",
  timeout: 60000,
  workers: 1,
  reporter: "list",
  outputDir: "test-results/thread-links",
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 1000 },
    baseURL: `http://127.0.0.1:${port}`,
    screenshot: "only-on-failure",
    launchOptions: {
      executablePath:
        process.env.BUZZ_TEST_CHROME ?? "/opt/google/chrome/chrome",
      chromiumSandbox: true,
    },
  },
  webServer: {
    command: `python3 -m http.server ${port} --bind 127.0.0.1 -d dist`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
  },
});
