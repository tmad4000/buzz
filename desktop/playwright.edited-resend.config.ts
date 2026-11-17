import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "edited-resend.spec.ts",
  timeout: 90000,
  workers: 1,
  reporter: [["list"]],
  outputDir: "test-results/edited-resend",
  use: {
    baseURL: "http://127.0.0.1:7943",
    headless: true,
    launchOptions: {
      executablePath: "/usr/local/bin/google-chrome",
      chromiumSandbox: true,
    },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "python3 -m http.server 7943 --bind 127.0.0.1 -d dist",
    url: "http://127.0.0.1:7943",
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "ignore",
  },
});
