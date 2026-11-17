import { expect, test } from "@playwright/test";
import { installMockBridge } from "../helpers/bridge";
const PK = "38ba46f41d56ff5c71cfbfb856d00b209e6216a218260d2a30c4f1b712bdd1cb";
const RELAY = "wss://jprojects.communities.buzz.xyz";
test("local expiry warns, marks only Paseo working cards, and recovers", async ({
  page,
}) => {
  await page.clock.install();
  await installMockBridge(page, undefined, { relayWsUrl: RELAY });
  await page.goto("/");
  await expect(page.getByTestId("channel-general")).toBeVisible();
  await page.getByTestId("channel-general").click();
  // The owner-kind helper checks #p archive filters, not presence authors.
  // Inspect the existing IPC journal without weakening the author-scoped gate.
  await expect
    .poll(() =>
      page.evaluate((pk) => {
        const active =
          window.__BUZZ_E2E_HAS_MOCK_GLOBAL_KIND_SUBSCRIPTION__?.(20001) ??
          false;
        return (
          active &&
          (window.__BUZZ_E2E_COMMAND_PAYLOADS__ ?? []).some(
            ({ command, payload }) => {
              if (command !== "plugin:websocket|send") return false;
              const data = (payload as { message?: { data?: unknown } } | null)
                ?.message?.data;
              if (typeof data !== "string") return false;
              try {
                const frame = JSON.parse(data);
                return (
                  Array.isArray(frame) &&
                  frame[0] === "REQ" &&
                  frame
                    .slice(2)
                    .some(
                      (filter: { kinds?: number[]; authors?: string[] }) =>
                        filter.kinds?.includes(20001) &&
                        filter.authors?.includes(pk),
                    )
                );
              } catch {
                return false;
              }
            },
          )
        );
      }, PK),
    )
    .toBe(true);
  await page.evaluate((pk) => {
    window.__BUZZ_E2E_EMIT_MOCK_PRESENCE__?.({ pubkey: pk, status: "online" });
    window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__?.({
      channelName: "general",
      pubkey: pk,
      id: "a".repeat(64),
      content:
        "⏳ Working\nItem: synthetic-task\n\nSynthetic source verification",
    });
    window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__?.({
      channelName: "general",
      pubkey: "b".repeat(64),
      id: "c".repeat(64),
      content: "⏳ Working\nItem: human-task\n\nHuman source verification",
    });
  }, PK);
  await expect(
    page.getByText("Synthetic source verification", { exact: true }),
  ).toBeVisible();
  await page.evaluate(
    (pk) =>
      window.__BUZZ_E2E_EMIT_MOCK_PRESENCE__?.({
        pubkey: pk,
        status: "offline",
      }),
    PK,
  );
  await page.clock.fastForward(180000);
  await expect(page.getByTestId("paseo-host-offline")).toHaveCount(0);
  await page.clock.fastForward(5001);
  const banner = page.getByTestId("paseo-host-offline");
  await expect(banner).toContainText(
    /Paseo host offline since \d\d:\d\d: ⏳ statuses may be stale/,
  );
  await expect(
    page
      .locator("[data-sonner-toast]")
      .filter({ hasText: "⏳ statuses may be stale" }),
  ).toHaveCount(1);
  await expect(page.getByTestId("paseo-status-stale")).toHaveCount(1);
  const botRow = page
    .getByTestId("message-row")
    .filter({ hasText: "Synthetic source verification" });
  const humanRow = page
    .getByTestId("message-row")
    .filter({ hasText: "Human source verification" });
  await expect(botRow.getByTestId("paseo-status-stale")).toBeVisible();
  await expect(humanRow.getByTestId("paseo-status-stale")).toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath("paseo-host-offline.png"),
  });
  await page.evaluate(
    (pk) =>
      window.__BUZZ_E2E_EMIT_MOCK_PRESENCE__?.({ pubkey: pk, status: "away" }),
    PK,
  );
  await expect(banner).toHaveCount(0);
  await expect(page.getByTestId("paseo-status-stale")).toHaveCount(0);
  await expect(
    page
      .locator("[data-sonner-toast]")
      .filter({ hasText: /Paseo back \(offline \d\d:\d\d–\d\d:\d\d\)/ }),
  ).toHaveCount(1);
});
test("other communities have no Paseo host warning", async ({ page }) => {
  await page.clock.install();
  await installMockBridge(page);
  await page.goto("/");
  await expect(page.getByTestId("channel-general")).toBeVisible();
  await page.clock.fastForward(200000);
  await expect(page.getByTestId("paseo-host-offline")).toHaveCount(0);
});
