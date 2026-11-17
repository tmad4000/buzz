import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: [
    "reply-polish.spec.ts",
    "inline-threads.spec.ts",
    "send-to-thread.spec.ts",
  ],
  timeout: 90000,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:8731",
    headless: true,
    launchOptions: {
      executablePath:
        process.env.BUZZ_TEST_BROWSER ?? "/usr/local/bin/google-chrome",
      chromiumSandbox: true,
    },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  outputDir: "test-results/reply-polish",
  webServer: {
    command: "python3 -m http.server 8731 --bind 127.0.0.1 -d dist",
    url: "http://127.0.0.1:8731",
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "ignore",
  },
});
