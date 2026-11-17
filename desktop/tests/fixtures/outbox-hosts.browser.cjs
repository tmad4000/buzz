const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { chromium, expect: baseExpect } = require("@playwright/test");
const expect = baseExpect.configure({ timeout: 45000 });
const owner = process.env.BUZZ_OUTBOX_EVIDENCE;
const origin = process.env.BUZZ_HOST_FIXTURE_ORIGIN;
if (!owner || !origin)
  throw new Error("Set task evidence directory and task-owned Vite origin");
const profile = path.join(owner, `browser-profile-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });
const serverState = {
  hold: true,
  offline: false,
  loseAck: false,
  uploads: [],
  events: new Map(),
  pending: [],
};
const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  if (serverState.offline) {
    res.writeHead(503);
    res.end("offline");
    return;
  }
  if (req.url.startsWith("/lookup?")) {
    const id = new URL(req.url, "http://test").searchParams.get("id");
    const found = [...serverState.events.values()].find((event) =>
      event.tags.some((tag) => tag[0] === "client_msg_id" && tag[1] === id),
    );
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(found ?? null));
    return;
  }
  if (req.url === "/upload") {
    serverState.uploads.push(
      crypto.createHash("sha256").update(body).digest("hex"),
    );
    const reply = () => {
      if (res.destroyed) return;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          url: `http://localhost:3000/media/${"a".repeat(64)}.png`,
          sha256: "a".repeat(64),
          size: body.length,
          type: "image/png",
          uploaded: 1,
          filename: "restart-photo.png",
        }),
      );
    };
    if (serverState.hold) serverState.pending.push(reply);
    else reply();
    return;
  }
  if (req.url === "/events") {
    const event = JSON.parse(body);
    serverState.events.set(event.id, event);
    if (serverState.loseAck) {
      res.writeHead(503);
      res.end("ack unavailable after acceptance");
      return;
    }
    res.end("accepted");
    return;
  }
  res.writeHead(404);
  res.end();
});
async function listen() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const port = 7000 + crypto.randomInt(3000);
    try {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => {
          server.removeListener("error", reject);
          resolve();
        });
      });
      return port;
    } catch (error) {
      if (error.code !== "EADDRINUSE") throw error;
    }
  }
  throw new Error("No task-owned relay port available");
}
let context;
async function launch(relayOrigin) {
  context = await chromium.launchPersistentContext(profile, {
    chromiumSandbox: true,
    headless: true,
    viewport: { width: 1900, height: 1100 },
    executablePath: process.env.BUZZ_CHROME_PATH,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error")
      fs.appendFileSync(
        path.join(owner, "browser-console.log"),
        message.text() + "\n",
      );
  });
  await page.goto(
    `${origin}/tests/fixtures/full-conversation-hosts.html?outbox&outboxRelay=${encodeURIComponent(relayOrigin)}`,
  );
  await expect(
    page
      .locator('[data-conversation-view="a"]')
      .getByTestId("message-thread-panel"),
  ).toContainText("Release plan for pane A");
  return { page, errors };
}
async function killBrowser() {
  const browser = context.browser();
  const cdp = await browser.newBrowserCDPSession();
  const result = await cdp.send("SystemInfo.getProcessInfo");
  const processInfo = result.processInfo.find((p) => p.type === "browser");
  fs.writeFileSync(
    path.join(owner, "killed-browser.json"),
    JSON.stringify({
      pid: processInfo.id,
      owner: "buzz-outbox",
      source: "0e891f22 + working diff",
      profile,
      killedAt: new Date().toISOString(),
    }),
  );
  process.kill(processInfo.id, "SIGKILL");
  await new Promise((resolve) =>
    browser.isConnected() ? browser.once("disconnected", resolve) : resolve(),
  );
  context = undefined;
}
async function waitFor(fn) {
  await expect.poll(fn).toBeTruthy();
}
(async () => {
  const port = await listen();
  const relayOrigin = `http://127.0.0.1:${port}`;
  fs.writeFileSync(
    path.join(owner, "test-relay-service.json"),
    JSON.stringify({
      owner: "buzz-outbox",
      pid: process.pid,
      start: new Date().toISOString(),
      source: "0e891f22 + working diff",
      port,
      routes: ["POST /upload", "POST /events"],
      teardown: "finally closes server and browser",
    }),
  );
  try {
    let { page, errors } = await launch(relayOrigin);
    console.log("loaded production conversation hosts");
    const pane = page.locator('[data-conversation-view="a"]');
    const thread = pane.getByTestId("message-thread-panel");
    const editor = thread.locator('[contenteditable="true"]').last();
    await editor.fill("Survives process death during image upload");
    const chooserEvent = page.waitForEvent("filechooser");
    await thread
      .getByRole("button", { name: "Attach file", exact: true })
      .click();
    const chooser = await chooserEvent;
    await chooser.setFiles({
      name: "restart-photo.png",
      mimeType: "image/png",
      buffer: Buffer.from("durable original image bytes"),
    });
    await expect(thread.getByTestId("send-message")).toBeEnabled();
    await thread.getByTestId("send-message").click();
    console.log("submitted image message");
    await expect(
      thread.getByRole("article", { name: "Queued message" }),
    ).toContainText("Survives process death");
    await expect(thread.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "40",
    );
    await expect(
      page.getByText("1 waiting to send", { exact: true }),
    ).toBeVisible();
    await editor.fill("Second message remains behind the upload");
    await expect(thread.getByTestId("send-message")).toBeEnabled();
    await thread.getByTestId("send-message").click();
    await expect(
      page.getByText("2 waiting to send", { exact: true }),
    ).toBeVisible();
    assert.equal(
      serverState.events.size,
      0,
      "FIFO: text cannot overtake pending upload",
    );
    await page.screenshot({
      path: path.join(owner, "sending-before-upload.png"),
      fullPage: true,
    });
    await waitFor(() => serverState.uploads.length === 1);
    await killBrowser();
    console.log("SIGKILL during upload");
    serverState.hold = false;
    for (const reply of serverState.pending.splice(0)) reply();
    ({ page, errors } = await launch(relayOrigin));
    await waitFor(() => serverState.events.size === 2);
    console.log("restart delivered FIFO pair");
    assert.equal(serverState.uploads.length, 2);
    assert.equal(
      serverState.uploads[0],
      serverState.uploads[1],
      "same durable bytes after SIGKILL",
    );
    const sent = [...serverState.events.values()];
    assert.ok(sent[0].content.includes("Survives process death"));
    assert.ok(sent[1].content.includes("Second message"));
    assert.ok(
      sent.every((event) =>
        event.tags.some(
          (tag) =>
            tag[0] === "e" && tag[1] === "1".repeat(64) && tag[3] === "root",
        ),
      ),
      "captured thread survives restart",
    );
    await waitFor(() =>
      page.evaluate(() => window.outboxFixtureSnapshot().length === 0),
    );
    // Offline-then-online uses the production error/backoff path.
    serverState.offline = true;
    const currentThread = page
      .locator('[data-conversation-view="a"]')
      .getByTestId("message-thread-panel");
    await currentThread
      .locator('[contenteditable="true"]')
      .last()
      .fill("Offline text survives restart");
    await currentThread.getByTestId("send-message").click();
    await expect(
      currentThread.getByRole("article", { name: "Queued message" }),
    ).toContainText("Waiting to send");
    await waitFor(() =>
      page.evaluate(() =>
        window
          .outboxFixtureSnapshot()
          .some(
            (row) =>
              row.message.content === "Offline text survives restart" &&
              row.state === "waiting" &&
              Boolean(row.error) &&
              Boolean(row.signedEvent) &&
              row.deliveryUncertain,
          ),
      ),
    );
    await killBrowser();
    serverState.offline = false;
    ({ page, errors } = await launch(relayOrigin));
    await waitFor(() => serverState.events.size === 3);
    assert.equal(
      await page.evaluate(
        () =>
          window.outboxFixtureLog.filter(
            (entry) => entry.command === "send_channel_message",
          ).length,
      ),
      0,
      "offline retry retains its committed signature",
    );
    // Relay accepts, then the acknowledgement is lost and the browser dies.
    serverState.loseAck = true;
    const finalThread = page
      .locator('[data-conversation-view="a"]')
      .getByTestId("message-thread-panel");
    await finalThread
      .locator('[contenteditable="true"]')
      .last()
      .fill("Exactly once after lost acknowledgement");
    await finalThread.getByTestId("send-message").click();
    await waitFor(() => serverState.events.size === 4);
    await expect(
      finalThread.getByRole("article", { name: "Queued message" }),
    ).toContainText("Waiting to send");
    await waitFor(() =>
      page.evaluate(() =>
        window
          .outboxFixtureSnapshot()
          .some(
            (row) =>
              row.message.content ===
                "Exactly once after lost acknowledgement" &&
              row.state === "waiting" &&
              Boolean(row.error) &&
              Boolean(row.signedEvent),
          ),
      ),
    );
    await killBrowser();
    serverState.loseAck = false;
    ({ page, errors } = await launch(relayOrigin));
    await waitFor(() =>
      page.evaluate(
        () =>
          window.outboxFixtureLog.some(
            (entry) => entry.command === "find_queued_message",
          ) && window.outboxFixtureSnapshot().length === 0,
      ),
    );
    assert.equal(
      serverState.events.size,
      4,
      "stable id prevents a second server event",
    );
    assert.equal(
      await page.evaluate(
        () =>
          window.outboxFixtureLog.filter(
            (entry) => entry.command === "send_channel_message",
          ).length,
      ),
      0,
      "accepted receipt does not re-sign after restart",
    );
    // A failed upload retains editable text and raw bytes; a later pending
    // message can be deleted without waiting for its conversation head.
    serverState.offline = true;
    const recoveryThread = page
      .locator('[data-conversation-view="a"]')
      .getByTestId("message-thread-panel");
    await recoveryThread
      .locator('[contenteditable="true"]')
      .last()
      .fill("Original failed caption");
    const recoveryChooser = page.waitForEvent("filechooser");
    await recoveryThread
      .getByRole("button", { name: "Attach file", exact: true })
      .click();
    await (await recoveryChooser).setFiles({
      name: "edit-photo.png",
      mimeType: "image/png",
      buffer: Buffer.from("edit preserved bytes"),
    });
    await recoveryThread.getByTestId("send-message").click();
    await waitFor(() =>
      page.evaluate(() =>
        window
          .outboxFixtureSnapshot()
          .some(
            (row) =>
              row.message.content === "Original failed caption" &&
              row.state === "waiting" &&
              Boolean(row.error) &&
              !row.signedEvent,
          ),
      ),
    );
    const failedId = await page.evaluate(
      () =>
        window
          .outboxFixtureSnapshot()
          .find((row) => row.message.content === "Original failed caption").id,
    );
    const failed = recoveryThread.locator(`[data-outbox-id="${failedId}"]`);
    await failed.getByRole("button", { name: "Edit", exact: true }).click();
    const editInput = failed.locator('[contenteditable="true"]').first();
    await expect(editInput).toContainText("Original failed caption");
    await editInput.fill("Edited durable caption");
    await failed.getByTestId("send-message").click();
    await waitFor(() =>
      page.evaluate(() =>
        window
          .outboxFixtureSnapshot()
          .some(
            (row) =>
              row.message.content === "Edited durable caption" &&
              row.attachments.length === 1 &&
              row.state === "waiting",
          ),
      ),
    );
    await recoveryThread
      .locator('[contenteditable="true"]')
      .last()
      .fill("Delete this waiting message");
    await recoveryThread.getByTestId("send-message").click();
    const disposable = recoveryThread
      .getByRole("article", { name: "Queued message" })
      .filter({ hasText: "Delete this waiting message" });
    await disposable
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await expect(disposable).toHaveCount(0);
    assert.equal(
      serverState.events.size,
      4,
      "no offline recovery message was published",
    );
    await page.screenshot({
      path: path.join(owner, "edited-outbox-recovery.png"),
      fullPage: true,
    });
    serverState.offline = false;
    await recoveryThread
      .getByRole("article", { name: "Queued message" })
      .filter({ hasText: "Edited durable caption" })
      .getByRole("button", { name: "Retry", exact: true })
      .click();
    await waitFor(() => serverState.events.size === 5);
    const edited = [...serverState.events.values()].at(-1);
    assert.ok(edited.content.startsWith("Edited durable caption"));
    assert.equal(
      serverState.uploads.at(-1),
      crypto.createHash("sha256").update("edit preserved bytes").digest("hex"),
    );
    assert.ok(
      ![...serverState.events.values()].some((event) =>
        event.content.includes("Delete this waiting message"),
      ),
    );
    assert.deepEqual(errors, []);
    await page.screenshot({
      path: path.join(owner, "outbox-recovered.png"),
      fullPage: true,
    });
    fs.writeFileSync(
      path.join(owner, "browser-outcomes.json"),
      JSON.stringify(
        {
          killRestartMidUpload: true,
          offlineThenOnline: true,
          lostAckRestart: true,
          fifo: true,
          capturedThread: true,
          durableBytes: true,
          retryEditDelete: true,
          eventCount: serverState.events.size,
        },
        null,
        2,
      ),
    );
    console.log(
      "PASS: production composer, IndexedDB, SIGKILL/restart mid-upload, FIFO, offline-online, stable id after lost acknowledgement",
    );
  } catch (error) {
    if (context) {
      const page = context.pages().at(-1);
      if (page) {
        fs.writeFileSync(
          path.join(owner, "browser-failure-dom.html"),
          await page.content().catch(() => "unavailable"),
        );
        fs.writeFileSync(
          path.join(owner, "browser-failure-state.json"),
          JSON.stringify(
            await page
              .evaluate(async () => {
                return {
                  commands: window.outboxFixtureLog,
                  rows: window.outboxFixtureSnapshot().map((row) => ({
                    ...row,
                    attachments: row.attachments.map((a) => ({
                      name: a.name,
                      size: a.bytes.size,
                      descriptor: a.descriptor,
                    })),
                  })),
                  error: window.outboxFixtureError(),
                  body: document.body.innerText,
                };
              })
              .catch((error) => ({ error: String(error) })),
            null,
            2,
          ),
        );
        await page
          .screenshot({ path: path.join(owner, "browser-failure.png") })
          .catch(() => {});
      }
    }
    fs.writeFileSync(
      path.join(owner, "browser-failure-server.json"),
      JSON.stringify(
        {
          events: [...serverState.events.values()],
          uploads: serverState.uploads,
        },
        null,
        2,
      ),
    );
    throw error;
  } finally {
    if (context) await context.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
