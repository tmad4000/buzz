import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test, { after } from "node:test";
import { JSDOM } from "jsdom";
const dom = new JSDOM();
globalThis.document = dom.window.document;
after(() => dom.window.close());
import { pageHead, validatePage, PAGE_MAX_BYTES } from "./model.ts";
import { pageDocument, pageExternalLink } from "./sandbox.ts";
const event = (
  id,
  pubkey,
  created_at,
  content = "hello",
  channel = "c",
  slot = "page",
) => ({
  id,
  pubkey,
  created_at,
  content,
  kind: 40101,
  tags: [
    ["h", channel],
    ["d", slot],
  ],
});
test("one shared head across authors, deterministic ties, channel and slot isolation", () => {
  const edits = [
    event("b", "alice", 1),
    event("c", "bob", 2),
    event("a", "alice", 2),
    event("d", "bob", 9, "bad", "other"),
    event("e", "bob", 10, "future", "c", "next"),
  ];
  for (const order of [edits, [...edits].reverse()])
    assert.equal(pageHead(order, "c").id, "a");
  assert.equal(pageHead(edits, "absent"), null);
});
test("size cap counts UTF-8 bytes, accepts boundary and rejects oversized incoming content", () => {
  validatePage("a".repeat(PAGE_MAX_BYTES));
  assert.throws(
    () => validatePage("é".repeat(PAGE_MAX_BYTES / 2 + 1)),
    /512 KiB/,
  );
  assert.equal(
    pageHead([event("a", "alice", 1, "a".repeat(PAGE_MAX_BYTES + 1))], "c"),
    null,
  );
});
test("policy precedes hostile markup and link requests allow only external HTTP(S)", () => {
  const document = pageDocument(
    '<meta http-equiv="Content-Security-Policy" content="default-src *"><script>fetch("https://bad.test")</script>',
  );
  assert.ok(document.includes("default-src 'none'"));
  assert.ok(!document.includes("default-src *"));
  assert.ok(!document.includes("fetch("));
  for (const url of [
    "javascript:alert(1)",
    "file:///etc/passwd",
    "data:text/html,x",
    "https://user:pass@example.com",
    {},
    null,
  ])
    assert.equal(pageExternalLink(url), null);
  assert.equal(
    pageExternalLink("https://example.com/path"),
    "https://example.com/path",
  );
});

test("link bridge hash stays synchronized with child and native parent CSP", () => {
  const html = pageDocument("<p>Page</p>");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const hash = `sha256-${createHash("sha256").update(script).digest("base64")}`;
  assert.ok(html.includes(hash));
  const config = JSON.parse(
    readFileSync(
      new URL("../../../src-tauri/tauri.conf.json", import.meta.url),
      "utf8",
    ),
  );
  assert.ok(config.app.security.csp.includes(hash));
});
