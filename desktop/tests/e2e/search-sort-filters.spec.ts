import { expect, type Page, test } from "@playwright/test";

import { waitForAnimations } from "../helpers/animations";
import { installMockBridge } from "../helpers/bridge";

const SHOTS = "test-results/search-sort";

const messageRows = (page: Page) =>
  page.locator('[data-search-section="messages"] .search-result-row');

const payloads = (page: Page) =>
  page.evaluate(() =>
    (window.__BUZZ_E2E_COMMAND_PAYLOADS__ ?? [])
      .filter((entry) => entry.command === "search_messages")
      .map((entry) => entry.payload as Record<string, unknown>),
  );

async function openDeepHistorySearch(page: Page) {
  await page.goto("/");
  // Seeds 600 matches: the mock relay, like the real one, truncates by its own
  // order (oldest first here), so the newest match is on no first page.
  await page.getByTestId("channel-deep-history").click();
  await expect(
    page.locator('[data-message-id^="mock-deep-history-"]').first(),
  ).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByTestId("search-dialog-input").fill("deep history message");
  await expect(messageRows(page)).toHaveCount(40);
}

async function chooseSort(page: Page, sort: "relevance" | "newest" | "oldest") {
  await page.getByTestId("search-sort").click();
  await page.getByTestId(`search-sort-${sort}`).click();
}

test("sorting finds the true newest and oldest matches beyond the first page", async ({
  page,
}) => {
  await installMockBridge(page);
  await openDeepHistorySearch(page);

  await expect(page.getByTestId("search-sort")).toHaveText("Sort: Relevance");
  await expect(page.getByText("Most relevant", { exact: true })).toBeVisible();
  await expect(messageRows(page).first()).toContainText("#0");
  await waitForAnimations(page);
  await page
    .getByTestId("search-results")
    .screenshot({ path: `${SHOTS}/01-relevance-default.png` });

  await page.getByTestId("search-sort").click();
  await waitForAnimations(page);
  await page.screenshot({ path: `${SHOTS}/02-sort-menu.png` });
  await page.getByTestId("search-sort-newest").click();
  await expect(page.getByText("Newest first", { exact: true })).toBeVisible();
  await expect(messageRows(page).first()).toContainText("#599");
  await expect(messageRows(page).nth(39)).toContainText("#560");
  await waitForAnimations(page);
  await page
    .getByTestId("search-results")
    .screenshot({ path: `${SHOTS}/03-newest.png` });

  // Page boundary: the next rows continue without a gap or a repeat.
  await page.getByTestId("search-show-more").click();
  await expect(messageRows(page)).toHaveCount(80);
  await expect(messageRows(page).nth(39)).toContainText("#560");
  await expect(messageRows(page).nth(40)).toContainText("#559");
  await expect(messageRows(page).nth(79)).toContainText("#520");

  await chooseSort(page, "oldest");
  await expect(page.getByText("Oldest first", { exact: true })).toBeVisible();
  await expect(messageRows(page)).toHaveCount(40);
  await expect(messageRows(page).first()).toContainText("#0");
});

test("a relay advertising buzz-search-sort orders newest in one request", async ({
  page,
}) => {
  await installMockBridge(page);
  await page.route("**/info", (route) =>
    route.fulfill({
      json: { supported_extensions: ["buzz-search-sort"] },
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  await openDeepHistorySearch(page);
  const before = (await payloads(page)).length;
  await chooseSort(page, "newest");
  await expect(messageRows(page).first()).toContainText("#599");
  const sent = (await payloads(page)).slice(before);
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ sort: "newest", limit: 41 });
});

test("the chosen sort is remembered after a reload", async ({ page }) => {
  await installMockBridge(page);
  await openDeepHistorySearch(page);
  await chooseSort(page, "newest");
  await expect(messageRows(page).first()).toContainText("#599");
  await page.reload();
  await page.getByTestId("open-search").click();
  await expect(page.getByTestId("search-sort")).toHaveText("Sort: Newest");
});

test("filter controls write operators into the query and narrow results", async ({
  page,
}) => {
  await installMockBridge(page);
  await openDeepHistorySearch(page);
  const input = page.getByTestId("search-dialog-input");

  await page.getByTestId("search-filter-from").click();
  await page.getByTestId("search-filter-from-input").fill("alice");
  await waitForAnimations(page);
  await page.screenshot({ path: `${SHOTS}/04-from-picker.png` });
  await page
    .locator('button[data-testid^="search-filter-from-"]')
    .filter({ hasText: "alice" })
    .first()
    .click();
  await expect(input).toHaveValue(/^deep history message from:@alice $/);
  await expect(input).toBeFocused();
  await expect(messageRows(page).nth(1)).toContainText("#2");

  await page.getByTestId("search-filter-in").click();
  await page.getByTestId("search-filter-in-input").fill("general");
  await page
    .getByTestId("search-filter-in-9a1657ac-f7aa-5db0-b632-d8bbeb6dfb50")
    .click();
  await expect(input).toHaveValue(/in:#general $/);
  await expect(page.getByTestId("search-results")).toContainText("No matches");
  await page.getByTestId("search-filter-in-clear").click();
  await expect(input).not.toHaveValue(/in:/);
  await expect(messageRows(page)).toHaveCount(40);

  await page.getByTestId("search-filter-date").click();
  await page.getByTestId("search-filter-date-first").fill("2026-01-05");
  await page.getByTestId("search-filter-date-last").fill("2026-01-09");
  // `before:` is exclusive, so "through" the 9th is written as the 10th.
  await expect(input).toHaveValue(/after:2026-01-05 before:2026-01-10/);
  await expect(page.getByTestId("search-filter-date")).toContainText(
    "2026-01-05 – 2026-01-09",
  );
  await waitForAnimations(page);
  await page.screenshot({ path: `${SHOTS}/05-date-range.png` });

  // Escape closes the popover, not the search.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("search-filter-date-first")).toHaveCount(0);
  await expect(page.getByTestId("search-results")).toBeVisible();
  await page.getByTestId("search-filter-date-clear").click();
  await expect(input).toHaveValue(/^deep history message from:@alice$/);

  await input.fill("from:@alice");
  await expect(page.getByTestId("search-results")).toContainText(
    "Add a word to search",
  );
});

test("controls work by keyboard", async ({ page }) => {
  await installMockBridge(page);
  await openDeepHistorySearch(page);
  await page.getByTestId("search-sort").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("search-sort-relevance")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("search-sort-newest")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("search-sort")).toHaveText("Sort: Newest");
  await expect(messageRows(page).first()).toContainText("#599");
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByTestId("search-filter-date")).toBeFocused();
});

test("searching and sorting never mark a channel read", async ({ page }) => {
  await installMockBridge(page);
  await page.goto("/");
  // Seeded unread: general holds an unread mention.
  const unread = page.locator(
    '[data-testid^="channel-unread"][data-testid$="-general"]',
  );
  await expect(unread).toHaveCount(1);
  const before = await unread.textContent();

  await page.getByTestId("open-search").click();
  await page.getByTestId("search-dialog-input").fill("welcome");
  await expect(messageRows(page).first()).toContainText("Welcome to #general");
  await chooseSort(page, "newest");
  await expect(page.getByText("Newest first", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("search-results")).toHaveCount(0);
  await expect(unread).toHaveCount(1);
  expect(await unread.textContent()).toBe(before);
});
