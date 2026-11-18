import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test, { after } from "node:test";
import { JSDOM } from "jsdom";
const dom = new JSDOM();
globalThis.document = dom.window.document;
after(() => dom.window.close());
import {
  pageHead,
  validatePage,
  PAGE_MAX_BYTES,
  assemblePage,
  splitPageHtml,
} from "./model.ts";
import { pageDocument, pageExternalLink } from "./sandbox.ts";
const publication = "00000000-0000-4000-8000-000000000000";
const event = (
  id,
  pubkey,
  created_at,
  html = "hello",
  channel = "c",
  slot = "buzz-page:page",
) => ({
  id,
  pubkey,
  created_at,
  kind: 40004,
  tags: [
    ["h", channel],
    ["d", slot],
    ["e", "b54af358b595b466bdb36d30cc7f2d32385aaeb5731674dc557a030c234ea7d1"],
  ],
  content: JSON.stringify({
    type: "buzz.page",
    version: 1,
    page: "page",
    publication,
    chunks: html ? ["a".repeat(64)] : [],
    bytes: new TextEncoder().encode(html).byteLength,
  }),
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
  const { srcDoc: document } = pageDocument(
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

test("contents comes from sanitized headings with stable unique anchors and bounded labels", () => {
  const html =
    '<div id="hello-1"></div><h1> Hello <em>world</em> </h1>' +
    '<h2 id="author-id"> Hello <script>hidden</script></h2><h3 id="author-id">Hello</h3>' +
    "<h4>Excluded</h4><h3> </h3><template><h1>Inert</h1></template>" +
    `<h2>${"x".repeat(200)}</h2>` +
    "<h2>Repeated</h2>".repeat(210);
  const { headings, srcDoc } = pageDocument(html);
  assert.equal(headings.length, 200);
  assert.equal(new Set(headings.map(({ id }) => id)).size, 200);
  assert.deepEqual(headings.slice(0, 3), [
    { id: "hello-world-1", level: 1, text: "Hello world" },
    { id: "author-id", level: 2, text: "Hello" },
    { id: "hello-2", level: 3, text: "Hello" },
  ]);
  assert.equal(headings[3].text.length, 120);
  assert.match(srcDoc, /<h3 id="hello-2">Hello<\/h3>/);
  assert.deepEqual(pageDocument(html), { srcDoc, headings });
});

test("link bridge hash stays synchronized with child and native parent CSP", () => {
  const { srcDoc: html } = pageDocument("<p>Page</p>");
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

test("hosted chunks round-trip boundary UTF-8 and reject missing or cross-author chunks", () => {
  for (const html of ["a" + "é🙂".repeat(80000), "\0".repeat(PAGE_MAX_BYTES)]) {
    const parts = splitPageHtml(html);
    assert.equal(parts.join(""), html);
    const chunks = parts.map((part, index) => ({
      id: (index + 1).toString(16).padStart(64, "0"),
      kind: 40004,
      pubkey: "alice",
      tags: [
        ["h", "c"],
        ["d", `buzz-page:chunk:${publication}:${index}`],
      ],
      content: JSON.stringify({
        type: "buzz.page.chunk",
        version: 1,
        page: "page",
        publication,
        index,
        html: part,
      }),
    }));
    const root = event("head", "alice", 1, html);
    root.content = JSON.stringify({
      ...JSON.parse(root.content),
      chunks: chunks.map((e) => e.id),
    });
    assert.equal(assemblePage(root, [...chunks].reverse(), "c"), html);
    assert.throws(() => assemblePage(root, chunks.slice(1), "c"), /missing/);
    assert.throws(
      () =>
        assemblePage(
          root,
          [{ ...chunks[0], pubkey: "mallory" }, ...chunks.slice(1)],
          "c",
        ),
      /author/,
    );
    assert.ok(
      chunks.every(
        (e) => new TextEncoder().encode(e.content).byteLength < 256 * 1024,
      ),
    );
  }
});
