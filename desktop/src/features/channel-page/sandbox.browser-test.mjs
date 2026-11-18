// Run with node --experimental-strip-types. Requires sandboxed Chrome on Linux.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { chromium } from "@playwright/test";
const browser = await chromium.launch({
  executablePath: process.env.BUZZ_CHROME_PATH ?? "/opt/google/chrome/chrome",
  chromiumSandbox: true,
});
try {
  const page = await browser.newPage();
  const requests = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.setContent('<iframe sandbox="allow-scripts"></iframe>');
  const html = `<meta http-equiv="refresh" content="0;url=https://escape.invalid/meta"><h1>Offline Page</h1><svg width="150" height="40"><a href="#safe"><text x="0" y="20">Animated link</text><animate attributeName="href" values="https://escape.invalid/animated" dur="1ms" fill="freeze"/></a></svg><span id="safe">Safe fragment</span><details><summary>Expand</summary>Native interaction</details><a href="https://example.com/path">External</a><img src="https://escape.invalid/image"><iframe src="https://escape.invalid/frame"></iframe><script>location='https://escape.invalid/script';fetch('https://escape.invalid/fetch');parent.document.body.innerHTML='escaped'</script><button onclick="location='https://escape.invalid/handler'">Try script</button><h2 id="destination" style="margin:100vh 0">Destination</h2><style>body{background-image:url('https://escape.invalid/style')}</style>`;
  const js = stripTypeScriptTypes(
    await readFile(new URL("./sandbox.ts", import.meta.url), "utf8"),
  );
  const srcdoc = await page.evaluate(
    async ({ js, html }) => {
      const url = URL.createObjectURL(
        new Blob([js], { type: "text/javascript" }),
      );
      const { pageDocument } = await import(url);
      URL.revokeObjectURL(url);
      return pageDocument(html).srcDoc;
    },
    { js, html },
  );
  const config = JSON.parse(
    await readFile(
      new URL("../../../src-tauri/tauri.conf.json", import.meta.url),
      "utf8",
    ),
  );
  // srcdoc inherits the parent's CSP as well as its own. Exercise the actual
  // native policy in Chrome; this does not assert WebKit/native qualification.
  await page.setContent(
    `<meta http-equiv="Content-Security-Policy" content="${config.app.security.csp}"><iframe sandbox="allow-scripts"></iframe>`,
  );
  await page.evaluate((srcdoc) => {
    window.links = [];
    window.addEventListener("message", (e) => window.links.push(e.data));
    document.querySelector("iframe").srcdoc = srcdoc;
  }, srcdoc);
  const frame = page.frameLocator("iframe");
  await frame.getByRole("heading", { name: "Offline Page" }).waitFor();
  await frame.getByRole("button", { name: "Try script" }).click();
  await frame.getByText("Expand", { exact: true }).click();
  assert.equal(await frame.locator("details").getAttribute("open"), "");
  await frame.getByText("Animated link", { exact: true }).click();
  await frame.getByText("External", { exact: true }).click();
  await page.waitForFunction(() => window.links.length > 0);
  assert.equal(
    (await page.evaluate(() => window.links))[0].href,
    "https://example.com/path",
  );
  assert.equal(
    await page.locator("iframe").getAttribute("sandbox"),
    "allow-scripts",
  );
  assert.ok(!(await page.content()).includes(">escaped<"));
  assert.deepEqual(
    requests.filter((u) => u.startsWith("http")),
    [],
  );
  await page.locator("iframe").evaluate((iframe) => {
    iframe.contentWindow.postMessage(
      { type: "buzz-page-scroll", id: "destination" },
      "*",
    );
  });
  await frame.locator("#destination").evaluate(async (target) => {
    const start = performance.now();
    while (Math.abs(target.getBoundingClientRect().top) > 2) {
      if (performance.now() - start > 2000)
        throw new Error("Heading was not reached");
      await new Promise(requestAnimationFrame);
    }
  });
  if (process.env.BUZZ_PAGE_SCREENSHOT)
    await page.screenshot({ path: process.env.BUZZ_PAGE_SCREENSHOT });
  console.log(
    "PASS: production srcdoc under native parent CSP in sandboxed Chrome: no HTTP/navigation; native details and external-link bridge work; author scripts/handlers blocked",
  );
} finally {
  await browser.close();
}
